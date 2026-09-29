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

#[derive(Deserialize)]
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
}

/// 与前端 isAssetDataFile 对齐：.json 且不以 _ / custom_ 开头
fn is_asset_data_file(name: &str) -> bool {
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
    })
}

fn scan_asset_library_blocking(path: String) -> Result<Vec<AssetFileInfo>, String> {
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
