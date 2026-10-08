//! 公告中心命令（设计文档 docs/plans/2026-10-01-announcement-center-design.md §3.3）
//!
//! - scan_announcements：扫描 {资产库}/公告PDF/ 下的记录 JSON 元信息（不含参数全量，
//!   参数由前端按需 readTextFile 懒加载）。与 scan_asset_library 同思路：读+解析在
//!   线程池，只回传轻量元信息。
//! - move_to_trash：移入系统废纸篓。tauri-plugin-fs 2.4.4 无 trash API，用 trash crate。

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

/// 与前端 announcementRecord.ts 的 AnnouncementInfo 同构（camelCase）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnouncementInfo {
    /// 记录 JSON 文件名（含 .json）；孤儿 PDF 为空串
    pub json_file: String,
    pub announce_no: String,
    pub batch: Option<String>,
    pub vehicle_name: Option<String>,
    pub imported_at: Option<String>,
    pub source_url: Option<String>,
    pub has_pdf: bool,
    pub pdf_file: Option<String>,
    pub param_count: usize,
    /// true = 只有 PDF 没有 JSON，待认领
    pub orphan: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AnnouncementRecordFile {
    #[serde(default)]
    announce_no: Option<String>,
    #[serde(default)]
    batch: Option<String>,
    #[serde(default)]
    vehicle_name: Option<String>,
    #[serde(default)]
    imported_at: Option<String>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    pdf_file: Option<String>,
    #[serde(default)]
    parameters: Vec<serde_json::Value>,
}

/// 孤儿 PDF 文件名反解（best-effort，与前端 parseAnnouncementBaseName 同口径）：
/// 末段「第N批」→ 批次；纯 ASCII 字母数字且 ≥5 位 → 公告号；其余段 → 车型名
fn parse_base_name(base: &str) -> (Option<String>, String, Option<String>) {
    let mut announce_no = String::new();
    let mut batch: Option<String> = None;
    let mut rest: Vec<String> = Vec::new();
    for seg in base.split('_') {
        let seg = seg.trim();
        if seg.is_empty() {
            continue;
        }
        // 「第N批」判定按 char 迭代（中文多字节，禁止按字节切片）
        let chars: Vec<char> = seg.chars().collect();
        let is_batch = batch.is_none()
            && chars.len() >= 3
            && chars[0] == '第'
            && chars[chars.len() - 1] == '批'
            && chars[1..chars.len() - 1].iter().all(|c| c.is_ascii_digit());
        if is_batch {
            batch = Some(seg.to_string());
        } else if announce_no.is_empty()
            && seg.len() >= 5
            && seg.chars().all(|c| c.is_ascii_alphanumeric())
        {
            announce_no = seg.to_string();
        } else {
            rest.push(seg.to_string());
        }
    }
    let vehicle_name = if rest.is_empty() { None } else { Some(rest.join("_")) };
    (batch, announce_no, vehicle_name)
}

fn scan_announcements_blocking(path: String) -> Result<Vec<AnnouncementInfo>, String> {
    let dir = Path::new(&path).join("公告PDF");
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("无法读取公告归档目录: {e}"))?;

    let mut json_files: Vec<String> = Vec::new();
    let mut pdf_files: HashSet<String> = HashSet::new();
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(|s| s.to_string()) else {
            continue;
        };
        let lower = name.to_lowercase();
        if name.ends_with(".json") && !name.starts_with('_') {
            json_files.push(name);
        } else if lower.ends_with(".pdf") {
            pdf_files.insert(name);
        }
    }
    json_files.sort();

    let mut infos = Vec::new();
    let mut claimed: HashSet<String> = HashSet::new();

    for json_name in &json_files {
        let content = match std::fs::read_to_string(dir.join(json_name)) {
            Ok(c) => c,
            Err(e) => {
                std::println!("[announcements] 跳过无法读取的记录 {json_name}: {e}");
                continue;
            }
        };
        let Ok(record) = serde_json::from_str::<AnnouncementRecordFile>(&content) else {
            std::println!("[announcements] 跳过无法解析的记录: {json_name}");
            continue;
        };
        let Some(announce_no) = record.announce_no.as_deref().map(str::trim).filter(|s| !s.is_empty()) else {
            std::println!("[announcements] 跳过缺少公告号的记录: {json_name}");
            continue;
        };

        // PDF 归属：记录 pdfFile 字段优先；缺省时自愈为同名 PDF
        let same_base_pdf = format!("{}.pdf", json_name.trim_end_matches(".json"));
        let pdf_field = record.pdf_file.as_deref().map(str::trim).filter(|s| !s.is_empty());
        let pdf_name = pdf_field.map(|s| s.to_string()).or(Some(same_base_pdf));
        let pdf_name = pdf_name.filter(|n| pdf_files.contains(n));
        if let Some(n) = &pdf_name {
            claimed.insert(n.clone());
        }

        infos.push(AnnouncementInfo {
            json_file: json_name.clone(),
            announce_no: announce_no.to_string(),
            batch: record.batch.filter(|s: &String| !s.trim().is_empty()),
            vehicle_name: record.vehicle_name.filter(|s: &String| !s.trim().is_empty()),
            imported_at: record.imported_at.filter(|s: &String| !s.trim().is_empty()),
            source_url: record.source_url.filter(|s: &String| !s.trim().is_empty()),
            has_pdf: pdf_name.is_some(),
            pdf_file: pdf_name,
            param_count: record.parameters.len(),
            orphan: false,
        });
    }

    // 孤儿 PDF：没有记录 JSON 认领的
    let mut orphan_pdfs: Vec<&String> = pdf_files.iter().filter(|n| !claimed.contains(*n)).collect();
    orphan_pdfs.sort();
    for pdf_name in orphan_pdfs {
        let base = pdf_name.trim_end_matches(".pdf");
        let (batch, announce_no, vehicle_name) = parse_base_name(base);
        infos.push(AnnouncementInfo {
            json_file: String::new(),
            announce_no,
            batch,
            vehicle_name,
            imported_at: None,
            source_url: None,
            has_pdf: true,
            pdf_file: Some(pdf_name.clone()),
            param_count: 0,
            orphan: true,
        });
    }

    Ok(infos)
}

/// 扫描公告归档目录元信息（目录不存在返回空表）
#[tauri::command]
pub async fn scan_announcements(path: String) -> Result<Vec<AnnouncementInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || scan_announcements_blocking(path))
        .await
        .map_err(|e| format!("扫描公告任务失败: {e}"))?
}

/// 把文件移入系统废纸篓（可恢复删除；公告 PDF/记录是用户手动下载来的原始资料，
/// 彻底删除太狠——设计裁定删除一律走废纸篓）
#[tauri::command]
pub async fn move_to_trash(paths: Vec<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        for p in &paths {
            trash::delete(p).map_err(|e| format!("移入废纸篓失败（{p}）: {e}"))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("废纸篓任务失败: {e}"))?
}

/// 把文件引用写入系统剪贴板（粘贴到 Finder/微信/邮件即为目标文件）。
/// 路径经 argv 传入 AppleScript，避免引号/中文路径转义问题。
#[tauri::command]
pub async fn copy_files_to_clipboard(paths: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(move || {
            let mut script = std::process::Command::new("osascript");
            script
                .arg("-e")
                .arg("on run argv\nset l to {}\nrepeat with p in argv\nset end of l to (POSIX file p)\nend repeat\nset the clipboard to l\nend run");
            for p in &paths {
                script.arg(p);
            }
            let out = script
                .output()
                .map_err(|e| format!("无法启动 osascript: {e}"))?;
            if !out.status.success() {
                return Err(format!(
                    "复制到剪贴板失败: {}",
                    String::from_utf8_lossy(&out.stderr)
                ));
            }
            Ok(())
        })
        .await
        .map_err(|e| format!("剪贴板任务失败: {e}"))?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = paths;
        Err("当前平台暂不支持复制文件到剪贴板".to_string())
    }
}
