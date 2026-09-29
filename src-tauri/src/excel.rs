//! Excel 读写命令（重构方案A Phase 5：重计算下沉 Rust）
//!
//! - read_workbook：calamine 解析 → 输出 SheetJS WorkBook 兼容结构
//!   （SheetNames + Sheets 的 A1 寻址单元格矩阵），前端 excelParser 逻辑无感切换
//! - export_xlsx：rust_xlsxwriter 把二维数组直接写盘，替代前端主线程 SheetJS 导出

use calamine::{open_workbook_auto, Data as CellData, Reader};
use serde_json::{json, Map, Value};

/// 将 0 基列索引编码为 Excel 列名（0→A, 25→Z, 26→AA）
fn column_name(mut col: u32) -> String {
    let mut bytes = Vec::new();
    loop {
        bytes.push(b'A' + (col % 26) as u8);
        if col < 26 {
            break;
        }
        col = col / 26 - 1;
    }
    bytes.reverse();
    String::from_utf8(bytes).unwrap_or_default()
}

/// calamine 单元格 → SheetJS 单元格（{v, t}；t: s/n/b/e）
fn cell_to_json(data: &CellData) -> Option<Value> {
    let (v, t) = match data {
        CellData::Empty => return None,
        CellData::String(s) => (Value::String(s.clone()), "s"),
        CellData::Float(f) => (json!(f), "n"),
        CellData::Int(i) => (json!(i), "n"),
        CellData::Bool(b) => (json!(b), "b"),
        // Excel 日期序列数，与 SheetJS 默认行为（cellDates:false）一致
        CellData::DateTime(dt) => (json!(dt.as_f64()), "n"),
        CellData::DateTimeIso(s) => (Value::String(s.clone()), "s"),
        CellData::DurationIso(s) => (Value::String(s.clone()), "s"),
        CellData::Error(e) => (Value::String(e.to_string()), "e"),
    };
    Some(json!({ "v": v, "t": t }))
}

fn read_workbook_blocking(path: String) -> Result<Value, String> {
    let mut workbook = open_workbook_auto(&path).map_err(|e| format!("无法打开文件: {e}"))?;
    let names = workbook.sheet_names().to_vec();
    let mut sheets = Map::new();

    for name in &names {
        let mut sheet_map = Map::new();
        if let Ok(range) = workbook.worksheet_range(name) {
            if let Some((start_row, start_col)) = range.start() {
                if let Some((end_row, end_col)) = range.end() {
                    if end_row >= start_row && end_col >= start_col {
                        sheet_map.insert(
                            "!ref".into(),
                            Value::String(format!(
                                "{}{}:{}{}",
                                column_name(start_col),
                                start_row + 1,
                                column_name(end_col),
                                end_row + 1
                            )),
                        );
                    }
                }
                for (row_offset, row) in range.rows().enumerate() {
                    for (col_offset, cell) in row.iter().enumerate() {
                        if let Some(cell_json) = cell_to_json(cell) {
                            let addr = format!(
                                "{}{}",
                                column_name(start_col + col_offset as u32),
                                start_row + row_offset as u32 + 1
                            );
                            sheet_map.insert(addr, cell_json);
                        }
                    }
                }
            }
        }
        sheets.insert(name.clone(), Value::Object(sheet_map));
    }

    Ok(json!({ "SheetNames": names, "Sheets": sheets }))
}

/// 读取 Excel（xlsx/xls/ods 自动识别），返回 SheetJS WorkBook 兼容 JSON
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
