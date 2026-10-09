//! 手机查看（移动端只读视图）— P1：只读 HTTP 服务端
//!
//! 设计依据：`docs/adr/0004-read-only-remote-access-surface.md`、
//! `docs/plans/2026-10-08-mobile-asset-viewer-design.md`。
//!
//! 三条不可动摇的性质：
//! 1. **只绑 `127.0.0.1`**——局域网不可见，只经隧道（TLS 在隧道边缘终止）对外。
//! 2. **只读**——无任何写端点；写路径唯一地留在本机界面里（ADR-0004 的核心裁定）。
//! 3. **认证 = 每设备长期 token**——不是共享码（共享码泄露后只能全员重配）。

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use percent_encoding::percent_decode_str;
use tiny_http::{Header, Method, Response, Server};

use crate::assets::{is_asset_data_file, scan_asset_library_blocking, AssetFileInfo};

/// 已配对设备名单。下划线前缀 ⇒ 被资产扫描谓词排除（同 `_asset_tags.json`）。
const DEVICES_FILE: &str = "_mobile_devices.json";
/// 受控属性词表 / 取值的旁路文件（读取原样下发，解析逻辑复用前端领域层）
const FACET_VOCAB_FILE: &str = "_facet_vocab.json";
const FACET_VALUES_FILE: &str = "_facet_values.json";
/// 治理元信息（`status`: superseded / deprecated）——Q37「已取代默认隐藏」依赖它
const ASSET_META_FILE: &str = "_asset_meta.json";
/// 标签旁路文件
const ASSET_TAGS_FILE: &str = "_asset_tags.json";
/// 自定义标签组
const TAG_GROUPS_FILE: &str = "custom_asset_tag_groups.json";

const COOKIE_NAME: &str = "vp_device";
const PAIRING_CODE_TTL_MS: i64 = 10 * 60 * 1000;
const TOKEN_BYTES: usize = 32;
/// 浏览器对 cookie 生命周期的实际上限约 400 天，故取 1 年；
/// 服务端 token 本身无过期，cookie 丢失才需重新配对。
const COOKIE_MAX_AGE_SEC: i64 = 31_536_000;

// ============================================================
// 状态
// ============================================================

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub created_at_ms: i64,
}

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct DeviceRegistry {
    /// token → 设备
    devices: BTreeMap<String, Device>,
}

struct PairingCode {
    code: String,
    expires_at_ms: i64,
}

pub struct State {
    library: Mutex<Option<PathBuf>>,
    /// 隧道对外的公开地址（如 `https://vp-mobile.xxx.dpdns.org`），配对二维码要用
    public_url: Mutex<Option<String>>,
    /// 一键关断：true 时所有端点返回 503（手机端显示离线页）
    paused: AtomicBool,
    devices: Mutex<BTreeMap<String, Device>>,
    pairing: Mutex<Option<PairingCode>>,
}

impl State {
    fn new(library: Option<PathBuf>) -> Self {
        let devices = match library.as_deref() {
            Some(dir) => load_registry(dir),
            None => BTreeMap::new(),
        };
        Self {
            library: Mutex::new(library),
            public_url: Mutex::new(None),
            paused: AtomicBool::new(false),
            devices: Mutex::new(devices),
            pairing: Mutex::new(None),
        }
    }

    fn library_path(&self) -> Option<PathBuf> {
        self.library.lock().ok().and_then(|g| g.clone())
    }
}

/// 全局单例：tauri 命令用（测试各自 new 独立 State，互不干扰）
static GLOBAL: OnceLock<Arc<State>> = OnceLock::new();
static RUNNING_PORT: OnceLock<Mutex<Option<u16>>> = OnceLock::new();

fn running_port_slot() -> &'static Mutex<Option<u16>> {
    RUNNING_PORT.get_or_init(|| Mutex::new(None))
}

// ============================================================
// 纯工具（可测）
// ============================================================

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 密码学安全随机 token（绝不用时间戳/自增计数）
fn random_token() -> Result<String, String> {
    let mut buf = [0u8; TOKEN_BYTES];
    getrandom::getrandom(&mut buf).map_err(|e| format!("随机数生成失败: {e}"))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// 恒定时间比较：避免按字节提前返回泄露前缀匹配长度
fn ct_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

/// 资产文件名白名单：既要是资产文件，又不得构成路径穿越。
/// 必须在 percent 解码**之后**调用。
fn is_safe_asset_file_name(name: &str) -> bool {
    is_asset_data_file(name)
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && !name.is_empty()
}

/// 从 Cookie 头取指定键的值
fn cookie_value(headers: &[Header], key: &str) -> Option<String> {
    let prefix = format!("{key}=");
    for h in headers {
        if h.field.equiv("Cookie") {
            for part in h.value.as_str().split(';') {
                let part = part.trim();
                if let Some(v) = part.strip_prefix(&prefix) {
                    return Some(v.to_string());
                }
            }
        }
    }
    None
}

/// 只保留纯字母数字的配对码输入（用户可能粘贴进空格/换行）
fn normalize_pairing_code(raw: &str) -> String {
    raw.trim().to_ascii_uppercase()
}

// ============================================================
// 名单持久化
// ============================================================

fn load_registry(dir: &Path) -> BTreeMap<String, Device> {
    let path = dir.join(DEVICES_FILE);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return BTreeMap::new();
    };
    serde_json::from_str::<DeviceRegistry>(&text)
        .map(|r| r.devices)
        .unwrap_or_default()
}

fn save_registry(dir: &Path, devices: &BTreeMap<String, Device>) -> Result<(), String> {
    let path = dir.join(DEVICES_FILE);
    let doc = DeviceRegistry { devices: devices.clone() };
    let json = serde_json::to_string_pretty(&doc).map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(&path, json).map_err(|e| format!("写入 {DEVICES_FILE} 失败: {e}"))
}

/// 读旁路文件原样下发；缺失/损坏一律回 `{}`（前端领域层自己兜底）
fn read_sidecar(dir: &Path, file: &str) -> String {
    std::fs::read_to_string(dir.join(file)).unwrap_or_else(|_| "{}".to_string())
}

// ============================================================
// HTTP 处理
// ============================================================

fn json_response(code: u16, body: String) -> Response<std::io::Cursor<Vec<u8>>> {
    let ct = Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..])
        .expect("静态头部合法");
    let no_store = Header::from_bytes(&b"Cache-Control"[..], &b"no-store"[..]).expect("静态头部合法");
    Response::from_string(body)
        .with_status_code(code)
        .with_header(ct)
        .with_header(no_store)
}

fn err_json(code: u16, msg: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    json_response(code, serde_json::json!({ "error": msg }).to_string())
}

fn html_response(code: u16, body: String) -> Response<std::io::Cursor<Vec<u8>>> {
    let ct = Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
        .expect("静态头部合法");
    Response::from_string(body)
        .with_status_code(code)
        .with_header(ct)
}

/// 认证：Cookie 里的 token 命中名单即通过
fn authenticate(state: &State, headers: &[Header]) -> bool {
    let Some(token) = cookie_value(headers, COOKIE_NAME) else {
        return false;
    };
    let Ok(devices) = state.devices.lock() else {
        return false;
    };
    devices.keys().any(|k| ct_eq(k, &token))
}

fn handle(state: &Arc<State>, req: &mut tiny_http::Request) -> Response<std::io::Cursor<Vec<u8>>> {
    // 一键关断：从手机视角等同「服务未运行」
    if state.paused.load(Ordering::SeqCst) {
        return err_json(503, "服务已关闭");
    }

    let url = req.url().to_string();
    let path = url.split('?').next().unwrap_or("/").to_string();
    let segments: Vec<String> = path
        .trim_start_matches('/')
        .split('/')
        .map(|s| percent_decode_str(s).decode_utf8_lossy().to_string())
        .collect();
    let seg: Vec<&str> = segments.iter().map(|s| s.as_str()).collect();

    // ---- 未认证端点 ----
    match (req.method(), seg.as_slice()) {
        (Method::Get, ["api", "health"]) => {
            let n = state.devices.lock().map(|d| d.len()).unwrap_or(0);
            return json_response(200, serde_json::json!({ "ok": true, "deviceCount": n }).to_string());
        }
        (Method::Post, ["api", "pair"]) => return handle_pair(state, req),
        _ => {}
    }

    // ---- P1 占位首页（P3 换成真正的移动端构建产物）----
    if seg.is_empty() || seg == [""] {
        if !authenticate(state, req.headers()) {
            return html_response(
                401,
                "<!doctype html><meta charset=utf-8><title>手机查看</title>\
                 <p style=\"font:16px/1.6 system-ui;padding:2rem\">未配对设备。请在桌面端点「配对手机」后扫码。</p>"
                    .to_string(),
            );
        }
        return html_response(
            200,
            "<!doctype html><meta charset=utf-8><title>手机查看</title>\
             <p style=\"font:16px/1.6 system-ui;padding:2rem\">服务已就绪（P1）。移动端界面在 P3 接入。</p>"
                .to_string(),
        );
    }

    // ---- 以下全部需要认证 ----
    if !seg.starts_with(&["api"]) {
        return err_json(404, "Not found");
    }
    if !authenticate(state, req.headers()) {
        return err_json(401, "未配对或凭证已失效");
    }
    if req.method() != &Method::Get {
        return err_json(405, "只读服务：不提供写端点");
    }

    let Some(dir) = state.library_path() else {
        return err_json(503, "资产库路径未设置");
    };

    match seg.as_slice() {
        ["api", "assets"] => match scan_asset_library_blocking(dir.to_string_lossy().to_string()) {
            Ok(infos) => json_response(200, serialize_infos(&infos)),
            Err(e) => err_json(500, &e),
        },
        ["api", "assets", file] => {
            if !is_safe_asset_file_name(file) {
                return err_json(400, "非法文件名");
            }
            match std::fs::read_to_string(dir.join(file)) {
                Ok(text) => json_response(200, text),
                Err(_) => err_json(404, "资产不存在"),
            }
        }
        ["api", "facets"] => json_response(
            200,
            serde_json::json!({
                "vocab": parse_sidecar(&read_sidecar(&dir, FACET_VOCAB_FILE)),
                "values": parse_sidecar(&read_sidecar(&dir, FACET_VALUES_FILE)),
            })
            .to_string(),
        ),
        ["api", "tags"] => json_response(
            200,
            serde_json::json!({
                "tags": parse_sidecar(&read_sidecar(&dir, ASSET_TAGS_FILE)),
                "tagGroups": parse_sidecar(&read_sidecar(&dir, TAG_GROUPS_FILE)),
            })
            .to_string(),
        ),
        ["api", "meta"] => json_response(200, read_sidecar(&dir, ASSET_META_FILE)),
        _ => err_json(404, "Not found"),
    }
}

/// 旁路文件解析：损坏时回 `{}` 而不是让整个响应失败
fn parse_sidecar(text: &str) -> serde_json::Value {
    serde_json::from_str(text).unwrap_or_else(|_| serde_json::json!({}))
}

fn serialize_infos(infos: &[AssetFileInfo]) -> String {
    serde_json::to_string(infos).unwrap_or_else(|_| "[]".to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PairRequest {
    code: String,
    #[serde(default)]
    name: Option<String>,
}

/// 配对：一次性配对码 → 长期 token（写入 Cookie）
fn handle_pair(state: &Arc<State>, req: &mut tiny_http::Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let mut body = String::new();
    if req.as_reader().read_to_string(&mut body).is_err() {
        return err_json(400, "请求体不可读");
    }
    let Ok(parsed) = serde_json::from_str::<PairRequest>(&body) else {
        return err_json(400, "请求体格式错误");
    };

    let Some(dir) = state.library_path() else {
        return err_json(503, "资产库路径未设置");
    };

    // 校验一次性配对码，并立即作废（无论成功与否，避免爆破）
    let ok = {
        let Ok(mut slot) = state.pairing.lock() else {
            return err_json(500, "内部状态不可用");
        };
        let verdict = match slot.as_ref() {
            Some(p) if p.expires_at_ms > now_ms() => ct_eq(&p.code, &normalize_pairing_code(&parsed.code)),
            _ => false,
        };
        *slot = None;
        verdict
    };
    if !ok {
        return err_json(401, "配对码无效或已过期");
    }

    let Ok(token) = random_token() else {
        return err_json(500, "token 生成失败");
    };
    let device = Device {
        id: token[..12].to_string(),
        name: parsed.name.unwrap_or_else(|| "手机".to_string()),
        created_at_ms: now_ms(),
    };

    let mut devices = match state.devices.lock() {
        Ok(d) => d,
        Err(_) => return err_json(500, "内部状态不可用"),
    };
    devices.insert(token.clone(), device);
    if let Err(e) = save_registry(&dir, &devices) {
        return err_json(500, &e);
    }
    drop(devices);

    let cookie = format!(
        "{COOKIE_NAME}={token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age={COOKIE_MAX_AGE_SEC}"
    );
    let set_cookie =
        Header::from_bytes(&b"Set-Cookie"[..], cookie.as_bytes()).expect("cookie 值合法");
    Response::from_string(serde_json::json!({ "ok": true }).to_string())
        .with_status_code(200)
        .with_header(
            Header::from_bytes(&b"Content-Type"[..], &b"application/json; charset=utf-8"[..])
                .expect("静态头部合法"),
        )
        .with_header(set_cookie)
}

// ============================================================
// 服务生命周期
// ============================================================

/// 启动服务：**只绑 127.0.0.1**（局域网不可见），返回实际端口。
/// 端口传 0 时由系统分配（测试用）。
fn start_server(state: Arc<State>, port: u16) -> Result<u16, String> {
    let server = Server::http(("127.0.0.1", port)).map_err(|e| format!("监听 127.0.0.1:{port} 失败: {e}"))?;
    let actual = match server.server_addr() {
        tiny_http::ListenAddr::IP(addr) => addr.port(),
        #[allow(unreachable_patterns)]
        _ => port,
    };

    std::thread::Builder::new()
        .name("mobile-http".to_string())
        .spawn(move || {
            for mut req in server.incoming_requests() {
                let resp = handle(&state, &mut req);
                let _ = req.respond(resp);
            }
        })
        .map_err(|e| format!("启动服务线程失败: {e}"))?;

    Ok(actual)
}

// ============================================================
// Tauri 命令
// ============================================================

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileStatus {
    pub running: bool,
    pub port: Option<u16>,
    /// 一键关断开关的状态（true = 已关断，手机会看到离线页）
    pub paused: bool,
    pub device_count: usize,
    pub public_url: Option<String>,
}

fn global_state() -> Arc<State> {
    GLOBAL
        .get_or_init(|| Arc::new(State::new(None)))
        .clone()
}

/// 启动只读服务（幂等：已启动则返回既有端口）。`libraryPath` 为资产库目录。
#[tauri::command]
pub async fn start_mobile_server(library_path: String) -> Result<u16, String> {
    let state = global_state();
    if let Ok(mut g) = state.library.lock() {
        *g = Some(PathBuf::from(&library_path));
    }
    {
        let slot = running_port_slot();
        if let Ok(g) = slot.lock() {
            if let Some(p) = *g {
                return Ok(p); // 已在运行
            }
        }
    }

    // 名单以磁盘为准（可能被别的会话/进程改过）
    if let Ok(mut devices) = state.devices.lock() {
        *devices = load_registry(Path::new(&library_path));
    }

    let port = start_server(state.clone(), 0)?;
    if let Ok(mut g) = running_port_slot().lock() {
        *g = Some(port);
    }
    Ok(port)
}

/// 设置隧道对外的公开地址（配对二维码要用）
#[tauri::command]
pub async fn set_mobile_public_url(url: Option<String>) -> Result<(), String> {
    let state = global_state();
    let cleaned = url.and_then(|u| {
        let t = u.trim().trim_end_matches('/').to_string();
        if t.is_empty() { None } else { Some(t) }
    });
    if let Ok(mut g) = state.public_url.lock() {
        *g = cleaned;
    }
    Ok(())
}

/// 一键关断 / 恢复（关断时所有端点 503；服务进程仍在，只是不响应）
#[tauri::command]
pub async fn set_mobile_server_enabled(enabled: bool) -> Result<(), String> {
    global_state().paused.store(!enabled, Ordering::SeqCst);
    Ok(())
}

/// 服务状态（供界面显示「正在对手机开放」指示）
#[tauri::command]
pub async fn mobile_server_status() -> Result<MobileStatus, String> {
    let state = global_state();
    let port = running_port_slot().lock().ok().and_then(|g| *g);
    Ok(MobileStatus {
        running: port.is_some(),
        port,
        paused: state.paused.load(Ordering::SeqCst),
        device_count: state.devices.lock().map(|d| d.len()).unwrap_or(0),
        public_url: state.public_url.lock().ok().and_then(|g| g.clone()),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingCodeInfo {
    pub code: String,
    pub expires_in_sec: i64,
    /// 配对链接（含公开地址时）；未设置公开地址则只有码
    pub pair_url: Option<String>,
}

/// 生成一次性配对码（有效期 10 分钟；被使用或再次生成即作废）
#[tauri::command]
pub async fn create_mobile_pairing_code() -> Result<PairingCodeInfo, String> {
    let state = global_state();
    let code = random_token()?[..8].to_ascii_uppercase();
    let expires = now_ms() + PAIRING_CODE_TTL_MS;
    if let Ok(mut g) = state.pairing.lock() {
        *g = Some(PairingCode { code: code.clone(), expires_at_ms: expires });
    } else {
        return Err("内部状态不可用".to_string());
    }
    let public_url = state.public_url.lock().ok().and_then(|g| g.clone());
    Ok(PairingCodeInfo {
        pair_url: public_url.map(|u| format!("{u}/?pair={code}")),
        code,
        expires_in_sec: PAIRING_CODE_TTL_MS / 1000,
    })
}

/// 作废全部已配对设备（§8.1 的补救手段：换码而不必逐设备处理）
#[tauri::command]
pub async fn revoke_all_mobile_devices() -> Result<usize, String> {
    let state = global_state();
    let Some(dir) = state.library_path() else {
        return Err("资产库路径未设置".to_string());
    };
    let mut devices = state.devices.lock().map_err(|_| "内部状态不可用".to_string())?;
    let n = devices.len();
    devices.clear();
    save_registry(&dir, &devices)?;
    Ok(n)
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;
    // 测试里直接对 TcpStream（具体类型）调 read_to_string，需要 trait 在作用域内；
    // 生产代码那处是 `dyn Read`，方法调用不依赖 trait 导入。
    use std::io::{Read, Write};
    use std::net::TcpStream;

    fn temp_dir(tag: &str) -> PathBuf {
        let mut buf = [0u8; 8];
        getrandom::getrandom(&mut buf).unwrap();
        let dir = std::env::temp_dir().join(format!(
            "vp-mobile-test-{tag}-{}",
            URL_SAFE_NO_PAD.encode(buf)
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_asset(dir: &Path, name: &str, product: &str) {
        let doc = serde_json::json!({
            "version": "1.0",
            "productName": product,
            "createdAt": "2026-01-01T00:00:00.000Z",
            "updatedAt": "2026-01-02T00:00:00.000Z",
            "parameters": [
                {"id": "1", "group": "基本", "name": "车辆型号", "value": "T-100"},
                {"id": "2", "group": "基本", "name": "整车生产企业", "value": "示例汽车"}
            ]
        });
        std::fs::write(dir.join(name), doc.to_string()).unwrap();
    }

    /// 裸 TCP 发一个 HTTP 请求，返回 (状态码, 响应头原文, 响应体)
    fn raw_http(port: u16, request: &str) -> (u16, String, String) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        stream.write_all(request.as_bytes()).unwrap();
        let mut buf = String::new();
        stream.read_to_string(&mut buf).unwrap();
        let (head, body) = match buf.split_once("\r\n\r\n") {
            Some((h, b)) => (h.to_string(), b.to_string()),
            None => (buf.clone(), String::new()),
        };
        let code = head
            .lines()
            .next()
            .and_then(|l| l.split_whitespace().nth(1))
            .and_then(|c| c.parse::<u16>().ok())
            .unwrap_or(0);
        (code, head, body)
    }

    fn get(port: u16, path: &str, token: Option<&str>) -> (u16, String, String) {
        let cookie = token
            .map(|t| format!("Cookie: {COOKIE_NAME}={t}\r\n"))
            .unwrap_or_default();
        raw_http(
            port,
            &format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n{cookie}Connection: close\r\n\r\n"),
        )
    }

    fn post(port: u16, path: &str, body: &str) -> (u16, String, String) {
        raw_http(
            port,
            &format!(
                "POST {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\n\
                 Content-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            ),
        )
    }

    /// 取响应头里的 Set-Cookie token 值
    fn token_from_set_cookie(head: &str) -> Option<String> {
        head.lines()
            .find(|l| l.to_ascii_lowercase().starts_with("set-cookie:"))
            .and_then(|l| l.split_once(&format!("{COOKIE_NAME}=")))
            .map(|(_, rest)| rest.split(';').next().unwrap().to_string())
    }

    // ---- 纯函数 ----

    #[test]
    fn token_length_and_uniqueness() {
        let a = random_token().unwrap();
        let b = random_token().unwrap();
        assert_ne!(a, b, "两次生成的 token 不应相同");
        assert_eq!(a.len(), 43, "32 字节 base64url 无填充 = 43 字符");
    }

    #[test]
    fn constant_time_eq_matches_normal_eq() {
        assert!(ct_eq("abc", "abc"));
        assert!(!ct_eq("abc", "abd"));
        assert!(!ct_eq("abc", "ab"));
        assert!(!ct_eq("", "a"));
        assert!(ct_eq("", ""));
    }

    #[test]
    fn asset_file_name_whitelist() {
        assert!(is_safe_asset_file_name("某车型.json"));
        assert!(!is_safe_asset_file_name("_asset_tags.json"), "下划线前缀是旁路文件");
        assert!(!is_safe_asset_file_name("custom_enums.json"), "custom_ 前缀是旁路文件");
        assert!(!is_safe_asset_file_name("../etc/passwd"), "路径穿越");
        assert!(!is_safe_asset_file_name("..%2Fsecret.json"));
        assert!(!is_safe_asset_file_name("sub/dir/a.json"), "不得含目录分隔");
        assert!(!is_safe_asset_file_name("a\\b.json"));
        assert!(!is_safe_asset_file_name("notes.txt"), "非 .json");
        assert!(!is_safe_asset_file_name(""));
    }

    #[test]
    fn pairing_code_normalization() {
        assert_eq!(normalize_pairing_code("  ab12cd34\n"), "AB12CD34");
    }

    #[test]
    fn cookie_parsing_picks_named_key() {
        let headers = vec![
            Header::from_bytes(&b"Accept"[..], &b"*/*"[..]).unwrap(),
            Header::from_bytes(&b"Cookie"[..], &b"other=1; vp_device=TOK; extra=2"[..]).unwrap(),
        ];
        assert_eq!(cookie_value(&headers, COOKIE_NAME).as_deref(), Some("TOK"));
        assert_eq!(cookie_value(&headers, "missing"), None);
    }

    #[test]
    fn registry_round_trip() {
        let dir = temp_dir("registry");
        let mut devices = BTreeMap::new();
        devices.insert(
            "tok".to_string(),
            Device { id: "id1".into(), name: "iPhone".into(), created_at_ms: 123 },
        );
        save_registry(&dir, &devices).unwrap();
        let loaded = load_registry(&dir);
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded["tok"].name, "iPhone");
        // 下划线前缀 ⇒ 不被资产扫描谓词当作资产
        assert!(!is_asset_data_file(DEVICES_FILE));
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sidecar_missing_returns_empty_object() {
        let dir = temp_dir("sidecar");
        assert_eq!(read_sidecar(&dir, ASSET_TAGS_FILE), "{}");
        assert_eq!(parse_sidecar("not json"), serde_json::json!({}));
        std::fs::remove_dir_all(&dir).ok();
    }

    // ---- 端到端（真起服务 + 裸 TCP）----

    #[test]
    fn server_serves_only_after_pairing() {
        let dir = temp_dir("e2e");
        write_asset(&dir, "车A.json", "车 A");
        std::fs::write(
            dir.join(ASSET_TAGS_FILE),
            serde_json::json!({"车A.json": ["关键车型"]}).to_string(),
        )
        .unwrap();
        std::fs::write(
            dir.join(ASSET_META_FILE),
            serde_json::json!({"车A.json": {"status": "superseded"}}).to_string(),
        )
        .unwrap();

        let state = Arc::new(State::new(Some(dir.clone())));
        let port = start_server(state.clone(), 0).unwrap();

        // 未配对：401
        let (code, _, _) = get(port, "/api/assets", None);
        assert_eq!(code, 401, "无 token 必须被拒");

        // 伪造 token：401
        let (code, _, _) = get(port, "/api/assets", Some("forged-token"));
        assert_eq!(code, 401, "伪造 token 必须被拒");

        // 未配对时首页也是 401（不泄露任何内容）
        let (code, _, _) = get(port, "/", None);
        assert_eq!(code, 401);

        // health 无需认证
        let (code, _, body) = get(port, "/api/health", None);
        assert_eq!(code, 200);
        assert!(body.contains("\"ok\":true"));

        // 错误配对码：401
        let (code, _, _) = post(port, "/api/pair", r#"{"code":"WRONGCOD"}"#);
        assert_eq!(code, 401, "错误配对码必须被拒");

        // 正确配对码 → 200 + Set-Cookie
        let info = {
            let code = "ABCD1234";
            *state.pairing.lock().unwrap() =
                Some(PairingCode { code: code.to_string(), expires_at_ms: now_ms() + 60_000 });
            code
        };
        let (code, head, _) = post(port, "/api/pair", &format!(r#"{{"code":"{info}"}}"#));
        assert_eq!(code, 200, "正确配对码应成功");
        let token = token_from_set_cookie(&head).expect("响应应带 Set-Cookie");
        assert!(head.contains("HttpOnly"), "cookie 必须是 HttpOnly");
        assert!(head.contains("Secure"));

        // 配对码是一次性的：同一码再用必须失败
        *state.pairing.lock().unwrap() =
            Some(PairingCode { code: info.to_string(), expires_at_ms: now_ms() + 60_000 });
        let (code, _, _) = post(port, "/api/pair", &format!(r#"{{"code":"{info}"}}"#));
        assert_eq!(code, 200);
        let (code, _, _) = post(port, "/api/pair", &format!(r#"{{"code":"{info}"}}"#));
        assert_eq!(code, 401, "配对码用过即废");

        // 持 token：四端点全部 200
        for path in ["/api/assets", "/api/facets", "/api/tags", "/api/meta"] {
            let (code, _, _) = get(port, path, Some(&token));
            assert_eq!(code, 200, "{path} 应可读");
        }

        // assets 返回的是元信息（含 productName），不含 parameters
        let (_, _, body) = get(port, "/api/assets", Some(&token));
        assert!(body.contains("\"productName\":\"车 A\""));
        // 回归锁：真实资产文件是 camelCase，Rust 侧曾因字段名不匹配导致 updatedAt 恒为 null
        assert!(
            body.contains("\"updatedAt\":\"2026-01-02T00:00:00.000Z\""),
            "updatedAt 必须从 camelCase 的 updatedAt 正确反序列化（ADR-0003「每车最新版」依赖它）"
        );
        assert!(!body.contains("\"parameters\""), "列表端点不得下发参数内容");

        // 单资产全文。注意必须百分号编码：HTTP 请求行只能 ASCII，
        // 浏览器对非 ASCII 路径一律编码，这里模拟真实客户端。
        let encoded = percent_encoding::utf8_percent_encode(
            "车A.json",
            percent_encoding::NON_ALPHANUMERIC,
        )
        .to_string();
        let (code, _, body) = get(port, &format!("/api/assets/{encoded}"), Some(&token));
        assert_eq!(code, 200, "百分号编码的非 ASCII 文件名应可读");
        assert!(body.contains("\"parameters\""));
        assert!(body.contains("T-100"));

        // 路径穿越被拒
        for bad in [
            "/api/assets/..%2F_asset_tags.json",
            "/api/assets/../secret.json",
            "/api/assets/_asset_meta.json",
            "/api/assets/custom_enums.json",
        ] {
            let (code, _, _) = get(port, bad, Some(&token));
            assert!(
                code == 400 || code == 404,
                "{bad} 必须被拒（实际 {code}）"
            );
        }

        // 写端点不存在：未认证先被 401 拦下（正确的优先级），
        // 带 token 才走到方法检查，应得 405
        let (code, _, _) = post(port, "/api/assets", "{}");
        assert_eq!(code, 401, "未认证的写请求应先被拒");
        let cookie = format!("Cookie: {COOKIE_NAME}={token}\r\n");
        let (code, _, _) = raw_http(
            port,
            &format!(
                "POST /api/assets HTTP/1.1\r\nHost: 127.0.0.1\r\n{cookie}                 Content-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
            ),
        );
        assert_eq!(code, 405, "带凭证的写请求必须 405（只读服务）");
        // 单资产端点同样不得接受写
        let (code, _, _) = raw_http(
            port,
            &format!(
                "PUT /api/assets/x.json HTTP/1.1\r\nHost: 127.0.0.1\r\n{cookie}                 Content-Length: 2\r\nConnection: close\r\n\r\n{{}}"
            ),
        );
        assert_eq!(code, 405, "PUT 也必须 405");

        // 一键关断 → 503
        state.paused.store(true, Ordering::SeqCst);
        let (code, _, _) = get(port, "/api/assets", Some(&token));
        assert_eq!(code, 503, "关断后应返回 503");
        let (code, _, _) = get(port, "/api/health", None);
        assert_eq!(code, 503, "关断对 health 也生效");
        state.paused.store(false, Ordering::SeqCst);

        // 恢复后可用
        let (code, _, _) = get(port, "/api/assets", Some(&token));
        assert_eq!(code, 200);

        std::fs::remove_dir_all(&dir).ok();
    }

    /// 真机回归：对真实资产库跑扫描，确认 camelCase 反序列化修复在实数据上成立。
    /// 依赖本机 `~/车型数据库`，故默认 ignore（同 `pdf_sniff::tests::sniff_real_downloads` 惯例）；
    /// 需要时：`cargo test -- --ignored real_library_scan`
    #[test]
    #[ignore]
    fn real_library_scan_has_product_name_and_timestamp() {
        let home = std::env::var("HOME").expect("HOME");
        let lib = PathBuf::from(home).join("车型数据库");
        if !lib.is_dir() {
            eprintln!("跳过：{} 不存在", lib.display());
            return;
        }
        let infos = scan_asset_library_blocking(lib.to_string_lossy().to_string()).unwrap();
        assert!(!infos.is_empty(), "真实库应至少扫到一个资产");

        // 注意：不能用「productName 是否等于文件名词干」当解析成功的代理指标——
        // 存量文件名本来就是从 productName 生成的，二者天然相等。
        // productName 与 updatedAt 同属一个 struct、同受 rename_all 影响，
        // 因此 updatedAt 的覆盖率就是该修复的判别性证据。
        let with_time = infos.iter().filter(|i| i.updated_at.is_some()).count();
        let differing = infos
            .iter()
            .filter(|i| i.product_name != i.file_name.trim_end_matches(".json"))
            .count();
        eprintln!(
            "资产数={} 有更新时间={} productName 与文件名不同={}",
            infos.len(),
            with_time,
            differing
        );

        // 修复前：updatedAt 恒为 None（0/519）。修复后应为全部。
        assert!(
            with_time * 10 >= infos.len() * 8,
            "updatedAt 覆盖率应 ≥80%（实际 {}/{}=修复前为 0；ADR-0003「每车最新版」依赖此字段）",
            with_time,
            infos.len()
        );
        // productName 能被解析的独立佐证：若二者有差异，说明值来自文件而非文件名回退
        assert!(
            differing > 0,
            "应存在 productName 与文件名不同的资产（证明取的是文件内容而非回退值）"
        );
    }

    #[test]
    fn pairing_survives_process_restart() {
        let dir = temp_dir("persist");
        write_asset(&dir, "车B.json", "车 B");

        // 一次配对
        let state = Arc::new(State::new(Some(dir.clone())));
        let port = start_server(state.clone(), 0).unwrap();
        *state.pairing.lock().unwrap() =
            Some(PairingCode { code: "PAIR0001".into(), expires_at_ms: now_ms() + 60_000 });
        let (code, head, _) = post(port, "/api/pair", r#"{"code":"PAIR0001"}"#);
        assert_eq!(code, 200);
        let token = token_from_set_cookie(&head).unwrap();

        // 模拟重启：新 State 从磁盘读名单 → 同一 token 仍然可用（「一次配对，永不重配」）
        let restarted = Arc::new(State::new(Some(dir.clone())));
        let port2 = start_server(restarted.clone(), 0).unwrap();
        let (code, _, _) = get(port2, "/api/assets", Some(&token));
        assert_eq!(code, 200, "重启后旧 token 仍应有效");

        // 补证：若名单为空则同一 token 无效（说明上面的通过确实来自持久化，而非放行）
        let empty_dir = temp_dir("persist-empty");
        let blank = Arc::new(State::new(Some(empty_dir.clone())));
        let port3 = start_server(blank.clone(), 0).unwrap();
        let (code, _, _) = get(port3, "/api/assets", Some(&token));
        assert_eq!(code, 401, "名单里没有该 token 时必须拒绝");

        std::fs::remove_dir_all(&dir).ok();
        std::fs::remove_dir_all(&empty_dir).ok();
    }
}
