//! 资产库元信息扫描命令（重构方案A Phase 5 延伸）
//!
//! 旧实现（assetManager.getAssetFilesWithInfo）在 JS 侧全量读取每个资产 JSON
//! 并在主线程 JSON.parse —— 资产库达数百文件/几十 MB 时，主线程被解析分片
//! 长时间阻塞，是页面切换卡顿的主因。此命令把「读文件 + 解析 + 统计」全部
//! 放到 Rust 线程池，只把轻量元信息（每文件约 200B）传回前端。

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Deserialize)]
struct AssetParam {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    group: Option<String>,
    #[serde(default)]
    value: serde_json::Value,
}

/// 真实资产文件是 camelCase（见 save_assets_batch 写入的形状与磁盘存量文件）。
/// 此前无 rename_all/alias，导致 productName/updatedAt/createdAt 三个字段**恒为 None**：
/// 列表里的时间戳从未渲染、ADR-0003「每车最新版」的 updatedAt 排序键失效、
/// 桌面列表排序回退到字典序。JS 兜底路径（assetManager.ts:285-286）读的是
/// parsed.productName，一直是对的——这里补齐使两条路径一致。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AssetFile {
    #[serde(default)]
    product_name: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
    #[serde(default)]
    created_at: Option<String>,
    #[serde(default)]
    parameters: Vec<AssetParam>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFileInfo {
    pub file_name: String,
    pub product_name: String,
    pub updated_at: Option<String>,
    pub total_params: usize,
    pub filled_params: usize,
    pub announce_nos: Vec<String>,
    pub vehicle_model: Option<String>,
    /// 数据级别（治理用）：参数中存在「准入信息」组 → 公告/准入级，否则开发/配置级
    pub has_admission_info: bool,
    /// 审批状态（治理用）：准入信息组里「审批状态」字段的值（已审核/驳回）
    pub approval_status: Option<String>,
    /// 整车生产企业/公告申报企业/企业名称 首个非空原文（受控属性派生，前端词表归一）
    pub manufacturer_raw: Option<String>,
    /// 动力电池包厂商原文（缺省回退单体生产企业）
    pub battery_brand_raw: Option<String>,
    /// 动力电池包电量（kWh）原文（可能带注记/多值，前端归一）
    pub capacity_raw: Option<String>,
    /// 产品等级标准原文
    pub admission_level_raw: Option<String>,
    /// 准入编号列表（ZR...，导入查重的判别信号：同公告号不同准入编号=不同车）
    pub admission_nos: Vec<String>,
}

/// 与前端 isAssetDataFile 对齐：.json 且不以 _ / custom_ 开头
/// pub：手机查看服务复用同一谓词（避免两处漂移）；`mobile.rs` 另有路径穿越防线
pub fn is_asset_data_file(name: &str) -> bool {
    name.ends_with(".json") && !name.starts_with('_') && !name.starts_with("custom_")
}

fn value_filled(v: &serde_json::Value) -> bool {
    match v {
        serde_json::Value::String(s) => !s.trim().is_empty(),
        serde_json::Value::Number(_) => true,
        serde_json::Value::Bool(_) => true,
        _ => false,
    }
}

fn scan_one(path: &Path, file_name: &str) -> Option<AssetFileInfo> {
    let content = std::fs::read_to_string(path).ok()?;
    let parsed: AssetFile = serde_json::from_str(&content).ok()?;

    const ANNOUNCE_NAME_KEYS: [&str; 5] = ["公告号", "产品号", "产品ID", "公告产品号", "产品编号"];

    let mut filled = 0usize;
    let mut announce_nos: Vec<String> = Vec::new();
    let mut vehicle_model: Option<String> = None;
    let mut has_admission_info = false;
    let mut approval_status: Option<String> = None;
    // 受控属性派生（原文，前端按词表归一）：主机厂三源按优先级取
    let mut mfr_build: Option<String> = None; // 整车生产企业
    let mut mfr_declare: Option<String> = None; // 公告申报企业
    let mut mfr_company: Option<String> = None; // 企业名称
    let mut battery_pkg: Option<String> = None; // 动力电池包厂商
    let mut battery_cell: Option<String> = None; // 动力电池单体生产企业
    let mut capacity_raw: Option<String> = None;
    let mut admission_level_raw: Option<String> = None;
    let mut admission_nos: Vec<String> = Vec::new();

    let value_as_text = |v: &serde_json::Value| -> Option<String> {
        match v {
            serde_json::Value::String(s) => {
                let t = s.trim();
                if t.is_empty() { None } else { Some(t.to_string()) }
            }
            serde_json::Value::Number(n) => Some(n.to_string()),
            _ => None,
        }
    };

    for p in &parsed.parameters {
        if value_filled(&p.value) {
            filled += 1;
        }
        // 数据级别：只要出现「准入信息」参数组即视为公告/准入级
        if !has_admission_info {
            if let Some(group) = p.group.as_deref() {
                if group.contains("准入") {
                    has_admission_info = true;
                }
            }
        }
        let Some(name) = p.name.as_deref() else { continue };

        // 审批状态：取第一个非空值
        if approval_status.is_none() && name == "审批状态" {
            if let Some(v) = p.value.as_str() {
                let v = v.trim();
                if !v.is_empty() {
                    approval_status = Some(v.to_string());
                }
            }
        }

        if ANNOUNCE_NAME_KEYS.iter().any(|k| name == *k || name.contains(k)) {
            if let Some(v) = p.value.as_str() {
                let v = v.trim();
                // 与前端对齐：只保留纯字母数字的公告号（过滤复合 ID）
                if !v.is_empty() && v.chars().all(|c| c.is_ascii_alphanumeric()) && !announce_nos.contains(&v.to_string()) {
                    announce_nos.push(v.to_string());
                }
            }
        }
        // 与前端对齐：params.find 取第一个命中的「车辆型号」
        if name == "车辆型号" && vehicle_model.is_none() {
            if let Some(v) = p.value.as_str() {
                let v = v.trim().to_string();
                if !v.is_empty() {
                    vehicle_model = Some(v);
                }
            }
        }

        // 受控属性派生：主机厂（优先 整车生产企业 > 公告申报企业 > 企业名称）
        if mfr_build.is_none() && name == "整车生产企业" {
            mfr_build = value_as_text(&p.value);
        } else if mfr_declare.is_none() && name == "公告申报企业" {
            mfr_declare = value_as_text(&p.value);
        } else if mfr_company.is_none() && name == "企业名称" {
            mfr_company = value_as_text(&p.value);
        }
        // 电池品牌（动力电池包厂商 优先，回退单体生产企业）
        if battery_pkg.is_none() && name == "动力电池包厂商" {
            battery_pkg = value_as_text(&p.value);
        } else if battery_cell.is_none() && name == "动力电池单体生产企业" {
            battery_cell = value_as_text(&p.value);
        }
        // 电量（kWh）
        if capacity_raw.is_none() && name.contains("动力电池包电量") {
            capacity_raw = value_as_text(&p.value);
        }
        // 准入等级（产品等级标准）
        if admission_level_raw.is_none() && name == "产品等级标准" {
            admission_level_raw = value_as_text(&p.value);
        }
        // 准入编号（导入查重判别：同公告号不同准入编号 = 不同车型）
        if name.contains("准入编号") {
            if let Some(v) = value_as_text(&p.value) {
                if !admission_nos.contains(&v) {
                    admission_nos.push(v);
                }
            }
        }
    }

    Some(AssetFileInfo {
        file_name: file_name.to_string(),
        product_name: parsed
            .product_name
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| file_name.trim_end_matches(".json").to_string()),
        updated_at: parsed.updated_at.or(parsed.created_at),
        total_params: parsed.parameters.len(),
        filled_params: filled,
        announce_nos,
        vehicle_model,
        has_admission_info,
        approval_status,
        manufacturer_raw: mfr_build.or(mfr_declare).or(mfr_company),
        battery_brand_raw: battery_pkg.or(battery_cell),
        capacity_raw,
        admission_level_raw,
        admission_nos,
    })
}

pub fn scan_asset_library_blocking(path: String) -> Result<Vec<AssetFileInfo>, String> {
    let dir = Path::new(&path);
    let entries = std::fs::read_dir(dir).map_err(|e| format!("无法读取资产库目录: {e}"))?;

    let mut infos = Vec::new();
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(|s| s.to_string()) else {
            continue;
        };
        if !is_asset_data_file(&name) {
            continue;
        }
        match scan_one(&entry.path(), &name) {
            Some(info) => infos.push(info),
            None => std::println!("[assets] 跳过无法解析的文件: {name}"),
        }
    }
    Ok(infos)
}

/// 扫描资产库全部资产文件，返回元信息（不传参数内容，主线程零解析）
#[tauri::command]
pub async fn scan_asset_library(path: String) -> Result<Vec<AssetFileInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_asset_library_blocking(path))
        .await
        .map_err(|e| format!("扫描任务失败: {e}"))?
}

// ============================================================
// 批量导入落盘：整批一次 IPC，唯一名解析与写盘都在 Rust 线程池完成。
// 前端逐文件 writeTextFile 在数百行批次下是 N 次 IPC + 主线程 JSON 序列化，
// 是「保存至资产库」慢的主因。
// ============================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchAssetItem {
    /// unique 模式：期望基名（不含 .json），冲突时自动追加 -新版本/-新版本2…
    #[serde(default)]
    pub base_name: Option<String>,
    /// fixed 模式：直接写入该文件名（替换旧版内容场景，调用方已解析好）
    #[serde(default)]
    pub fixed_file_name: Option<String>,
    pub product_name: String,
    /// 参数数组原样透传（serde_json::Value），保留 rowCheck/originSheet 等全部字段
    pub parameters: serde_json::Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchSaveResult {
    pub index: usize,
    pub file_name: String,
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
}

/// 与前端 getAssetBaseName 对齐：去首尾空白、剥 .json 后缀
fn sanitize_base_name(raw: &str) -> String {
    let trimmed = raw.trim();
    let stripped = trimmed.strip_suffix(".json").unwrap_or(trimmed).trim();
    if stripped.is_empty() { "未命名".to_string() } else { stripped.to_string() }
}

/// 在已占用名字集合中解析唯一基名：base.json → base-新版本.json → base-新版本2.json…
fn resolve_unique_name(taken: &mut std::collections::HashSet<String>, base: &str) -> String {
    let candidate = format!("{base}.json");
    if !taken.contains(&candidate) {
        taken.insert(candidate.clone());
        return candidate;
    }
    let mut i = 1usize;
    loop {
        let suffix = if i == 1 { "-新版本".to_string() } else { format!("-新版本{i}") };
        let candidate = format!("{base}{suffix}.json");
        if !taken.contains(&candidate) {
            taken.insert(candidate.clone());
            return candidate;
        }
        i += 1;
    }
}

fn save_assets_batch_blocking(path: String, items: Vec<BatchAssetItem>, now_iso: String) -> Result<Vec<BatchSaveResult>, String> {
    let dir = Path::new(&path);
    if !dir.exists() {
        return Err(format!("资产库目录不存在: {path}"));
    }

    // 目录现有 .json 文件名全部视为已占用（含侧车文件名排除不需要——精确匹配即可）
    let mut taken: std::collections::HashSet<String> = std::fs::read_dir(dir)
        .map_err(|e| format!("无法读取资产库目录: {e}"))?
        .flatten()
        .filter_map(|e| e.file_name().to_str().map(|s| s.to_string()))
        .filter(|n| n.ends_with(".json"))
        .collect();

    let now = now_iso;
    let mut results = Vec::with_capacity(items.len());
    for (index, item) in items.into_iter().enumerate() {
        let file_name = if let Some(fixed) = item.fixed_file_name.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            let normalized = if fixed.ends_with(".json") { fixed.to_string() } else { format!("{fixed}.json") };
            taken.insert(normalized.clone());
            normalized
        } else {
            let base = sanitize_base_name(item.base_name.as_deref().unwrap_or(""));
            resolve_unique_name(&mut taken, &base)
        };

        let doc = serde_json::json!({
            "version": "1.0",
            "productName": item.product_name,
            "createdAt": now,
            "updatedAt": now,
            "parameters": item.parameters,
        });
        let json = serde_json::to_string_pretty(&doc)
            .map_err(|e| format!("序列化失败（{}）: {e}", file_name))?;

        let result = std::fs::write(dir.join(&file_name), json)
            .map(|_| BatchSaveResult { index, file_name: file_name.clone(), ok: true, error: None })
            .unwrap_or_else(|e| BatchSaveResult {
                index,
                file_name,
                ok: false,
                error: Some(e.to_string()),
            });
        results.push(result);
    }
    Ok(results)
}

/// 批量保存资产文件：一次 IPC 完成 N 个文件的唯一名解析 + 写盘（导入大批次专用）
/// now_iso 由前端传入（与单文件保存的 new Date().toISOString() 同格式）
#[tauri::command]
pub async fn save_assets_batch(
    path: String,
    items: Vec<BatchAssetItem>,
    now_iso: String,
) -> Result<Vec<BatchSaveResult>, String> {
    tauri::async_runtime::spawn_blocking(move || save_assets_batch_blocking(path, items, now_iso))
        .await
        .map_err(|e| format!("批量保存任务失败: {e}"))?
}
