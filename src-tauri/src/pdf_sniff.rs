//! 公告 PDF 候选扫描（设计文档 docs/plans/2026-10-01-announcement-batch-import-design.md §3.2/3.3）
//!
//! walkdir 递归收集 PDF → 整文件 sha256（去重键）→ lopdf 轻量嗅探文本（轻量模式，pdf-extract 已移除）：
//! 命中 ≥2 个强特征词 + 公告号/标题身份 + 页数 ≤2 判为公告参数页，并提取 公告号/批次/企业/商标 做归档元数据预填。
//! 识别结果按「路径|大小|mtime」增量缓存（重扫未变化文件零解析）；单文件 catch_unwind 隔离；
//! 多线程并行 + 进度事件 + 可取消。

use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};
use walkdir::WalkDir;

/// 取消标志：scan 开始时复位，cancel 命令置位
static SCAN_CANCELLED: AtomicBool = AtomicBool::new(false);

const ARCHIVE_DIR_NAME: &str = "公告PDF";
/// 递归扫描跳过的噪声目录（隐藏目录「.」开头单独判）
const NOISE_DIRS: [&str; 5] = ["Library", "node_modules", "$Recycle.Bin", "System Volume Information", "AppData"];
/// 候选数硬上限（防止误选巨型根目录卡死）
const MAX_CANDIDATES: usize = 5000;
/// 超过此大小的 PDF 不做内容嗅探（5MB——公告参数页实测最大 172KB，5MB 几乎必非公告页；
/// 大块头直接进疑似/折叠，免掉 lopdf 全量加载的最大耗时）
const SNIFF_MAX_BYTES: u64 = 5 * 1024 * 1024;
/// 并行提取线程数上限
const MAX_WORKERS: usize = 8;

/// 强特征词：车辆公告参数页特有；≥2 即判高置信。
/// 「企业名称」「产品名称」过于通用，不计数（避免普通企业文档误报）。
const STRONG_MARKERS: [&str; 8] = [
    "汽车产品技术参数",
    "产品型号名称",
    "车辆识别代号",
    "产品商标",
    "主要技术参数",
    "整备质量",
    "额定载质量",
    "准拖挂车总质量",
];

/// 浏览器默认下载名的文件名启发式前缀
const FILENAME_HINT_PREFIX: &str = "querycpparampage";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PdfCandidate {
    pub path: String,
    pub file_name: String,
    pub size_bytes: u64,
    /// mtime epoch 毫秒（同公告号多版本时「最新胜出」的裁决键）
    pub modified_ms: u64,
    pub content_hash: String,
    /// announcement | suspect | other
    pub confidence: String,
    pub announce_no: Option<String>,
    pub batch: Option<String>,
    pub company: Option<String>,
    pub trademark: Option<String>,
    /// 产品型号名称原文（如「DNC5037XXYBEVP1型纯电动厢式运输车」）
    pub product_title: Option<String>,
    pub marker_hits: usize,
    pub filename_hint: bool,
    /// 内容嗅探失败/未读原因（confidence 仍为 suspect，人工确认）
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub candidates: Vec<PdfCandidate>,
    pub truncated: bool,
    pub cancelled: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ScanProgress {
    scanned: usize,
    total: usize,
    current_file: String,
}

fn is_noise_dir(name: &str) -> bool {
    name.starts_with('.') || NOISE_DIRS.contains(&name) || name == ARCHIVE_DIR_NAME
}

/// 文件名是否「长得像公告」：官网默认名前缀 / 含「公告」二字 / 含公告号形状的 token
/// （大写字母开头+含数字的 5-25 位字母数字段；公告号实测 13-16 位，**不锁 17 位——那是车架号 VIN**）。
/// 只用于提优先级与保底进疑似，不用作非公告否决（公告页.pdf 这类中性名太多，误杀风险高）。
fn filename_plausible(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    if lower.starts_with(FILENAME_HINT_PREFIX) || file_name.contains("公告") {
        return true;
    }
    if title_re().captures(file_name).is_some() {
        return true;
    }
    file_name
        .split(|c: char| !c.is_ascii_alphanumeric())
        .any(|t| t.len() >= 6
            && t.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false)
            && t.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
            && t.chars().any(|c| c.is_ascii_digit()))
}

/// 增量扫描缓存（grilling 定稿）：识别结果按「路径|大小|mtime」复用，重扫未变化文件零解析。
/// 存应用缓存目录，不污染用户资料夹；丢失只退回全量扫描，不会错。
/// notDownloaded 结果不入缓存——无内容读取、可随时廉价重推，避免占位/落地两种状态被旧结果糊住。
const SCAN_CACHE_VERSION: u32 = 1;
const SCAN_CACHE_MAX_ENTRIES: usize = 20000;
/// 卫生修剪阈值：条目超过此数才做「源文件存在性」检查（防历史扫描残留累积）
const SCAN_CACHE_PRUNE_THRESHOLD: usize = 1000;

#[derive(Serialize, Deserialize)]
struct ScanCacheFile {
    version: u32,
    entries: HashMap<String, PdfCandidate>,
}

fn scan_cache_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_cache_dir().ok().map(|d| d.join("announcement-scan-cache.json"))
}

fn scan_cache_key(path: &Path, size: u64, modified_ms: u64) -> String {
    format!("{}|{}|{}", path.to_string_lossy(), size, modified_ms)
}

fn load_scan_cache(app: &tauri::AppHandle) -> HashMap<String, PdfCandidate> {
    let Some(p) = scan_cache_path(app) else { return HashMap::new() };
    let Ok(content) = std::fs::read_to_string(&p) else { return HashMap::new() };
    match serde_json::from_str::<ScanCacheFile>(&content) {
        Ok(f) if f.version == SCAN_CACHE_VERSION => f.entries,
        _ => HashMap::new(),
    }
}

/// 合并本次扫描的新条目并落盘；超上限只保留本次结果（缓存随扫描自然重建）
fn persist_scan_cache(
    app: &tauri::AppHandle,
    loaded: &HashMap<String, PdfCandidate>,
    fresh: &HashMap<String, PdfCandidate>,
) {
    if fresh.is_empty() {
        return;
    }
    let Some(p) = scan_cache_path(app) else { return };
    let mut merged: HashMap<String, PdfCandidate> = loaded.clone();
    for (k, v) in fresh {
        merged.insert(k.clone(), v.clone());
    }
    // 卫生修剪：条目超过阈值时，清掉「源文件已不存在」的旧条目（扫过的临时目录删掉后
    // 不留残留）。stat 一次 ~µs，仅超过阈值才触发，正常使用（几百条）永远碰不到。
    if merged.len() > SCAN_CACHE_PRUNE_THRESHOLD {
        merged.retain(|_, c| std::fs::metadata(&c.path).is_ok());
    }
    if merged.len() > SCAN_CACHE_MAX_ENTRIES {
        merged = fresh.clone();
    }
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_string(&ScanCacheFile { version: SCAN_CACHE_VERSION, entries: merged }) {
        let _ = std::fs::write(&p, json);
    }
}

/// 带缓存的候选处理：stat 出键命中直接复用（不读不解析），未命中才完整处理并记入 fresh
fn candidate_with_cache(
    path: &Path,
    include_not_downloaded: bool,
    cache: &HashMap<String, PdfCandidate>,
    fresh: &mut HashMap<String, PdfCandidate>,
) -> PdfCandidate {
    if let Ok(md) = std::fs::metadata(path) {
        let key = scan_cache_key(path, md.len(), mtime_ms(&md));
        if let Some(hit) = cache.get(&key) {
            return hit.clone();
        }
        let candidate = process_pdf(path, include_not_downloaded);
        if candidate.confidence != "notDownloaded" {
            fresh.insert(key, candidate.clone());
        }
        return candidate;
    }
    process_pdf(path, include_not_downloaded)
}

fn collect_pdfs(root: &Path, max_depth: usize) -> (Vec<PathBuf>, bool) {
    let mut pdfs = Vec::new();
    let mut truncated = false;
    for entry in WalkDir::new(root)
        .max_depth(max_depth)
        .follow_links(false)
        .into_iter()
        .filter_entry(|e| {
            // 根目录本身不参与噪声过滤（用户明确选择它）
            e.depth() == 0
                || !e.file_type().is_dir()
                || !is_noise_dir(e.file_name().to_string_lossy().as_ref())
        })
    {
        if SCAN_CANCELLED.load(Ordering::Relaxed) {
            break;
        }
        let Ok(entry) = entry else { continue };
        if !entry.file_type().is_file() {
            continue;
        }
        if entry.file_name().to_string_lossy().to_lowercase().ends_with(".pdf") {
            if pdfs.len() >= MAX_CANDIDATES {
                truncated = true;
                break;
            }
            pdfs.push(entry.into_path());
        }
    }
    (pdfs, truncated)
}

fn mtime_ms(md: &std::fs::Metadata) -> u64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// ==================== 元数据提取（纯函数，可单测） ====================

#[derive(Clone)]
struct ExtractedMeta {
    announce_no: Option<String>,
    batch: Option<String>,
    company: Option<String>,
    trademark: Option<String>,
    product_title: Option<String>,
}

impl ExtractedMeta {
    fn empty() -> Self {
        Self {
            announce_no: None,
            batch: None,
            company: None,
            trademark: None,
            product_title: None,
        }
    }
}

fn title_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"([A-Z][A-Z0-9]{4,24})型").unwrap())
}

fn model_field_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"产品型号名称[：:]\s*([A-Za-z0-9]{5,25})").unwrap())
}

/// 批次号：样本「批次 407」「批次:407」；要求 3-4 位数字，
/// 「减免购置税目录批次（第65批）」里的 65 只有两位、不会误吞
fn batch_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"批次[\s：:]*(\d{3,4})[^0-9]").unwrap())
}

fn company_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"企业名称[：:]\s*([^\n\r，,;；]{2,60})").unwrap())
}

fn trademark_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"产品商标[：:]\s*([^\n\r，,;；]{1,40})").unwrap())
}

fn product_title_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"([A-Za-z0-9]{5,25}型[^\n\r：:,，]{2,60})").unwrap())
}

fn first_match(re: &Regex, text: &str) -> Option<String> {
    re.captures(text)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .filter(|s| !s.is_empty())
}

fn extract_meta(text: &str) -> ExtractedMeta {
    let product_title = first_match(product_title_re(), text);
    let announce_no = first_match(title_re(), text).or_else(|| first_match(model_field_re(), text));
    let batch = first_match(batch_re(), text).or_else(|| standalone_batch_line(text));
    let company = first_match(company_re(), text);
    let trademark = first_match(trademark_re(), text);
    ExtractedMeta { announce_no, batch, company, trademark, product_title }
}

/// lopdf 兜底文本里标签与值被拆行，批次值以独立 3 位数字行出现（实测 407/396）。
/// 用公告批次号域（300–599）过滤目录序号等杂数；仅作主正则失败后的兜底，行内可改。
fn standalone_batch_line(text: &str) -> Option<String> {
    text.lines()
        .map(str::trim)
        .find(|l| {
            l.len() == 3
                && l.chars().all(|c| c.is_ascii_digit())
                && l.parse::<u32>().map(|n| (300..600).contains(&n)).unwrap_or(false)
        })
        .map(|s| s.to_string())
}

/// 置信度判定（纯函数）：≥2 强特征 且 提取到公告号/型号标题 且 页数在限内 = announcement；
/// 特征/身份够但超页数 = suspect（降级）；文件名启发式 / 有特征但无身份 = suspect；其余 = other。
/// 页数门只向下拉假公告，不向上抬无关文档（markers=0 的多页文档仍归 other 折叠）。
/// 注：text_readable=false 只出现在「多页主动跳过提取」路径；真正的解析失败走 Err 分支直接判疑似，不进本函数。
fn classify_confidence(
    marker_hits: usize,
    filename_hint: bool,
    text_readable: bool,
    has_identity: bool,
    page_ok: bool,
) -> &'static str {
    if marker_hits >= 2 && has_identity {
        return if page_ok { "announcement" } else { "suspect" };
    }
    if filename_hint || marker_hits >= 1 {
        return "suspect";
    }
    let _ = text_readable;
    "other"
}

struct SniffOutcome {
    marker_hits: usize,
    text_readable: bool,
    meta: ExtractedMeta,
    error: Option<String>,
    /// PDF 页数（lopdf load 成功时可得；None=不可知，不参与判定）
    page_count: Option<usize>,
}

fn panic_message(payload: Box<dyn std::any::Any + Send>) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "未知 panic".to_string()
    }
}

fn count_markers(text: &str) -> usize {
    STRONG_MARKERS.iter().filter(|m| text.contains(**m)).count()
}

/// 公告参数页页数上限（用户域知识 + 实测：正常公告参数页恒为 1 页、50-170KB；
/// 误判样本为 98 页产品册/17 页规格书）。超过即不判公告——页数比特征词硬。
const MAX_ANNOUNCEMENT_PAGES: usize = 2;

/// 轻量嗅探（grilling 定稿：Q1-Q3）：
/// - 只用 lopdf，`load_mem` 直接解析调用方读入的内存（与哈希共用同一次磁盘读）；
/// - 页数前置门槛：>2 页连文本都不提，直接降级——产品册/规格书类大块头是耗时大户；
/// - pdf-extract 第二遍已删除：对工信部 PDF 100% panic 且 344ms/文件（探针实测），
///   占旧流程 70%+ 耗时，换来的召回约 1 文件/200，落折叠组可手动捞。
fn sniff_pdf(bytes: &[u8], size: u64) -> Result<SniffOutcome, String> {
    if size > SNIFF_MAX_BYTES {
        return Err(format!("文件过大（{}MB），跳过内容嗅探", size / (1024 * 1024)));
    }
    let doc = lopdf::Document::load_mem(bytes).map_err(|e| format!("lopdf 打开失败: {e}"))?;
    let page_count = doc.get_pages().len();
    if page_count > MAX_ANNOUNCEMENT_PAGES {
        return Ok(SniffOutcome {
            marker_hits: 0,
            text_readable: false,
            meta: ExtractedMeta::empty(),
            error: Some(format!("多页文档（{page_count} 页），未做内容识别")),
            page_count: Some(page_count),
        });
    }
    let text = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let first: Vec<u32> = doc.get_pages().keys().copied().take(3).collect();
        doc.extract_text(&first)
    }))
    .map_err(|p| format!("lopdf 提取异常: {}", panic_message(p)))?
    .map_err(|e| format!("lopdf 提取失败: {e}"))?;
    if text.trim().is_empty() {
        return Err("lopdf 提取为空（扫描版或无文本层）".to_string());
    }
    Ok(SniffOutcome {
        marker_hits: count_markers(&text),
        text_readable: true,
        meta: extract_meta(&text),
        error: None,
        page_count: Some(page_count),
    })
}

/// iCloud 数据占位检测（仅 Unix）：有逻辑大小但零磁盘块 = 文件未落地本地。
/// 对这种文件 open 会触发 macOS 自动从 iCloud 下载整份文件——默认跳过它，
/// 扫描才能「零网络副作用」跑完（这是慢扫与读取失败报错的根因）。
fn is_dataless(md: &std::fs::Metadata) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        md.len() > 0 && md.blocks() == 0
    }
    #[cfg(not(unix))]
    {
        let _ = md;
        false
    }
}

/// 不读文件内容时，从文件名尽力反解 公告号/批次（供「未下载」候选预填）
fn filename_meta(file_name: &str) -> (Option<String>, Option<String>) {
    fn batch_cn_re() -> &'static Regex {
        static RE: OnceLock<Regex> = OnceLock::new();
        RE.get_or_init(|| Regex::new(r"第(\d{3,4})批").unwrap())
    }
    fn batch_trailing_re() -> &'static Regex {
        static RE: OnceLock<Regex> = OnceLock::new();
        RE.get_or_init(|| Regex::new(r"-(\d{3})(?:\.\w+)?$").unwrap())
    }

    let stem = file_name.trim_end_matches(".pdf").trim_end_matches(".PDF");
    // 公告号：先找「XXX型」，再退到全大写含数字的车型编号 token
    let mut announce_no = title_re().captures(stem).and_then(|c| c.get(1)).map(|m| m.as_str().to_string());
    if announce_no.is_none() {
        announce_no = stem
            .split(|c: char| !c.is_ascii_alphanumeric())
            .find(|t| t.len() >= 6
                && t.chars().next().map(|c| c.is_ascii_uppercase()).unwrap_or(false)
                && t.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit())
                && t.chars().any(|c| c.is_ascii_digit()))
            .map(|t| t.to_string());
    }
    // 批次：「第407批」或文件名尾部「-407」
    let batch = first_match(batch_cn_re(), stem)
        .or_else(|| first_match(batch_trailing_re(), stem));
    (announce_no, batch)
}

fn process_pdf(path: &Path, include_not_downloaded: bool) -> PdfCandidate {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let filename_hint = filename_plausible(&file_name);

    let (size, modified_ms, dataless) = match std::fs::metadata(path) {
        Ok(md) => (md.len(), mtime_ms(&md), is_dataless(&md)),
        Err(e) => {
            return PdfCandidate {
                path: path.to_string_lossy().to_string(),
                file_name,
                size_bytes: 0,
                modified_ms: 0,
                content_hash: format!("metadata-error: {e}"),
                confidence: "suspect".to_string(),
                announce_no: None,
                batch: None,
                company: None,
                trademark: None,
                product_title: None,
                marker_hits: 0,
                filename_hint,
                error: Some(format!("读取文件信息失败: {e}")),
            };
        }
    };

    // iCloud 数据占位 + 用户未选择包含 → 不 open（零下载副作用），文件名尽力预填
    if dataless && !include_not_downloaded {
        let (announce_no, batch) = filename_meta(&file_name);
        return PdfCandidate {
            path: path.to_string_lossy().to_string(),
            file_name,
            size_bytes: size,
            modified_ms,
            content_hash: String::new(),
            confidence: "notDownloaded".to_string(),
            announce_no,
            batch,
            company: None,
            trademark: None,
            product_title: None,
            marker_hits: 0,
            filename_hint,
            error: Some("iCloud 文件未下载到本地，本次未读取内容（勾选「包含未下载文件」后会下载并识别）".to_string()),
        };
    }

    // 单次读取：哈希与解析共用同一份内存（旧实现文件要被读两遍）
    let bytes = match std::fs::read(path) {
        Ok(b) => b,
        Err(e) => {
            return PdfCandidate {
                path: path.to_string_lossy().to_string(),
                file_name,
                size_bytes: size,
                modified_ms,
                content_hash: String::new(),
                confidence: "suspect".to_string(),
                announce_no: None,
                batch: None,
                company: None,
                trademark: None,
                product_title: None,
                marker_hits: 0,
                filename_hint,
                error: Some(format!("读取文件内容失败: {e}")),
            };
        }
    };
    let size = bytes.len() as u64;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let content_hash = format!("{:x}", hasher.finalize());

    // 引擎对任意来源 PDF 有 panic 面，按文件隔离
    let sniffed = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| sniff_pdf(&bytes, size)));

    let (confidence, announce_no, batch, company, trademark, product_title, marker_hits, error) =
        match sniffed {
            Err(_) => (
                "suspect", None, None, None, None, None, 0,
                Some("内容解析异常（已隔离），请人工确认".to_string()),
            ),
            Ok(Err(e)) => ("suspect", None, None, None, None, None, 0, Some(e)),
            Ok(Ok(out)) => {
                let has_identity = out.meta.announce_no.is_some() || out.meta.product_title.is_some();
                // 页数门槛兜底判定（多页文件已在 sniff_pdf 里免提取直接返回）
                let page_ok = out.page_count.map_or(true, |n| n <= MAX_ANNOUNCEMENT_PAGES);
                let confidence = classify_confidence(out.marker_hits, filename_hint, out.text_readable, has_identity, page_ok);
                let error = if !out.text_readable { out.error } else { None };
                (
                    confidence,
                    out.meta.announce_no,
                    out.meta.batch,
                    out.meta.company,
                    out.meta.trademark,
                    out.meta.product_title,
                    out.marker_hits,
                    error,
                )
            }
        };

    PdfCandidate {
        path: path.to_string_lossy().to_string(),
        file_name,
        size_bytes: size,
        modified_ms,
        content_hash,
        confidence: confidence.to_string(),
        announce_no,
        batch,
        company,
        trademark,
        product_title,
        marker_hits,
        filename_hint,
        error,
    }
}

fn scan_blocking(app: tauri::AppHandle, root: String, max_depth: u32, include_not_downloaded: bool) -> ScanResult {
    SCAN_CANCELLED.store(false, Ordering::Relaxed);
    let (pdfs, truncated) = collect_pdfs(Path::new(&root), max_depth as usize);
    let total = pdfs.len();
    let scanned = AtomicUsize::new(0);
    let results: Mutex<Vec<PdfCandidate>> = Mutex::new(Vec::with_capacity(total));
    let cancelled_at = AtomicUsize::new(usize::MAX);
    // 增量缓存：未变化文件直接复用识别结果（重扫只解析新增/变化的部分）
    let cache = load_scan_cache(&app);
    let fresh: Mutex<HashMap<String, PdfCandidate>> = Mutex::new(HashMap::new());
    // 共享状态以引用进入各线程（引用 Copy，move 闭包各持一份）
    let scanned_ref = &scanned;
    let results_ref = &results;
    let cancelled_ref = &cancelled_at;
    let cache_ref = &cache;
    let fresh_ref = &fresh;

    let workers = total.min(MAX_WORKERS).max(1);
    let chunk_size = total.div_ceil(workers).max(1);
    std::thread::scope(|scope| {
        for chunk in pdfs.chunks(chunk_size) {
            let app = app.clone();
            scope.spawn(move || {
                for path in chunk {
                    if SCAN_CANCELLED.load(Ordering::Relaxed) {
                        cancelled_ref.store(scanned_ref.load(Ordering::Relaxed), Ordering::Relaxed);
                        return;
                    }
                    let candidate = candidate_with_cache(path, include_not_downloaded, cache_ref, &mut fresh_ref.lock().unwrap_or_else(|e| e.into_inner()));
                    let current = candidate.file_name.clone();
                    results_ref.lock().map(|mut r| r.push(candidate)).ok();
                    let n = scanned_ref.fetch_add(1, Ordering::Relaxed) + 1;
                    if n % 5 == 0 || n == total {
                        let _ = app.emit(
                            "pdf-scan-progress",
                            ScanProgress { scanned: n, total, current_file: current },
                        );
                    }
                }
            });
        }
    });

    let cancelled = cancelled_at.load(Ordering::Relaxed) != usize::MAX
        || (scanned.load(Ordering::Relaxed) < total && SCAN_CANCELLED.load(Ordering::Relaxed));
    let mut candidates = results.into_inner().unwrap_or_default();
    persist_scan_cache(&app, &cache, &fresh.into_inner().unwrap_or_default());
    // 高置信在前，组内按 mtime 新→旧（前端在此顺序上做分组与默认勾选）
    candidates.sort_by(|a, b| {
        let rank = |c: &PdfCandidate| match c.confidence.as_str() {
            "announcement" => 0,
            "suspect" => 1,
            _ => 2,
        };
        rank(a).cmp(&rank(b)).then(b.modified_ms.cmp(&a.modified_ms))
    });
    ScanResult { candidates, truncated, cancelled }
}

/// 递归扫描目录，返回公告 PDF 候选（含哈希/嗅探/元数据预填）。
/// 进度经 `pdf-scan-progress` 事件推送；`cancel_pdf_scan` 可中途取消。
/// include_not_downloaded：是否读取 iCloud 未落地文件（会触发下载），默认 false——
/// 占位文件只按文件名列为「未下载」候选，不 open、零网络副作用。
#[tauri::command]
pub async fn scan_pdf_candidates(
    app: tauri::AppHandle,
    root: String,
    max_depth: Option<u32>,
    include_not_downloaded: Option<bool>,
) -> Result<ScanResult, String> {
    let depth = max_depth.unwrap_or(6).clamp(1, 16);
    let include = include_not_downloaded.unwrap_or(false);
    let outcome = tauri::async_runtime::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            scan_blocking(app, root, depth, include)
        }))
    })
    .await
    .map_err(|e| format!("扫描任务失败: {e}"))?;
    // 任意残余 panic 转成带原因的结构化错误，而不是裸 JoinError
    outcome.map_err(|p| format!("扫描内部错误: {}", panic_message(p)))
}

/// 取消进行中的扫描（幂等；扫描开始时自动复位）
#[tauri::command]
pub fn cancel_pdf_scan() {
    SCAN_CANCELLED.store(true, Ordering::Relaxed);
}

/// 回应用时增量检查（grilling 定稿：无常驻监听，用户选择的最保守方案）：
/// 只列下载目录**顶层** PDF，stat 出键命中缓存直接复用；新文件仅当**文件名像公告**
/// 才完整嗅探并记入缓存，其余不缓存不打扰——本命令几乎瞬时返回，零常驻零轮询。
/// 只返回值得提示用户的候选（announcement/suspect），调用方再按已归档/已忽略过滤。
#[tauri::command]
pub async fn probe_downloads(app: tauri::AppHandle, dir: String) -> Result<Vec<PdfCandidate>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| probe_downloads_blocking(&app, Path::new(&dir))))
            .map_err(|p| format!("检查任务异常: {}", panic_message(p)))?
    })
    .await
    .map_err(|e| format!("检查任务失败: {e}"))?
}

fn probe_downloads_blocking(app: &tauri::AppHandle, dir: &Path) -> Result<Vec<PdfCandidate>, String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("无法读取下载目录: {e}"))?;
    let cache = load_scan_cache(app);
    let mut fresh: HashMap<String, PdfCandidate> = HashMap::new();
    let mut out: Vec<PdfCandidate> = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        let Some(name) = p.file_name().map(|n| n.to_string_lossy().to_string()) else { continue };
        if !name.to_lowercase().ends_with(".pdf") {
            continue;
        }
        // 不为检查触发 iCloud 下载：占位文件直接跳过
        let Ok(md) = std::fs::metadata(&p) else { continue };
        if is_dataless(&md) {
            continue;
        }
        let key = scan_cache_key(&p, md.len(), mtime_ms(&md));
        let candidate = match cache.get(&key) {
            Some(hit) => hit.clone(),
            None => {
                // 名字预筛：不像公告的文件不嗅探不缓存（留给批量扫描去 warming）
                if !filename_plausible(&name) {
                    continue;
                }
                let c = process_pdf(&p, false);
                if c.confidence != "notDownloaded" {
                    fresh.insert(key, c.clone());
                }
                c
            }
        };
        if candidate.confidence == "announcement" || candidate.confidence == "suspect" {
            out.push(candidate);
        }
    }
    persist_scan_cache(app, &cache, &fresh);
    out.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms));
    Ok(out)
}

// ==================== 单测 ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// lopdf 文本提取（仅测试用，带 panic 隔离）
    fn lopdf_probe(path: &Path) -> Result<String, String> {
        let doc = lopdf::Document::load(path).map_err(|e| format!("lopdf 打开失败: {e}"))?;
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let first: Vec<u32> = doc.get_pages().keys().copied().take(3).collect();
            doc.extract_text(&first)
        }))
        .map_err(|p| format!("lopdf 提取异常: {}", panic_message(p)))?
        .map_err(|e| format!("lopdf 提取失败: {e}"))
    }

    /// 样本 PDF（Downloads/queryCpParamPage.pdf）文本层的关键行拼装的 fixture
    const SAMPLE_TEXT: &str = "\
DNC5037XXYBEVP1型纯电动厢式运输车
产品ID: A9B12880
企业名称: 吉利四川商用车有限公司
产品商标: 远程牌
生效日期: 20260611 批次
407
汽车产品技术参数
主要技术参数
整备质量(kg): 3000
额定载质量(kg): 1475,1505
车辆识别代号: LMPA1JMB××××××
产品型号名称: DNC5037XXYBEVP1";

    #[test]
    fn extract_meta_from_sample_fixture() {
        let meta = extract_meta(SAMPLE_TEXT);
        assert_eq!(meta.announce_no.as_deref(), Some("DNC5037XXYBEVP1"));
        assert_eq!(meta.batch.as_deref(), Some("407"));
        assert_eq!(meta.company.as_deref(), Some("吉利四川商用车有限公司"));
        assert_eq!(meta.trademark.as_deref(), Some("远程牌"));
        let title = meta.product_title.unwrap();
        assert!(title.starts_with("DNC5037XXYBEVP1型"), "title = {title}");
    }

    #[test]
    fn batch_regex_skips_directory_batch_reference() {
        // 「减免购置税目录批次（第65批）」——65 只有两位，不应被当公告批次
        let meta = extract_meta("F1E ZB5030XXYBEVGDD6\n减免购置税目录批次（第65批）\n汽车产品技术参数");
        assert_eq!(meta.batch, None);
    }

    #[test]
    fn batch_standalone_line_fallback() {
        // lopdf 拆行文本：批次标签后跟的是 8 位日期，真实批次值是独立 3 位行
        let text = "DNC1型货车\n批次\n20260611\n生效日期:\n远程牌\n138\n407\n汽车产品技术参数";
        let meta = extract_meta(text);
        assert_eq!(meta.batch.as_deref(), Some("407"));
        // 批次号域之外的独立 3 位行（目录序号等）不当批次
        let no_batch = "DNC1型货车\n汽车产品技术参数\n138\n100\n";
        assert_eq!(extract_meta(no_batch).batch, None);
    }

    #[test]
    fn filename_meta_parses_without_opening() {
        // 「未下载」候选的预填：公告号 + 批次都从文件名来
        let (no, batch) = filename_meta("吉利四川商用车有限公司-DNC5037XXYBEVP1型纯电动厢式运输车-407.pdf");
        assert_eq!(no.as_deref(), Some("DNC5037XXYBEVP1"));
        assert_eq!(batch.as_deref(), Some("407"));

        let (no2, batch2) = filename_meta("某车公告第389批.pdf");
        assert_eq!(batch2.as_deref(), Some("389"));
        assert!(no2.is_none());

        // 普通文档名不误提取
        let (no3, batch3) = filename_meta("火车票.pdf");
        assert!(no3.is_none());
        assert!(batch3.is_none());
    }

    #[test]
    fn confidence_thresholds() {
        assert_eq!(classify_confidence(3, false, true, true, true), "announcement");
        assert_eq!(classify_confidence(2, false, true, true, true), "announcement");
        // 参数词凑够 2 个但没有任何身份（公告号/型号标题）→ 拦在疑似组
        assert_eq!(classify_confidence(2, false, true, false, true), "suspect");
        assert_eq!(classify_confidence(1, false, true, true, true), "suspect");
        assert_eq!(classify_confidence(0, true, true, false, true), "suspect");
        assert_eq!(classify_confidence(1, true, true, true, true), "suspect");
        // text_readable=false 只代表「多页主动跳过提取」，无特征无身份 → other（非不确定）
        assert_eq!(classify_confidence(0, false, false, false, true), "other");
        assert_eq!(classify_confidence(0, false, true, false, true), "other");
        // 多页文档：本可判公告的降级为疑似（98 页产品册实测误判）
        assert_eq!(classify_confidence(8, false, true, true, false), "suspect");
        // 页数门只向下拉：无特征无身份的多页文档仍归 other，不打扰
        assert_eq!(classify_confidence(0, false, true, false, false), "other");
        assert_eq!(classify_confidence(1, false, true, false, false), "suspect");
    }

    #[test]
    fn noise_dir_filter() {
        assert!(is_noise_dir("Library"));
        assert!(is_noise_dir(".git"));
        assert!(is_noise_dir("node_modules"));
        assert!(is_noise_dir("公告PDF"));
        assert!(!is_noise_dir("微信下载"));
    }

    /// 分阶段计时：hash / lopdf load / lopdf extract / pdf-extract。
    /// 运行：PROBE_FILES="/a.pdf:/b.pdf" cargo test probe_stage_timing -- --ignored --nocapture
    #[test]
    #[ignore]
    fn probe_stage_timing() {
        use std::time::Instant;
        let files: Vec<String> = std::env::var("PROBE_FILES")
            .unwrap_or_default()
            .split(':')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        for f in files {
            let p = Path::new(&f);
            let name = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            let t0 = Instant::now();
            let bytes = std::fs::read(p).unwrap_or_default();
            let t_read = t0.elapsed();
            let t1 = Instant::now();
            let mut hasher = Sha256::new();
            hasher.update(&bytes);
            let _ = hasher.finalize();
            let t_hash = t1.elapsed();
            let t2 = Instant::now();
            let load = lopdf::Document::load_mem(&bytes);
            let t_load = t2.elapsed();
            let t3 = Instant::now();
            if let Ok(doc) = &load {
                let first: Vec<u32> = doc.get_pages().keys().copied().take(3).collect();
                let _ = doc.extract_text(&first);
            }
            let t_extract = t3.elapsed();
            let pages = load.as_ref().map(|d| d.get_pages().len()).unwrap_or(0);
            println!(
                "{name}  pages={pages} size={}KB read={t_read:?} hash={t_hash:?} lopdf_load={t_load:?} lopdf_extract={t_extract:?}",
                bytes.len() / 1024
            );
        }
    }

    /// 页数探针：PROBE_FILES 为冒号分隔的绝对路径列表，打印每份 PDF 的页数与大小。
    /// 运行：PROBE_FILES="/a.pdf:/b.pdf" cargo test probe_pdf_pages -- --ignored --nocapture
    #[test]
    #[ignore]
    fn probe_pdf_pages() {
        let files: Vec<String> = std::env::var("PROBE_FILES")
            .unwrap_or_default()
            .split(':')
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        for f in files {
            let p = Path::new(&f);
            let size_kb = std::fs::metadata(p).map(|m| m.len() / 1024).unwrap_or(0);
            match lopdf::Document::load(p) {
                Ok(doc) => println!("pages={:<4} size={}KB  {}", doc.get_pages().len(), size_kb, f),
                Err(e) => println!("load-fail({e}) size={}KB  {}", size_kb, f),
            }
        }
    }

    /// 手动端到端验证：默认扫 Downloads；SCAN_DIR 环境变量可指定任意目录（只读）。
    /// 运行：cargo test sniff_real_downloads -- --ignored --nocapture
    #[test]
    #[ignore]
    fn sniff_real_downloads() {
        let dir = std::env::var("SCAN_DIR")
            .unwrap_or_else(|_| std::env::var("HOME").unwrap() + "/Downloads");
        let (pdfs, truncated) = collect_pdfs(Path::new(&dir), 6);
        println!("目录 PDF 数: {}（truncated={truncated}）", pdfs.len());
        for path in &pdfs {
            let c = process_pdf(path, true);
            println!(
                "[{:>12}] markers={:<2} hint={:<5} 公告号={:?} 批次={:?} 商标={:?} err={:?}\n    {}",
                c.confidence, c.marker_hits, c.filename_hint,
                c.announce_no, c.batch, c.trademark, c.error, c.file_name,
            );
            // 批次没提到时打印原文上下文，帮助调正则
            if c.confidence == "announcement" && c.batch.is_none() {
                if let Ok(text) = lopdf_probe(path) {
                    if let Some(idx) = text.find("批次") {
                        // 字符边界安全切片（中文多字节，直接按字节切会 panic）
                        let mut start = idx.saturating_sub(30);
                        while start > 0 && !text.is_char_boundary(start) { start -= 1; }
                        let mut end = (idx + 40).min(text.len());
                        while end > start && !text.is_char_boundary(end) { end -= 1; }
                        println!("    [批次上下文] {:?}", &text[start..end]);
                    }
                }
            }
        }

        // 增量缓存验证：首遍全解析 vs 二遍全缓存命中——结果必须一致、耗时应大幅缩短
        let mut cache: HashMap<String, PdfCandidate> = HashMap::new();
        let t0 = std::time::Instant::now();
        let first: Vec<PdfCandidate> = pdfs.iter().map(|p| process_pdf(p, true)).collect();
        println!("首遍（全解析）耗时 {:?}", t0.elapsed());
        for c in &first {
            if let Ok(md) = std::fs::metadata(&c.path) {
                cache.insert(scan_cache_key(Path::new(&c.path), md.len(), mtime_ms(&md)), c.clone());
            }
        }
        let t1 = std::time::Instant::now();
        let mut fresh2: HashMap<String, PdfCandidate> = HashMap::new();
        let second: Vec<PdfCandidate> = pdfs
            .iter()
            .map(|p| candidate_with_cache(p, true, &cache, &mut fresh2))
            .collect();
        println!("二遍（全缓存命中）耗时 {:?}，fresh 新增 {} 条", t1.elapsed(), fresh2.len());
        assert_eq!(first.len(), second.len());
        for (a, b) in first.iter().zip(second.iter()) {
            assert_eq!(a.confidence, b.confidence, "confidence mismatch: {}", a.file_name);
            assert_eq!(a.announce_no, b.announce_no, "announceNo mismatch: {}", a.file_name);
            assert_eq!(a.batch, b.batch, "batch mismatch: {}", a.file_name);
        }
        println!("缓存命中结果与全解析一致 ✓");
    }
}
