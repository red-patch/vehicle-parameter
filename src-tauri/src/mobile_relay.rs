//! 自建中继（alma-relay 协议）— 手机经自己的服务器访问本机只读服务
//!
//! 设计依据：`docs/adr/0004-read-only-remote-access-surface.md`（只读远程面）、
//! 协议依据：alma-relay `docs/PROTOCOL.md`（MIT）。
//!
//! 链路：
//! ```text
//! 手机 ──HTTPS──▶ 中继（用户的服务器）◀──出站 WSS── 本进程 ──HTTP──▶ 127.0.0.1 手机查看服务
//! ```
//!
//! 三条不变的性质：
//! 1. 本机服务**仍只绑 127.0.0.1**——中继是出站连接，不监听任何端口。
//! 2. **只读**——只转发 HTTP，不新增写路径；写路径仍唯一留在本机界面（ADR-0004）。
//! 3. 路由令牌本地生成、只把 `sha256` 发给中继；手机侧的认证仍是每设备 token。

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use http_body_util::{BodyExt, Full};
use hyper::header::{HeaderName, HeaderValue};
use hyper::Request;
use hyper_util::client::legacy::{connect::HttpConnector, Client};
use hyper_util::rt::TokioExecutor;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::mpsc::{channel, Sender};
use tokio::task::{AbortHandle, JoinHandle};
use tokio_tungstenite::{connect_async, tungstenite::Message};

/// 中继配置。下划线前缀 ⇒ 被资产扫描谓词排除（同 `_mobile_devices.json`）。
const RELAY_FILE: &str = "_mobile_relay.json";
const TOKEN_BYTES: usize = 32;
/// 单帧队列深度：写不出去时反压响应体，避免大文件在内存里堆满
const FRAME_QUEUE: usize = 32;
const BACKOFF_MAX_SECS: u64 = 30;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct RelayConfig {
    /// 中继根地址，如 `https://relay.example.com`（无尾斜杠）
    url: String,
    /// 路由令牌：只把 sha256 发给中继，手机从二维码里拿到原值
    token: String,
    #[serde(default)]
    enabled: bool,
}

/// 前端显示用（serde camelCase，与 `MobileStatus` 同风格）
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RelayStatus {
    pub configured: bool,
    pub enabled: bool,
    pub url: Option<String>,
    /// 中继对外地址（`{url}/c/{token}`），启用后替代手填的公网地址
    pub public_url: Option<String>,
    /// idle / connecting / connected / error / disabled
    pub state: String,
    pub message: Option<String>,
}

struct Runtime {
    config: Mutex<Option<RelayConfig>>,
    /// (state, message)
    state: Mutex<(String, Option<String>)>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl Default for Runtime {
    fn default() -> Self {
        Self {
            config: Mutex::new(None),
            state: Mutex::new(("idle".to_string(), None)),
            task: Mutex::new(None),
        }
    }
}

fn runtime() -> &'static Runtime {
    static RT: OnceLock<Runtime> = OnceLock::new();
    RT.get_or_init(Runtime::default)
}

fn set_state(state: &str, message: Option<String>) {
    if let Ok(mut s) = runtime().state.lock() {
        *s = (state.to_string(), message);
    }
}

// ============================================================
// 纯工具（可测）
// ============================================================

/// 校验并归一化中继地址：去掉尾斜杠；非本机地址必须走 https
fn normalize_url(raw: &str) -> Result<String, String> {
    let t = raw.trim().trim_end_matches('/');
    if t.is_empty() {
        return Err("请填写中继地址".to_string());
    }
    let lower = t.to_ascii_lowercase();
    if !lower.starts_with("http://") && !lower.starts_with("https://") {
        return Err("中继地址需以 https:// 开头".to_string());
    }
    if lower.starts_with("http://") && !is_loopback(t) {
        return Err("中继地址需使用 https://（本机地址可用 http://）".to_string());
    }
    Ok(t.to_string())
}

fn is_loopback(url: &str) -> bool {
    let host = url.trim_start_matches("http://");
    host.starts_with("127.0.0.1") || host.starts_with("localhost") || host.starts_with("[::1]")
}

/// 手机访问的根地址（不含尾斜杠；配对链接再拼 `/?pair=`）
fn public_url_of(cfg: &RelayConfig) -> String {
    format!("{}/c/{}", cfg.url, cfg.token)
}

fn hex_sha256(text: &str) -> String {
    Sha256::digest(text.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn new_token() -> Result<String, String> {
    let mut buf = [0u8; TOKEN_BYTES];
    getrandom::getrandom(&mut buf).map_err(|e| format!("随机数生成失败: {e}"))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf))
}

fn load(dir: &Path) -> Option<RelayConfig> {
    let text = std::fs::read_to_string(dir.join(RELAY_FILE)).ok()?;
    serde_json::from_str(&text).ok()
}

fn save(dir: &Path, cfg: &RelayConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| format!("序列化失败: {e}"))?;
    std::fs::write(dir.join(RELAY_FILE), json).map_err(|e| format!("写入 {RELAY_FILE} 失败: {e}"))
}

// ============================================================
// 对外状态与生命周期
// ============================================================

pub fn status() -> RelayStatus {
    let rt = runtime();
    let cfg = rt.config.lock().ok().and_then(|c| c.clone());
    let (state, message) = rt
        .state
        .lock()
        .ok()
        .map(|s| s.clone())
        .unwrap_or_else(|| ("idle".to_string(), None));

    match cfg {
        Some(c) => RelayStatus {
            configured: true,
            enabled: c.enabled,
            public_url: c.enabled.then(|| public_url_of(&c)),
            url: Some(c.url),
            state: if c.enabled { state } else { "disabled".to_string() },
            message: if c.enabled { message } else { None },
        },
        None => RelayStatus {
            configured: false,
            enabled: false,
            url: None,
            public_url: None,
            state: "idle".to_string(),
            message: None,
        },
    }
}

/// 启用中的中继地址（配对链接用）；未启用回 `None`，由手填公网地址兜底
pub fn public_url() -> Option<String> {
    let cfg = runtime().config.lock().ok().and_then(|c| c.clone())?;
    cfg.enabled.then(|| public_url_of(&cfg))
}

/// 只读配置、不连（界面打开时用：服务还没启动也要能显示中继地址）
pub fn ensure_loaded(dir: &Path) {
    let rt = runtime();
    if rt.config.lock().map(|c| c.is_some()).unwrap_or(false) {
        return;
    }
    if let Some(cfg) = load(dir) {
        let enabled = cfg.enabled;
        if let Ok(mut g) = rt.config.lock() {
            *g = Some(cfg);
        }
        if enabled {
            set_state("idle", Some("启动手机服务后自动连接".to_string()));
        }
    }
}

/// 启动手机服务后调用：读磁盘配置，启用中就自动连上
pub fn load_and_start(dir: &Path, port: u16) {
    let Some(cfg) = load(dir) else {
        return;
    };
    let enabled = cfg.enabled;
    if let Ok(mut g) = runtime().config.lock() {
        *g = Some(cfg.clone());
    }
    if enabled {
        start_agent(&cfg, port);
    }
}

fn start_agent(cfg: &RelayConfig, port: u16) {
    stop_agent();
    let (base, token) = (cfg.url.clone(), cfg.token.clone());
    let handle = tokio::spawn(async move { agent_loop(base, token, port).await });
    if let Ok(mut t) = runtime().task.lock() {
        *t = Some(handle);
    }
    set_state("connecting", None);
}

fn stop_agent() {
    if let Ok(mut t) = runtime().task.lock() {
        if let Some(h) = t.take() {
            h.abort();
        }
    }
    set_state("idle", None);
}

/// 界面传进来的资产库目录（服务可能还没启动，后端这时还不知道路径）
fn resolve_dir(hint: Option<String>) -> Result<std::path::PathBuf, String> {
    if let Some(raw) = hint {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            let dir = std::path::PathBuf::from(trimmed);
            crate::mobile::remember_library_path(&dir);
            return Ok(dir);
        }
    }
    crate::mobile::current_library_path()
        .ok_or_else(|| "请先在「路径与位置」设置资产库目录".to_string())
}

/// 保存并（启用时）连接中继；`None` = 断开并停用（保留令牌，重新启用无需重配对）
pub fn apply(url: Option<String>, library_path: Option<String>) -> Result<RelayStatus, String> {
    let dir = resolve_dir(library_path)?;
    let rt = runtime();

    match url {
        Some(raw) => {
            let url = normalize_url(&raw)?;
            let mut cfg = rt
                .config
                .lock()
                .map_err(|_| "内部状态不可用".to_string())?
                .clone()
                .unwrap_or_else(|| RelayConfig {
                    url: url.clone(),
                    token: String::new(),
                    enabled: true,
                });
            if cfg.token.is_empty() {
                cfg.token = new_token()?;
            }
            cfg.url = url;
            cfg.enabled = true;
            save(&dir, &cfg)?;
            if let Ok(mut g) = rt.config.lock() {
                *g = Some(cfg.clone());
            }
            match crate::mobile::running_port() {
                Some(port) => start_agent(&cfg, port),
                None => set_state("idle", Some("先启动手机服务".to_string())),
            }
            Ok(status())
        }
        None => {
            let mut cfg = rt
                .config
                .lock()
                .map_err(|_| "内部状态不可用".to_string())?
                .clone()
                .ok_or_else(|| "尚未配置中继".to_string())?;
            cfg.enabled = false;
            save(&dir, &cfg)?;
            if let Ok(mut g) = rt.config.lock() {
                *g = Some(cfg);
            }
            stop_agent();
            Ok(status())
        }
    }
}

/// 更换路由令牌：所有手机需重新扫码（令牌即桌面侧的访问地址）
pub fn regenerate_token(library_path: Option<String>) -> Result<RelayStatus, String> {
    let dir = resolve_dir(library_path)?;
    let rt = runtime();
    let mut cfg = rt
        .config
        .lock()
        .map_err(|_| "内部状态不可用".to_string())?
        .clone()
        .ok_or_else(|| "尚未配置中继".to_string())?;
    cfg.token = new_token()?;
    save(&dir, &cfg)?;
    if let Ok(mut g) = rt.config.lock() {
        *g = Some(cfg.clone());
    }
    if cfg.enabled {
        if let Some(port) = crate::mobile::running_port() {
            start_agent(&cfg, port);
        }
    }
    Ok(status())
}

#[tauri::command]
pub async fn set_mobile_relay(
    url: Option<String>,
    library_path: Option<String>,
) -> Result<RelayStatus, String> {
    apply(url, library_path)
}

#[tauri::command]
pub async fn regenerate_mobile_relay_token(
    library_path: Option<String>,
) -> Result<RelayStatus, String> {
    regenerate_token(library_path)
}

// ============================================================
// agent：出站 WSS + HTTP 转发
// ============================================================

type HttpClient = Client<HttpConnector, Full<Bytes>>;

fn build_client() -> HttpClient {
    Client::builder(TokioExecutor::new()).build_http()
}

/// 重连策略：网络类错误退避重试；中继明确拒绝（令牌被占用 / 鉴权失败）不重试
struct AgentError {
    message: String,
    retry: bool,
}

impl AgentError {
    fn retryable(message: impl Into<String>) -> Self {
        Self { message: message.into(), retry: true }
    }

    fn fatal(message: impl Into<String>) -> Self {
        Self { message: message.into(), retry: false }
    }
}

async fn agent_loop(base: String, token: String, port: u16) {
    let client = build_client();
    let mut backoff = 1u64;
    loop {
        set_state("connecting", None);
        let started = Instant::now();
        match run_once(&base, &token, port, &client).await {
            Ok(()) => set_state("error", Some("中继连接已断开".to_string())),
            Err(e) => {
                set_state("error", Some(e.message));
                if !e.retry {
                    return;
                }
            }
        }
        // 连得足够久说明不是配置错误，重连从 1s 重新起步
        if started.elapsed() >= Duration::from_secs(30) {
            backoff = 1;
        }
        tokio::time::sleep(Duration::from_secs(backoff)).await;
        backoff = (backoff * 2).min(BACKOFF_MAX_SECS);
    }
}

async fn run_once(
    base: &str,
    token: &str,
    port: u16,
    client: &HttpClient,
) -> Result<(), AgentError> {
    let hash = hex_sha256(token);
    let url = format!("{}/agent?th={}", base.replacen("http", "ws", 1), hash);
    let (ws, _) = connect_async(&url)
        .await
        .map_err(|e| AgentError::retryable(format!("连接中继失败：{e}")))?;
    let (mut sink, mut stream) = ws.split();

    let (tx, mut rx) = channel::<Message>(FRAME_QUEUE);
    let writer = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
    });

    send_frame(
        &tx,
        json!({
            "t": "register",
            "tokenHash": hash,
            "name": "vpw-desktop",
            "ver": env!("CARGO_PKG_VERSION"),
        }),
    )
    .await;

    let cancels: Arc<Mutex<HashMap<String, AbortHandle>>> = Arc::new(Mutex::new(HashMap::new()));
    let mut outcome: Result<(), AgentError> = Ok(());

    while let Some(msg) = stream.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                outcome = Err(AgentError::retryable(format!("中继连接中断：{e}")));
                break;
            }
        };
        // 4000 = 另一台桌面抢占了同一令牌，重试只会互相踢（PROTOCOL.md）
        if let Message::Close(Some(frame)) = &msg {
            if u16::from(frame.code) == 4000 {
                outcome = Err(AgentError::fatal("另一台桌面已占用该中继令牌"));
                break;
            }
        }
        let Message::Text(text) = msg else { continue };
        let Ok(frame) = serde_json::from_str::<Value>(&text) else {
            continue;
        };
        match frame["t"].as_str() {
            Some("registered") => set_state("connected", None),
            Some("error") => {
                outcome = Err(AgentError::fatal(format!(
                    "中继拒绝注册：{}",
                    frame["message"].as_str().unwrap_or("未知原因")
                )));
                break;
            }
            Some("hreq") => spawn_forward(frame, tx.clone(), client.clone(), port, &cancels),
            Some("hcancel") => {
                if let Some(id) = frame["id"].as_str() {
                    let hit = cancels.lock().ok().and_then(|mut m| m.remove(id));
                    if let Some(h) = hit {
                        h.abort();
                    }
                }
            }
            _ => {}
        }
    }

    writer.abort();
    if let Ok(mut m) = cancels.lock() {
        for (_, h) in m.drain() {
            h.abort();
        }
    };
    outcome
}

fn spawn_forward(
    frame: Value,
    tx: Sender<Message>,
    client: HttpClient,
    port: u16,
    cancels: &Arc<Mutex<HashMap<String, AbortHandle>>>,
) {
    let Some(id) = frame["id"].as_str().map(str::to_string) else {
        return;
    };
    let key = id.clone();
    let owned = Arc::clone(cancels);
    let handle = tokio::spawn(async move {
        forward(frame, tx, client, port).await;
        if let Ok(mut m) = owned.lock() {
            m.remove(&key);
        }
    });
    if let Ok(mut m) = cancels.lock() {
        m.insert(id, handle.abort_handle());
    }
}

async fn forward(frame: Value, tx: Sender<Message>, client: HttpClient, port: u16) {
    let id = frame["id"].as_str().unwrap_or_default().to_string();
    let method = frame["method"].as_str().unwrap_or("GET");
    let path = frame["path"].as_str().unwrap_or("/");
    let body = frame["b"]
        .as_str()
        .and_then(|s| B64.decode(s).ok())
        .unwrap_or_default();

    let mut builder = Request::builder()
        .method(method)
        .uri(format!("http://127.0.0.1:{port}{path}"));
    if let Some(headers) = frame["headers"].as_object() {
        for (k, v) in headers {
            // 逐跳头与长度/编码由本机请求重新生成
            if matches!(
                k.to_ascii_lowercase().as_str(),
                "host" | "connection" | "content-length" | "transfer-encoding" | "accept-encoding"
            ) {
                continue;
            }
            let Some(value) = v.as_str().and_then(|s| HeaderValue::from_str(s).ok()) else {
                continue;
            };
            let Ok(name) = HeaderName::from_bytes(k.as_bytes()) else {
                continue;
            };
            builder = builder.header(name, value);
        }
    }

    let request = match builder.body(Full::new(Bytes::from(body))) {
        Ok(r) => r,
        Err(e) => {
            send_frame(&tx, json!({ "t": "herr", "id": id, "message": e.to_string() })).await;
            return;
        }
    };

    let response = match client.request(request).await {
        Ok(r) => r,
        Err(e) => {
            send_frame(&tx, json!({ "t": "herr", "id": id, "message": e.to_string() })).await;
            return;
        }
    };

    let (parts, mut body) = response.into_parts();
    let mut headers = serde_json::Map::new();
    for (k, v) in &parts.headers {
        if matches!(k.as_str(), "connection" | "transfer-encoding" | "keep-alive") {
            continue;
        }
        if let Ok(v) = v.to_str() {
            headers.insert(k.as_str().to_string(), json!(v));
        }
    }
    send_frame(
        &tx,
        json!({ "t": "hres", "id": id, "status": parts.status.as_u16(), "headers": headers }),
    )
    .await;

    while let Some(next) = body.frame().await {
        match next {
            Ok(chunk) => {
                if let Some(data) = chunk.data_ref() {
                    if !data.is_empty() {
                        send_frame(&tx, json!({ "t": "hchunk", "id": id, "b": B64.encode(data) }))
                            .await;
                    }
                }
            }
            Err(e) => {
                send_frame(&tx, json!({ "t": "herr", "id": id, "message": e.to_string() })).await;
                return;
            }
        }
    }
    send_frame(&tx, json!({ "t": "hend", "id": id })).await;
}

/// 写不出去说明连接已断：读循环随后会结束并触发重连，这里不额外处理
async fn send_frame(tx: &Sender<Message>, value: Value) {
    let _ = tx.send(Message::Text(value.to_string().into())).await;
}

// ============================================================
// 测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "vpw-relay-test-{tag}-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("建临时目录");
        dir
    }

    #[test]
    fn normalize_accepts_https_and_strips_slash() {
        assert_eq!(
            normalize_url(" https://relay.example.com/ ").unwrap(),
            "https://relay.example.com"
        );
    }

    #[test]
    fn normalize_rejects_plain_http_on_public_host() {
        assert!(normalize_url("http://relay.example.com").is_err());
    }

    #[test]
    fn normalize_allows_http_on_loopback() {
        assert_eq!(
            normalize_url("http://127.0.0.1:8787").unwrap(),
            "http://127.0.0.1:8787"
        );
        assert_eq!(
            normalize_url("http://localhost:8787").unwrap(),
            "http://localhost:8787"
        );
    }

    #[test]
    fn normalize_rejects_empty_and_other_schemes() {
        assert!(normalize_url("   ").is_err());
        assert!(normalize_url("relay.example.com").is_err());
        assert!(normalize_url("ftp://relay.example.com").is_err());
    }

    #[test]
    fn public_url_keeps_token_in_path() {
        let cfg = RelayConfig {
            url: "https://relay.example.com".to_string(),
            token: "abcDEF_-123".to_string(),
            enabled: true,
        };
        assert_eq!(
            public_url_of(&cfg),
            "https://relay.example.com/c/abcDEF_-123"
        );
    }

    #[test]
    fn token_is_url_safe_and_long_enough() {
        let t = new_token().unwrap();
        assert_eq!(t.len(), 43);
        assert!(t.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn token_hash_is_sha256_hex() {
        assert_eq!(
            hex_sha256("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    struct Probe {
        status: u16,
        headers: serde_json::Map<String, Value>,
        body: String,
    }

    /// 假中继：等 agent 注册后发一条 `hreq`，把回的帧收成一次响应
    async fn start_fake_relay(path: &str) -> (String, tokio::task::JoinHandle<Probe>) {
        use tokio::net::TcpListener;
        use tokio_tungstenite::accept_async;

        let listener = TcpListener::bind(("127.0.0.1", 0)).await.expect("绑中继端口");
        let relay_port = listener.local_addr().expect("取端口").port();
        let path = path.to_string();
        let relay = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.expect("accept");
            let mut ws = accept_async(stream).await.expect("WS 握手");
            let first = ws.next().await.expect("应收到 register").expect("帧可读");
            let register: Value =
                serde_json::from_str(first.to_text().expect("文本帧")).expect("register 是 JSON");
            assert_eq!(register["t"], "register");
            assert_eq!(register["tokenHash"].as_str().map(str::len), Some(64));

            ws.send(Message::Text(json!({ "t": "registered" }).to_string().into()))
                .await
                .expect("回 registered");
            ws.send(Message::Text(
                json!({ "t": "hreq", "id": "1", "method": "GET", "path": path, "headers": {} })
                    .to_string()
                    .into(),
            ))
            .await
            .expect("发 hreq");

            let mut status = 0u16;
            let mut headers = serde_json::Map::new();
            let mut body = String::new();
            while let Some(msg) = ws.next().await {
                let text = msg.expect("帧可读");
                let frame: Value =
                    serde_json::from_str(text.to_text().expect("文本帧")).expect("JSON");
                match frame["t"].as_str() {
                    Some("hres") => {
                        status = frame["status"].as_u64().unwrap_or(0) as u16;
                        if let Some(h) = frame["headers"].as_object() {
                            headers = h.clone();
                        }
                    }
                    Some("hchunk") => {
                        let raw = B64
                            .decode(frame["b"].as_str().unwrap_or_default())
                            .expect("base64");
                        body.push_str(&String::from_utf8(raw).expect("utf8"));
                    }
                    Some("hend") => break,
                    _ => {}
                }
            }
            Probe { status, headers, body }
        });

        (format!("http://127.0.0.1:{relay_port}"), relay)
    }

    async fn probe_through_relay(backend_port: u16, path: &str) -> Probe {
        let (base, relay) = start_fake_relay(path).await;
        let client = build_client();
        let agent = tokio::spawn(async move {
            let _ = run_once(&base, "test-token", backend_port, &client).await;
        });
        let probe = tokio::time::timeout(Duration::from_secs(10), relay)
            .await
            .expect("中继侧应超时前完成")
            .expect("中继任务不应 panic");
        agent.abort();
        probe
    }

    /// 帧协议端到端：`hreq` → 本机 HTTP → `hres / hchunk / hend`。
    #[tokio::test]
    async fn forwards_http_through_relay_frames() {
        let server = tiny_http::Server::http(("127.0.0.1", 0)).expect("起本机服务");
        let port = match server.server_addr() {
            tiny_http::ListenAddr::IP(addr) => addr.port(),
            #[allow(unreachable_patterns)]
            _ => panic!("需要 IP 监听地址"),
        };
        std::thread::spawn(move || {
            for req in server.incoming_requests() {
                let header =
                    tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                        .expect("静态头合法");
                let _ = req.respond(tiny_http::Response::from_string(r#"{"ok":true}"#).with_header(header));
            }
        });

        let probe = probe_through_relay(port, "/api/health").await;
        assert_eq!(probe.status, 200);
        assert!(probe.body.contains(r#""ok":true"#), "响应体应透传，实际 {:?}", probe.body);
    }

    /// 真实手机查看服务穿隧道：未配对首页 401、免认证端点 200。
    #[tokio::test]
    async fn tunnels_real_mobile_service() {
        let port = crate::mobile::spawn_test_server(None);

        let home = probe_through_relay(port, "/").await;
        assert_eq!(home.status, 401);
        assert!(home.body.contains("未配对设备"), "应是我们自己的页面，实际 {:?}", home.body);

        let health = probe_through_relay(port, "/api/health").await;
        assert_eq!(health.status, 200);
        assert!(health.body.contains("\"ok\":true"), "实际 {:?}", health.body);
        assert!(
            health.headers.get("content-type").and_then(Value::as_str).is_some(),
            "响应头应透传，实际 {:?}",
            health.headers
        );
    }

    /// 启用中继这条链路：落盘配置、派生公网地址、agent 真的连上并转发。
    #[tokio::test]
    async fn apply_persists_and_derives_public_url() {
        let dir = tmp_dir("apply");
        let port = crate::mobile::spawn_test_server(None);
        crate::mobile::set_running_port_for_test(port);
        crate::mobile::remember_library_path(&dir);

        let (base, relay) = start_fake_relay("/api/health").await;
        let status = apply(Some(base.clone()), None).expect("应能启用中继");

        assert!(status.enabled);
        let public = status.public_url.clone().expect("应派生公网地址");
        assert!(public.starts_with(&format!("{base}/c/")), "实际 {public}");
        assert!(dir.join(RELAY_FILE).exists(), "配置应落盘");

        let probe = tokio::time::timeout(Duration::from_secs(10), relay)
            .await
            .expect("中继侧应超时前完成")
            .expect("中继任务不应 panic");
        assert_eq!(probe.status, 200, "agent 应已连上并转发");

        stop_agent();
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn config_roundtrips_on_disk() {
        let dir = tmp_dir("roundtrip");
        assert!(load(&dir).is_none());
        let cfg = RelayConfig {
            url: "https://relay.example.com".to_string(),
            token: "tok".to_string(),
            enabled: true,
        };
        save(&dir, &cfg).unwrap();
        let back = load(&dir).expect("应能读回");
        assert_eq!(back.url, cfg.url);
        assert_eq!(back.token, cfg.token);
        assert!(back.enabled);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
