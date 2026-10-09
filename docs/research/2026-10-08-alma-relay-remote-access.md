# Alma `relay.alma.now` 远程访问架构调研

> 日期：2026-10-08 ｜ 状态：调研完成（待评审）
> 目的：评估 Alma（alma.now）的 `relay.alma.now` 中继方案，为本项目「本机只读 HTTP 服务 + Cloudflare 命名 Tunnel（cloudflared）+ 隧道边缘终止 TLS + HttpOnly Cookie 长期令牌 + 二维码配对」候选方案提供对比依据。

**证据分级（本报告对每一条结论都标注）**
- **已验证·代码**：协调者直接解包 `Alma.app`（v0.4.167）并阅读 `app.asar` 内 main/renderer 反编译产物得到，视为权威。
- **已验证·探测**：本报告对公网端点做的实时观测（含命令与原始输出）。
- **已验证·发布说明**：官方发布归档仓库 `yetone/alma-releases` 的原文条目。
- **已验证·官方文档**：`alma.now/docs` 官方文档原文。
- **推断**：由一手事实推导、无直接一手声明，或存在多来源冲突。

---

## 摘要（TL;DR）

**Alma 是什么（已验证·代码）**：Alma（官网 alma.now，作者 yetone）是一款「本地优先」的桌面 AI 客户端 / Agent 编排应用，**Electron** 壳（bundle id `com.yetone.alma`，v0.4.167，二进制内标注 MIT + 仓库 `https://github.com/yetone/alma`），内嵌 Express 5 API 服务默认监听 `127.0.0.1:23001`，聊天走 `/ws/threads` 双向 WebSocket。移动端是**独立的原生 iOS App（Capacitor 构建，打包 `@capacitor/*` v6：camera / haptics / push-notifications / preferences 等）**，iOS 端可选「在手机上自跑后端」或「驱动 Mac 上的 Alma」。

**`relay.alma.now` 是什么（已验证）**：它不是 HTTP-over-tunnel，而是 Alma **自运营的「出站 WebSocket 反向代理 / rendezvous」中继**。桌面端主动把本地 `127.0.0.1:23001` 的整个 HTTP+WS API 经一条**出站 WebSocket** 隧道给手机端，**桌面不开任何入站端口**。中继是 **Cloudflare Workers 部署**（`/healthz` 返回 `edition:"cloudflare"`，`Server-Timing` 含 `cfWorker`，历史域名 `alma-relay.yetoneful.workers.dev`）。中继服务端代码**不在桌面 bundle 内**（桌面只含客户端），且**GitHub 上无公开的服务端仓库/文档**（已验证·探测）。

**加密模型（最关键，已验证·代码，两个 bundle 常量逐字一致）**：
- **端到端加密真实存在、且默认开启**：P-256 ECDH（认证式临时密钥，配对码作 PSK）+ SHA-256 握手 transcript + HKDF 派生的 **AES-GCM** 全双工加密，协议串 `alma-relay-e2e/v1`。握手用四把密钥 `c2s / s2c / confirm-r / confirm-i`，recipient 校验失败会明确报 `"Handshake authentication failed (wrong code or man-in-the-middle)"`。默认 `e2eEncryption: true`。
- **E2E 开启时，中继（及 Cloudflare）只见密文**：手机↔Mac 信道由配对码认证，**中继/边缘无法 MITM**——这是 Alma 相对本项目方案的核心优势。
- **中继确有「明文模式」（legacy）**：关闭 E2E 时，中继会终止手机的 HTTP/TLS 并代发到桌面，**中继可见完整明文（含 headers、cookies、body）**。明文模式额外提供浏览器可打开的 Web UI（`https://relay.alma.now/c/<connectCode>`，已验证·探测到该路由存在：返回 `502`）。**团队（Team）中继强制 `e2eEncryption: false`**。

**账号模型（已验证·代码，需重点修正一处常见误解）**：**Alma 应用本身无需账号**（本地优先，填 API key 即用，多篇第三方评测与官方文档一致）；但**经由官方共享中继做远程访问需要 Alma 账号**——`registrationKey` 是一枚 Alma 账号 JWT（桌面读取其 `email` claim 并显示在设置里）。即：账号用于「能否接入官方中继」这一层。

**与本项目候选方案的关系（结论）**：两者的**共性骨架一致**——都靠常驻进程**出站**连到公网边缘、都不开入站端口、都用一个配对令牌准入。**核心分野是「边缘是否可见明文」**：本项目（cloudflared Tunnel）TLS 终止在 Cloudflare 边缘 → 边缘可见明文；Alma 在此之上叠加**应用层 E2E**，使中继看不到明文。**Alma 的中继路线值得纳入评估，其最大可借鉴点是「应用层 E2E」**；但代价是要自建/自运营中继 + 原生 App，复杂度高于开箱即用的 cloudflared。

---

## 观察到的原始事实

### 1. 桌面端形态与服务绑定（已验证·代码）

- Electron 应用，bundle id `com.yetone.alma`，版本 v0.4.167，二进制内标注 **MIT**、仓库 `https://github.com/yetone/alma`。**注意**：该 GitHub 仓库当前**公开不可访问**（`gh api repos/yetone/alma` → `404 Not Found`，已验证·探测），源码未公开；公开发布产物在 `github.com/yetone/alma-releases`。
- 本地 API 服务**只绑回环** `127.0.0.1`（默认端口 `23001`），无入站端口暴露。中继通过 `http://127.0.0.1:<localPort><path>` 回环代理本地 API。
- 桌面内默认中继常量：`const fJ="https://relay.alma.now"`（另有社区常量 `mJ` → `community.alma.now`）；代码会把旧域名 `https://alma-relay.yetoneful.workers.dev` 迁移改写为 `relay.alma.now`。（已验证·代码）

### 2. `relay.alma.now` — HTTP/WS 探测（已验证·探测）

```
$ curl -I https://relay.alma.now
HTTP/2 404
content-type: application/json
access-control-allow-origin: *
server: cloudflare
cf-ray: a474caaeccc10705-HKG
```
→ 根路径 404，JSON 体 `{"error":"Not found"}`。

```
$ curl -sS https://relay.alma.now/healthz
{"ok":true,"edition":"cloudflare"}
```
→ **`edition:"cloudflare"` ⇒ 中继是 Cloudflare（Workers）部署**（已验证·探测 + 已验证·代码一致）。

```
$ curl -sS https://relay.alma.now/agent           # 不带 WS 升级
{"error":"WebSocket upgrade required"}            # HTTP 426
$ # 原始 WS 握手（带 Upgrade，但不带鉴权参数）
HTTP/1.1 400 Bad Request
{"error":"Missing or invalid token hash (th)"}
```
→ `/agent` 是**中继的 WebSocket 接入点**，用 `th`（token hash）路由（已验证·代码：`th` = `routingToken`）。`Server-Timing: cfEdge;dur=..,cfOrigin;dur=0,cfWorker;dur=0` 亦证明由 Cloudflare Worker 处理。

```
$ curl -sS -X POST https://relay.alma.now/turn
{"error":"Relay token required"}                  # HTTP 401     —— 本报告独立复现
$ curl -sS -o /dev/null -w "%{http_code}" "https://relay.alma.now/c/<connectCode>"
502                                               # 明文模式 Web UI 路由存在，此刻无桌面在线 → 502
```
→ `/turn` 需 `Authorization: Bearer <registrationKey>`，返回 `{iceServers, ttl}`（**中继兼作 WebRTC TURN 凭据下发**）。`/c/<connectCode>` 是**明文模式**给浏览器用的 Web UI 入口。

其余探测均 `404 {"error":"Not found"}`：`/`、`/ws`、`/connect`、`/relay`、`/reg`、`/pair`、`/oauth`、`/openapi.json`、`/.well-known/`。

**本地 DNS 说明（诚实记录）**：`dig relay.alma.now` 在本机返回 `198.18.2.129`，但 `cloudflare.com`、`www.baidu.com` 同样落 `198.18.0.0/15`（RFC 2544 保留段）——说明**本机解析器处于 fake-IP / 加速分流代理模式，拦截了所有 A 记录**。故**不可据本机 `dig` 推断任何 IP/地理位置**；可信的是 HTTP 行为与 TLS 证书。（已验证·探测，含 DoH 核对见下）

用 DoH 直查 Cloudflare 得**真实记录**：

```
$ curl -H 'accept: application/dns-json' \
  'https://cloudflare-dns.com/dns-query?name=relay.alma.now&type=A'
{"Answer":[{"data":"104.21.30.37"},{"data":"172.67.150.132"}]}
```
→ `relay.alma.now`、`alma.now`、`community.alma.now` 解析到同一对 **Cloudflare Anycast IP**，NS = `bradley.ns.cloudflare.com` / `kami.ns.cloudflare.com`。（已验证·探测）

### 3. TLS 证书（已验证·探测）

```
$ echo | openssl s_client -connect relay.alma.now:443 -servername relay.alma.now 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
subject=CN=alma.now
issuer=C=US, O=Google Trust Services, CN=WE1
notBefore=Sep  2 14:26:33 2026 GMT
notAfter=Dec  1 15:26:21 2026 GMT
X509v3 Subject Alternative Name:
    DNS:alma.now, DNS:relay.alma.now, DNS:*.relay.alma.now
```
→ 一张通配证书同时覆盖 `alma.now` 与 `relay.alma.now`（GTS WE1 签发）。这**只说明外层传输层 TLS 终止在 Cloudflare 边缘**，不代表应用层无 E2E——E2E 是隧道内部的第二层。

### 4. 中继协议与握手帧（已验证·代码）

桌面类 `MobileRelay`（反编译名 `class ty`），配置 `{serverUrl, connectCode, registrationKey, localPort, deviceName, e2eEncryption}`：

- 建连：`ws(s)://<relay>/agent?th=<routingToken>`，**全程出站，桌面不开入站端口**。
- `routingToken`：明文模式下 = `sha256(connectCode)`；E2E 模式下 = HKDF 派生的 `hash(connectCode)`（与手机端同法）。
- 桌面 socket 先发 `register` 帧：`{t:"register", tokenHash, name, key: registrationKey}`（`registrationKey` 即账号 JWT）。
- 心跳：WS ping 每 **15s**；无响应即断开重连；重连指数退避 `1s → ×2，上限 30s`；收到 close code **4000** → 状态置 "replaced"（另一台 Alma 桌面抢占了该配对）。
- 帧协议（短名，JSON）：`register/registered`；`hreq/hres/hchunk/hend/herr`（HTTP 请求-响应代理，分块，base64）；`hcancel`；`wopen/wopened/wmsg/wclose/werr`（WebSocket 隧道）；`pushed`。分块 **256 KB**，WS 单帧上限 **256 MB**。代理转发前会**剥离** `host`、`connection`、`content-length`、`accept-encoding` 并强制 `accept-encoding: identity`。
- **两种模式**：
  1. **明文中继（legacy）**：中继终止手机的 HTTP/TLS，再代发到桌面 → **中继可见完整明文**；同时发布 `connectUrl = https://relay.alma.now/c/<connectCode>` 供浏览器打开（web UI）。
  2. **E2E 中继**：WS 路径为 `/__alma_e2e__` 时，桌面创建 `E2EResponder`（不再透明代理）。若桌面关了 E2E，中继回 `werr` "E2E not enabled on this desktop"。

### 5. 加密模型（最关键；已验证·代码，desktop 与 iOS/renderer 两个 bundle 常量逐字一致）

常量：`CURVE="P-256"`、`HKDF_HASH="SHA-256"`、`AES="AES-GCM"`、`PROTOCOL="alma-relay-e2e/v1"`；仅用 WebCrypto `crypto.subtle`。

- **路由**：`routingToken = b64u(HKDF(ikm=connectCode, salt=PROTOCOL+"/routing", info=∅, 128 bits))`。**只有该哈希到达中继，配对码本身永不外发**。
- **握手（认证式临时 ECDH，配对码作 PSK）**：
  - 发起方（手机）生成临时 P-256 密钥对，发 `{t:"hi", epk, n:<nonce>}`。
  - 响应方（桌面）生成自己的临时密钥对，算 `ECDH(my_priv, peer_pub)` → HKDF-Extract；`transcript = SHA-256(PROTOCOL ‖ initiatorPub ‖ responderPub ‖ initiatorNonce ‖ responderNonce)`；HKDF-Expand(salt=code) 出四把 256-bit 密钥 `c2s / s2c / confirm-r / confirm-i`；回 `{t:"hi", epk, n, cr:<confirmResponder>}`。
  - 发起方常量时间比较校验 `cr`，回 `{t:"ok", ci:<confirmInitiator>}`；响应方校验 `ci`，失败即报 `"Handshake authentication failed (wrong code or man-in-the-middle)"`。
- **机密性**：AES-GCM，12 字节 IV = 4 个零字节 ‖ 64-bit 大端计数器，**每方向单调递增**（避免 nonce 误用的顺序性；注意**未随机化首 4 字节**，除计数器顺序外**无重放窗口**）。内层 JSON 帧 ⇒ 封装为二进制 ⇒ 以 base64 放 `wmsg` 的 `b` 字段。
- **后果**：E2E 模式下中继（及 Cloudflare 边缘）**只承载密文**；手机↔Mac 信道由配对码认证，**已认证的中继/边缘无法 MITM**。反之，明文模式中继可见全部明文。

### 6. 配对模型（已验证·代码）

- 桌面 UI：设置 → Remote Access（远程访问），渲染 QR（内容为 `status.pairingLink`）。
- `connectCode` = 32 随机字节 base64url；`/api/mobile-relay/regenerate` 可轮换。设置文案原文：
  - “Regenerate the connect code? Paired phones will lose access until they re-pair.”
  - “This link grants full access to this Alma. Share it only with your own devices; regenerate it to revoke access.”
- **E2E 开** → `pairingLink = alma://connect?u=<relayUrl>&k=<connectCode>&e2e=1`，且 `connectUrl = null`（**E2E 必须用原生 App**，因为 E2E 会话在 App JS 内）。
- **E2E 关** → `pairingLink = alma://connect?u=<relay>/c/<connectCode>`，且 `connectUrl = https://relay.alma.now/c/<connectCode>`（浏览器可开）。
- iOS：扫 QR（camera）或粘贴 pairing link；解析深链后存 `alma-private-handoff-pairing`，把后端模式设为 `remote` 并重载。
- **默认 `e2eEncryption` 为 `true`**（`e2eEncryption: !1 !== n.e2eEncryption`；catch 兜底亦为 `true`）。**Team 中继显式强制 `e2eEncryption: false`**。
- 账号登录：OAuth loopback（`/api/mobile-relay/connect-account` → 本机回调 `/api/mobile-relay/oauth-callback?state=&token=`）返回中继 JWT，存为 `registrationKey`；同一 OAuth 也用于 Team 中继。授权落地页为 `https://community.alma.now`（已验证·探测，首页标题 `Alma Community`）。

### 7. 其他已验证事实（·代码）

- **中继兼作 TURN 凭据代理**：`POST <relay>/turn`（Bearer `registrationKey`）→ `{iceServers, ttl}`（带缓存）。但 WebRTC（`RTCPeerConnection` + `createDataChannel('input')`）用于 **Computer Use 屏幕串流**（桌面→手机，H.264，为文字清晰做过 profile hack），**不是 App 数据面**，勿混淆。
- 手机推送走独立通道：`/api/mobile/push-devices` + 原生 `alma-notifications` 模块（APNs）。
- **LAN 回退**（App 内文档原文）："Same Wi-Fi? Your Mac's LAN address works too, e.g. http://192.168.1.20:23001."；**Team host 绑 `0.0.0.0`，个人 API 服务绑 `127.0.0.1`**。
- 在线状态：桌面把 last-seen 落文件 + 维护实时 socket 数，用于显示手机在线/离线。

### 8. 官方文档 / 发布说明 / 一手来源盘点

- **官方在线文档**：`https://alma.now/docs/`（中文；英文入口 `https://alma.now/docs/guide/`）。导航：指南 / 功能 / 服务商 / 设置。**逐项核对 `features/`、`settings/` 目录，未发现任何标题含「远程访问 / relay / 中继 / 配对 / 隧道」的文档页**——远程访问**仅以 App 内设置页形态存在，无公开文档**。（已验证·官方文档）
- **`features/chrome-relay.html`**（官方）：Chrome 扩展经**本地** WebSocket（默认端口 `23001`）+ Auth Token 连 Alma，走 CDP 控制浏览器。这是「本机扩展 ↔ 本机服务」的**本地**中继，**与远程中继 `relay.alma.now` 不是一回事**。（已验证·官方文档）
- **发布说明**（`yetone/alma-releases`，归档仓库）逐条 grep 到的远程访问原文（已验证·发布说明）：
  - `v0.4.150`（2026-09-27）：“You can choose a self-hosted relay in remote access settings.”
  - `v0.4.148`（2026-09-26）：“Pair your phone with multiple Macs and switch between them.” / “Reconnect automatically when a Mac’s relay link drops.”
  - `v0.4.91`（2026-09-21）：“The Remote Access pairing card now confirms when your phone is connected, shows its name and app version …”
  - `v0.4.81`（2026-09-21）：“Fixed iOS messages being lost during tunnel gaps …” / “Improved iOS relay tunnel reliability …”
  - `v0.4.69`（2026-09-20）：“iOS: Added native Settings, **QR-code pairing**, and first-run onboarding.”
  - `v0.4.64`（2026-09-19）：“iOS: added … live relay status, **one-tap pairing**, and a signed App Store build.”
  - `v0.4.139`（2026-09-24）：“Added Alma Server … accessible through a browser over an SSH port forward, the iOS app through **Alma's relay service**, or a built-in terminal chat.” / “Added server management commands: `alma-server pair --token`, `unpair`, `status`, and `chat`.”
  - `v0.4.143`：“Live Mac browser on your phone now supports **WebRTC video (H.264, DataChannel input, and TURN)**.”
- **未找到**：公开的 relay 服务端仓库（`yetone` 名下无 relay 仓库；GitHub 全局搜索 `alma-relay` / `alma relay self-host` 无结果）；官方《远程访问》文档页；`relay.alma.now` 的 OpenAPI/协议规范；`alma.now/pricing`、`alma.now/team`（均 404）。（已验证·探测）
- **第三方逆向**（二手，供交叉验证）：`github.com/dongliang1993/eva`（`docs/architecture/20-alma-v2-subsystems.md` §11 等）对同一 bundle 的拆解与上述一致——它把 E2E 记为「可选」，与权威的「默认开」有出入；**以协调者的直接代码阅读为准**（默认 `true`）。

---

## 架构推断与证据强度

| 结论 | 强度 | 依据 |
|---|---|---|
| Alma 是 Electron 桌面 AI Agent，内嵌 `127.0.0.1:23001` 的 Express+WS | **已验证·代码** | 协调者解包 `app.asar` |
| `relay.alma.now` 是自运营中继（非 HTTP-over-tunnel），默认远程通道 | **已验证·代码/探测** | 常量 `fJ="https://relay.alma.now"`；探测 `/agent` `426`、`/turn` `401` |
| 中继协议 = WebSocket，接入点 `/agent`，`th` = routingToken 路由 | **已验证·代码/探测** | 探测 `400 Missing or invalid token hash (th)` + 代码 `th=routingToken` |
| 中继部署在 Cloudflare Workers | **已验证·探测** | `/healthz` `{edition:"cloudflare"}` + `Server-Timing: cfWorker` |
| 桌面**只出站**连中继，不开入站端口 | **已验证·代码** | 服务仅 `listen 127.0.0.1`；中继出站 WS |
| E2E = P-256 ECDH + SHA-256 + AES-GCM，info `alma-relay-e2e/v1` | **已验证·代码** | desktop 与 iOS 两 bundle 常量逐字一致 |
| **E2E 默认开启**；Team 中继强制关闭 | **已验证·代码** | 默认 `e2eEncryption: true`；Team 路径 `false` |
| E2E 开启时中继/边缘不可见明文、无法 MITM | **推断**（高置信） | 由「透明转发密文 + 配对码认证握手」推导，代码未含对中继的信任 |
| 明文（legacy）模式中继可见完整明文 | **已验证·代码** | `hreq` 代理 + `connectUrl=/c/<code>` web UI |
| 配对 = QR `pairingLink`（`alma://connect?...`）+ 账号 OAuth（registrationKey）+ 中继 token hash（th） | **已验证·代码** | 发布说明 + 代码 |
| 官方共享中继需 Alma 账号；应用本身不需账号 | **已验证·代码** | `registrationKey` 为账号 JWT（读 `email` claim）；应用本地优先 |
| 「自建 relay」支持存在，但服务端代码/文档未公开 | **推断** | 发布说明 “choose a self-hosted relay” + `edition` 字段；GitHub 无对应仓库 |
| 中继兼作 WebRTC TURN 凭据下发 | **已验证·代码/探测** | `POST /turn` `401 Relay token required`；返回 `{iceServers,ttl}` |

---

## 与本项目候选方案对比

本项目候选（见 `docs/adr/0004-read-only-remote-access-surface.md`、`docs/plans/2026-10-08-mobile-asset-viewer-design.md`）：桌面**只读** HTTP 服务绑 `127.0.0.1` → **Cloudflare 命名 Tunnel（cloudflared）** 暴露 → **TLS 终止在隧道边缘** → 设备级长期令牌放 **HttpOnly Cookie** → **二维码配对**。

| 维度 | Alma `relay.alma.now` | 本项目（cloudflared Tunnel） |
|---|---|---|
| 传输形态 | 自研 **WebSocket 反向代理**（帧协议转发 HTTP+WS） | 标准 **HTTP(S)**，cloudflared 反代本地服务 |
| 连接方向 | 桌面**出站**连中继（无入站端口） | cloudflared **出站**连 Cloudflare（无入站端口） |
| 基础设施运营方 | Alma 自运营（跑在 Cloudflare Workers） | 用 **Cloudflare 命名 Tunnel** 现成能力 |
| 边缘是否可见明文 | 开 E2E（默认）→ 不可见；关 E2E → 可见 | **可见**（TLS 在边缘终止，无应用层 E2E） |
| 端到端加密 | **有，且默认开启**（P-256 ECDH + AES-GCM，配对码作 PSK） | **无**（可自加应用层加密，当前方案无） |
| 鉴权/配对 | 账号 OAuth（registrationKey）+ 配对码（connectCode）+ 中继 token hash（th）三层 | 设备级长期令牌（HttpOnly Cookie）+ 二维码 |
| 账号依赖 | 官方共享中继**需** Alma 账号；自建中继推断可免 | 无需账号（仅需持有一个 Cloudflare 账号的 Tunnel） |
| 自建能力 | 设置项可填自建 relay `serverUrl`（**服务端需自实现，未公开**） | 命名 Tunnel 天生第一方，亦可自托管其他隧道 |
| 常驻进程 | 桌面出站 WS 常驻（ping 15s / 退避重连） | 仅 `cloudflared` 常驻 |
| 协议复杂度 | 高（WS 帧、256KB 分块、256MB 上限、背压、SSE 需分块） | 低（标准 HTTP，cloudflared 处理） |
| 客户端形态 | 独立原生 iOS App（Capacitor）+ 明文模式可选浏览器 web UI | 复用普通浏览器（网页/PWA） |

**要点**：
1. **两者骨架相同**：都靠常驻进程**出站**连到公网边缘、都不开入站端口、都用一个「配对凭据」准入。差别主要是「用现成隧道（cloudflared） vs 自运营中继」。
2. **TLS 终止位置是核心分野**：本项目 TLS 终止在 Cloudflare 边缘 → 边缘可见明文；Alma 在此之上叠加**应用层 E2E**，使中继看不到明文、且**中继即使被攻破也无法 MITM**。**若本项目只读数据敏感度较高，Alma 的 E2E 思路最值得借鉴**：在本机服务与浏览器之间再加一层应用层加密（配对码作 PSK），密钥经二维码交换。
3. **对「只读浏览」场景，Alma 的完整方案偏重**：Alma 中继是为「手机**完整控制**桌面 Agent（写操作、看屏走 WebRTC/TURN、终端）」而设计，故需自建中继 + 原生 App + 复杂帧协议。本项目只需「手机看只读资产、浏览器即客户端」，cloudflared 方案手脚更少。
4. **可借鉴点**：(a) **应用层 E2E** 补齐「边缘可见明文」短板（Alma 用 P-256 ECDH + AES-GCM + 配对码 PSK，可照此设计）；(b) **配对码作 PSK、只把其哈希发到中继**（配对码本身不外发）这一细节；(c) **两层职责分离**：「账号/令牌管能否接入，配对码管连到哪台设备」。**反之，Alma 的一处教训不要学**：其 loopback API **无鉴权**，中继一旦接通即拥有桌面全部能力（第三方逆向亦记为「坑」）——本项目「只读 + Cookie 令牌」已优于该设计。

---

## 补充：协调者对两条关键结论的复核（2026-10-08）

### A. 「E2E 下中继无法 MITM」——复核**成立**（已验证·代码）

报告 §架构推断 把这条标为「推断（高置信）」。复核结论：**可升为已验证·代码**。依据是 E2E 内层帧的派发路径无第二道认证：

```js
class E2EResponder {            // 反编译名 class Kg
  onInnerFrame(e){ switch(e.t){
    case "hreq":  this.proxyHttp(e);        break;   // 直接信任已解密帧
    case "wopen": this.proxyWsOpen(...);    break;
    ...
  }}
}
```

内层帧（`hreq/hcancel/wopen/wmsg/wclose`）**没有外层 envelope、没有来源签名**——只要握手通过，帧就被直接执行。所以「能否注入」等价于「能否完成握手」，而握手需要 `code`。中继手上只有 `routingToken = HKDF(code, "alma-relay-e2e/v1/routing")`（单向派生），**无法反推 `code`**，因此中继无法完成握手、无法注入、无法 MITM。**结论：中继即使完全被攻破，也只能做两件事——拒绝服务，或把连接路由到另一端。两者都不能读到或改写内容。**

（残留信任边界：同一个 `code` 的所有持有者互为可信。即「另一台已配对的手机」可以冒充桌面端——这是配对码即信任边界的必然结果，不是缺陷。）

### B. 报告 §对比「要点 3/4」需补一条硬约束：**E2E 与「浏览器直接打开」不可兼得**（已验证·代码）

报告把「应用层 E2E」列为最值得借鉴的点，方向正确；但对**本项目（客户端是浏览器）**而言，还存在一个报告未点破的约束——**自举鸡生蛋**：

- Alma 的 E2E 模式下，桌面端**根本不再转发 HTTP**，只讲 E2E 内层协议（`/__alma_e2e__` 路径下不再透明代理）。于是**没有 HTTP 可以承载那个页面**。
- 这正是 Alma 把 E2E 模式**限定为原生 App**的原因（`connectUrl = null`）：iOS App 的界面**打包在 App 内**（Capacitor），不需要从网络取页面；E2E 只用于数据面。
- 明文模式（`/c/<code>`）之所以能浏览器直开，恰恰**因为它不是 E2E**——页面是经明文中继取回的。

对本项目的直接影响（改变方案取舍）：

| 目标 | 是否可能 | 说明 |
|---|---|---|
| 浏览器加载移动页面 + 全程 E2E | **不可直接兼得** | 页面本身要经隧道取回，而隧道若全 E2E，浏览器拿不到页面 |
| 移动页面明文、**仅数据 API 走 E2E** | **可行** | 页面（HTML/CSS/JS）经隧道明文下发，页面加载后与 Rust 端做 ECDH+AES-GCM 握手，其后所有 `/api/*` 走密文。**代价：页面本体与端点形状对边缘可见，资产数据不可见** |
| 静态自举页放在隧道之外（如 Cloudflare Pages/relay 静态托管）+ 数据面 E2E | 可行但增件 | 即 Alma 原生 App 的等价物；多一个部署面 |

**结论**：本项目若要在 cloudflared 之上补 E2E，**必须接受「页面明文、数据密文」这个折中**，或把移动端做成原生 App（Alma 路线，成本高得多）。这一条应写进 ADR-0004 的备选评估，避免「直接照搬 Alma 的 E2E」时低估其自举成本。

（另注：本项目计划由**同一个 Rust 服务同源托管**移动页面——这与 E2E 的自举约束正面冲突，是评估时必须先解决的架构点，而非实现细节。）

---

## 未决问题

1. **自建 relay 的可用性边界**：官方只说「可在远程访问设置里选自建 relay」，但**服务端代码与部署文档均未公开**（已验证·探测：GitHub 无对应仓库，文档无相关页）。→ 若要认真评估，需**自行实现**中继（从客户端帧协议反推：`register` + `hreq/hres/hchunk/hend` + `wopen/wmsg/wclose` + `/turn`）。`edition:"cloudflare"` 字段暗示存在其它 edition（自建/自托管变体），但**无一手证据**证明官方提供。
2. **官方共享中继的账号与价格**：账号用于中继准入（`registrationKey` = 账号 JWT）已确证；但**中继是否收费、免费额度、Team 中继价格**均无一手来源（`alma.now/pricing` 404）。→ 建议查 App 内 Remote Access 设置页或 `community.alma.now` 登录后的页面。
3. **E2E 的强度边界**：IV 的**首 4 字节固定为 0**、无显式重放窗口（仅靠计数器单调），属已知但可接受的取舍；若本项目要自研 E2E，需评估是否需随机化 IV 前缀 / 加重放窗口。
4. **中国大陆可达性**：`relay.alma.now` 走 Cloudflare Anycast（本机 probe `cf-ray` 落 HKG/SIN），但**本机 IP 为 fake-IP、不可据以推断地理**；**未做大陆实网测试**。→ 推断：Cloudflare 边缘在大陆的连通性依运营商/时段波动；任何 Cloudflare 依赖（Alma 中继 **与本项目 cloudflared**）都需在目标用户网络实测。Alma 为中文市场产品（作者 yetone、全中文文档），推断其做过一定适配，但无一手证据。
5. **Team 中继语义**：`Team host` 绑 `0.0.0.0` 且强制 `e2eEncryption:false`——推断 Team 场景是「多人共享、无法共享单一配对码」，故牺牲 E2E 换可用性；其威胁模型详见上表「明文模式」。未在官方文档找到 Team 的公开说明。
6. **未获一手来源的项**：Alma 中继服务端源码、官方《远程访问》文档页、`relay.alma.now` 协议规范——**均未公开**。协议细节以**协调者的 `app.asar` 直接代码阅读（已验证·代码）** 为准，第三方逆向文（eva）仅作交叉验证且存在「E2E 是否默认」一处偏差。

---

## 参考来源

**一手 · 代码（协调者直接阅读 `Alma.app` v0.4.167 `app.asar` 反编译产物；本报告标为「已验证·代码」）**
- 常量：`fJ="https://relay.alma.now"`、`MobileRelay`(class `ty`)、`register`/`hreq` 等帧、E2E 常量 `CURVE="P-256"`/`HKDF_HASH="SHA-256"`/`AES="AES-GCM"`/`PROTOCOL="alma-relay-e2e/v1"`、默认 `e2eEncryption: true`。

**一手 · 本报告实时探测（标为「已验证·探测」）**
- `curl -I https://relay.alma.now`、`curl https://relay.alma.now/healthz`（`{"ok":true,"edition":"cloudflare"}`）
- 原始 WS 握手 `GET /agent`（`426` / `400 Missing or invalid token hash (th)`）
- `POST https://relay.alma.now/turn`（`401 {"error":"Relay token required"}`）
- `GET https://relay.alma.now/c/<connectCode>`（`502`）
- DoH：`curl -H 'accept: application/dns-json' 'https://cloudflare-dns.com/dns-query?name=relay.alma.now&type=A'`
- `openssl s_client -connect relay.alma.now:443`（证书 SAN）
- `gh api repos/yetone/alma` → `404`；`gh search repos "alma-relay"` → 无结果

**一手 · 官方文档 / 发布说明（标为「已验证·官方文档 / 发布说明」）**
- Alma 官网 — https://alma.now/
- 官方文档（中文）— https://alma.now/docs/zh/guide/ ；英文入口 https://alma.now/docs/guide/
- 官方文档 · Chrome 浏览器中继 — https://alma.now/docs/zh/features/chrome-relay
- 发布归档仓库 — https://github.com/yetone/alma-releases （v0.4.64/0.4.69/0.4.81/0.4.91/0.4.139/0.4.143/0.4.148/0.4.150 等条目）
- 社区站（OAuth 落地页）— https://community.alma.now

**二手 · 逆向/评测（交叉验证用，标注为二手）**
- `github.com/dongliang1993/eva`：`docs/architecture/20-alma-v2-subsystems.md` §11、`16/17/00` 篇（对同 bundle 的拆解；注意其「E2E 可选」的表述与权威的「默认开」有出入）
- 第三方评测（账号/价格为二手口径）— https://www.tomyf.com/Alma
