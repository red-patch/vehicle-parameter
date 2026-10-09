//! Excel 读写命令（重构方案A Phase 5：重计算下沉 Rust）
//!
//! - read_workbook：calamine 解析 → 按 sheet 输出行数组（AOA）载荷
//!   （`sheetNames` + 每 sheet 的 `rows`/`totalRows`/`totalCols`）。空单元格保留为
//!   null，列位不塌缩——A1 寻址矩阵（含 `!ref`）已退役（P2-4）。
//! - export_xlsx：rust_xlsxwriter 把二维数组直接写盘，替代前端主线程 SheetJS 导出

use calamine::{open_workbook_auto, Data as CellData, Range, Reader};
use serde_json::{json, Map, Value};

/// calamine 单元格 → 直接 JSON 值。
///
/// 数值语义与旧 `{v,t}` SheetJS 单元格一致（消费者只读 `.v`）：
/// String→string，Float/Int/DateTime→number（Excel 日期序列数，同 SheetJS cellDates:false），
/// Bool→bool，DateTimeIso/DurationIso→string，Error→其字符串形式。
///
/// `Empty` 映射为 `Null`（而非丢弃）：`Range::rows()` 按 `width()` 分块，每行已是满宽，
/// 空单元格必须占位，否则其后列整体左移。
fn cell_to_json(data: &CellData) -> Value {
    match data {
        CellData::Empty => Value::Null,
        CellData::String(s) => Value::String(s.clone()),
        CellData::Float(f) => json!(f),
        CellData::Int(i) => json!(i),
        CellData::Bool(b) => json!(b),
        CellData::DateTime(dt) => json!(dt.as_f64()),
        CellData::DateTimeIso(s) => Value::String(s.clone()),
        CellData::DurationIso(s) => Value::String(s.clone()),
        CellData::Error(e) => Value::String(e.to_string()),
    }
}

/// 单行单元格 → JSON 值数组。
///
/// calamine 的 `Range::rows()` 已按 `width()` 分块，故 `row` 是满宽的，逐格映射即可。
/// 单独抽出纯函数以便单测「中间空单元格不塌缩列位」这一关键不变量。
fn row_to_json(row: &[CellData]) -> Vec<Value> {
    row.iter().map(cell_to_json).collect()
}

/// 单 sheet 的 `Range` → 行数组载荷（`{rows,totalRows,totalCols}`）。
///
/// 纯函数：不含 IO，可直接单测总量字段与行/列的对齐关系。
fn sheet_payload(range: &Range<CellData>) -> Value {
    let rows: Vec<Value> = range.rows().map(row_to_json).map(Value::Array).collect();
    // width() 即每行长度（rows() 按 width 分块，恒等宽；空 range 时为 0），
    // 直接取它而不是扫描各行求最大——把「行等宽」这个不变量写在脸上。
    json!({ "rows": rows, "totalRows": rows.len(), "totalCols": range.width() })
}

fn read_workbook_blocking(path: String) -> Result<Value, String> {
    let mut workbook = open_workbook_auto(&path).map_err(|e| format!("无法打开文件: {e}"))?;
    let names = workbook.sheet_names().to_vec();
    let mut sheets = Map::new();

    for name in &names {
        // 读取失败的 sheet → 空载荷（rows=[], totalRows/Cols=0），sheet 键仍照插。
        // 与旧行为一致（旧的空 map 同样照插）；消费者按 totalRows<2 给出「表格数据不足」。
        let range = workbook
            .worksheet_range(name)
            .unwrap_or_else(|_| Range::empty());
        sheets.insert(name.clone(), sheet_payload(&range));
    }

    Ok(json!({ "sheetNames": names, "sheets": sheets }))
}

/// 读取 Excel（xlsx/xls/ods 自动识别），返回按 sheet 的行数组（AOA）JSON
#[tauri::command]
pub async fn read_workbook(path: String) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || read_workbook_blocking(path))
        .await
        .map_err(|e| format!("解析任务失败: {e}"))?
}

fn export_xlsx_blocking(
    path: String,
    sheet_name: String,
    rows: Vec<Vec<Value>>,
    col_widths: Vec<f64>,
) -> Result<(), String> {
    use rust_xlsxwriter::{Workbook, XlsxError};

    let write_err = |e: XlsxError| e.to_string();
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();
    sheet.set_name(&sheet_name).map_err(write_err)?;

    for (row_idx, row) in rows.iter().enumerate() {
        for (col_idx, cell) in row.iter().enumerate() {
            let r = row_idx as u32;
            let c = col_idx as u16;
            match cell {
                Value::String(s) => {
                    sheet.write_string(r, c, s).map_err(write_err)?;
                }
                Value::Number(n) => {
                    sheet.write_number(r, c, n.as_f64().unwrap_or(0.0)).map_err(write_err)?;
                }
                Value::Bool(b) => {
                    sheet.write_boolean(r, c, *b).map_err(write_err)?;
                }
                Value::Null => continue,
                other => {
                    sheet.write_string(r, c, other.to_string()).map_err(write_err)?;
                }
            }
        }
    }
    for (col_idx, width) in col_widths.iter().enumerate() {
        sheet
            .set_column_width(col_idx as u16, *width)
            .map_err(write_err)?;
    }
    workbook.save(&path).map_err(write_err)?;
    Ok(())
}

/// 将二维数组（AOA）写出为 xlsx 文件（列宽单位与 SheetJS wch 近似等价）
#[tauri::command]
pub async fn export_xlsx(
    path: String,
    sheet_name: String,
    rows: Vec<Vec<Value>>,
    col_widths: Vec<f64>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        export_xlsx_blocking(path, sheet_name, rows, col_widths)
    })
    .await
    .map_err(|e| format!("导出任务失败: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use calamine::Cell;

    fn s(v: &str) -> CellData {
        CellData::String(v.to_string())
    }

    /// 中间空单元格不得塌缩列位：空单元格必须占位为 null，其后的列不左移。
    ///
    /// 这正是 `cell_to_json` 不再返回 `Option`（不丢弃 Empty）的原因——
    /// 丢弃任何一格都会让该行右侧整体左移，值被读进错误的列。
    #[test]
    fn middle_empty_cell_does_not_shift_columns() {
        // 用 from_sparse 造一个 1×3 的行，中间 (0,1) 缺格 → 应补成 Data::Empty
        let range = Range::from_sparse(vec![
            Cell::new((0, 0), s("A")),
            Cell::new((0, 2), s("C")),
        ]);
        // 先钉死 fixture 的前提：确实只有 2 个「有值」格，第 3 列是补出来的
        assert_eq!(range.used_cells().count(), 2);
        let payload = sheet_payload(&range);
        let rows = payload["rows"].as_array().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(
            rows[0],
            json!(["A", null, "C"]),
            "中间空格必须占位为 null，否则后续列整体左移"
        );
    }

    /// 纯 helper 层面的等价断言：直接喂含 Empty 的切片，验证不丢格。
    #[test]
    fn row_to_json_keeps_empty_as_null() {
        let row = vec![s("a1"), CellData::Empty, s("c1")];
        assert_eq!(row_to_json(&row), vec![json!("a1"), Value::Null, json!("c1")]);
    }

    /// 值类型映射语义（与旧 {v,t} 单元格的 `.v` 一致）。
    #[test]
    fn cell_conversion_semantics() {
        assert_eq!(cell_to_json(&CellData::Empty), Value::Null);
        assert_eq!(cell_to_json(&s("x")), json!("x"));
        assert_eq!(cell_to_json(&CellData::Float(1.5)), json!(1.5));
        assert_eq!(cell_to_json(&CellData::Int(42)), json!(42));
        assert_eq!(cell_to_json(&CellData::Bool(true)), json!(true));
        assert_eq!(cell_to_json(&CellData::DateTimeIso("2020-01-01".into())), json!("2020-01-01"));
        assert_eq!(cell_to_json(&CellData::DurationIso("PT1H".into())), json!("PT1H"));
        // DateTime 走 Excel 日期序列数（与 SheetJS cellDates:false 一致）
        assert_eq!(
            cell_to_json(&CellData::DateTime(calamine::ExcelDateTime::new(44197.0, calamine::ExcelDateTimeType::DateTime, false))),
            json!(44197.0)
        );
        // Error 取其字符串形式（与旧 {v,t} 的 .v 一致）
        assert_eq!(cell_to_json(&CellData::Error(calamine::CellErrorType::Div0)), json!("#DIV/0!"));
    }

    /// totalRows 等于行数；totalCols 等于行宽；每行等宽（rows() 按 width 分块）。
    #[test]
    fn totals_match_rows_and_width() {
        let range = Range::from_sparse(vec![
            Cell::new((0, 0), s("h1")),
            Cell::new((0, 1), s("h2")),
            Cell::new((1, 0), s("v1")),
            // (1,1) 缺格 → 占位 null，保证第二行同为 2 列
        ]);
        let payload = sheet_payload(&range);
        let rows = payload["rows"].as_array().unwrap();
        assert_eq!(payload["totalRows"], json!(rows.len()));
        let width = rows[0].as_array().unwrap().len();
        assert_eq!(payload["totalCols"], json!(width));
        assert!(rows.iter().all(|r| r.as_array().unwrap().len() == width));
    }
}
