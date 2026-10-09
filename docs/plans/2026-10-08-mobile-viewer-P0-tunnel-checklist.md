# 手机查看 · P0 隧道接入清单（人工执行）

> 日期：2026-10-08 ｜ 状态：**待执行（人工，须账号与设备）**
> 前置：`docs/plans/2026-10-08-mobile-asset-viewer-design.md` §3.4、§10 ｜ `docs/adr/0004`
> 目的：**只验证「手机能打开」这一件事**，不做任何本项目建设。P0 通过后再进 P1。

## 为什么 P0 必须人工

需要你的账号与被控设备：注册域名、Cloudflare 登录、手机扫码。这些 agent 一件都代不了。

## 步骤

### 1. 取一个免费域名（DigitalPlat FreeDomain）

1. 用 **GitHub 账号**登录 https://dash.domain.digitalplat.org/ （**GitHub OAuth 是唯一的 KYC 手段**）
2. 注册一个 `.dpdns.org` 子域，例如 `vp-relay.dpdns.org`
3. 另需填写：法定全名、邮箱、手机号（含国码）、地址（**地址须含两个英文逗号**）
4. 邮箱激活；通常 10–20 分钟生效（无官方时限，最长见过 ~24h）

> **这不是政府实名认证**，但也不是零填写。若你无法接受这些字段，此路不通 → 见文末退路。

### 2. 加进 Cloudflare

1. Cloudflare 控制台 → Add a site → 填 `vp-relay.dpdns.org`
2. 选 **Free** 套餐
3. Cloudflare 给出两个 NS 名称服务器 → 填回 DigitalPlat 面板
4. 等 Cloudflare 显示 **Active**（通常几分钟）

### 3. 装 cloudflared 并建具名隧道

```bash
brew install cloudflared
cloudflared tunnel login          # 浏览器登录并授权上面那个 zone
cloudflared tunnel create vp-mobile
cloudflared tunnel route dns vp-mobile vp-mobile.vp-relay.dpdns.org
```

> ⚠️ **关键观察点**：`tunnel login` 或 Dashboard 流程中**是否要求你填写支付信息**。
> - Cloudflare 官方文档自相矛盾：Zero Trust 开通页写「免费档也要填，但不扣费」，而**具名隧道的 CLI 流程页通篇未提**。二者很可能是不同入口。
> - **这一步的结果决定整条栈**：要卡号 → 换 zrok（免卡，保留名 `*.share.zrok.io`）；不要 → 继续 Cloudflare。

### 4. 起一个临时服务（不用写 Rust）

P0 只验隧道，**任何静态服务都够**：

```bash
mkdir -p /tmp/p0probe && echo '<h1>tunnel ok</h1>' > /tmp/p0probe/index.html
cd /tmp/p0probe && python3 -m http.server 8080
```

另开一个终端跑隧道（**必须带 `--protocol http2`**：默认 QUIC/UDP 在大陆常被限速或丢包）：

```bash
cloudflared tunnel run --protocol http2 --url http://127.0.0.1:8080 vp-mobile
```

### 5. 手机测试（**两种网络分别测**）

| 测试 | 期望 | 记录 |
|---|---|---|
| 4G/5G 打开 `https://vp-mobile.vp-relay.dpdns.org` | 看到 `tunnel ok` | 能否打开 / 秒数 |
| 酒店或公司 WiFi 打开同一地址 | 同上 | 能否打开 / 秒数 |
| 地址栏锁标 | **浏览器信任的证书，无需装任何东西** | 是否有证书警告 |
| 加到主屏后打开 | 独立窗口、不像普通标签页 | 是否成功 |

## P0 判定

- **通过**：手机在两种网络下都能打开，且证书无警告 → 进 P1。
- **卡在步骤 1**（不愿填那些字段）→ 退路 A。
- **卡在步骤 3**（要支付信息）→ 退路 B。
- **能连但极慢/常断** → 先记录数据，再决定是否值得继续（移动端体积已按此约束设计）。

## 退路

| 退路 | 做法 | 代价 |
|---|---|---|
| **A** | 换 `eu.org` 域名 | ⚠️ **不推荐**：申请队列失控（二级域名从两天到三年，有 2023 申请 2026 才批） |
| **B** | 换 **zrok**（免卡） | 保留名 `myapp.share.zrok.io`；无卡账号会给访客弹一次反钓鱼提示页；**大陆可达性与证书信任链未证实**，需重做本清单的步骤 4–5 |
| **C** | 承认此路不通，退回「导出静态报告转发」 | 功能降级，但零基建（`reportExport.ts` 已具备窄屏适配） |

## 记录

执行后把结果写回本文件（或另起一行状态），供 P1 起跑时参照：

```
执行日期：2026-10-08/09（第 0 阶段：临时隧道，零账号）
步骤 1 结果：未执行（需人工：GitHub OAuth + 姓名/邮箱/手机/地址）
步骤 3 是否要求支付信息：未决——临时隧道不触及该路径
4G 测试：✅ 可打开
WiFi 测试：未测（酒店/公司 WiFi 仍待验证）
证书警告：无（issuer = Google Trust Services WE1，公共 CA，手机零安装）
结论：技术可行性 **通过**
```

### 第 0 阶段实际执行记录（agent 代跑，无需账号）

`cloudflared 2026.10.0` + 临时隧道（`trycloudflare.com`，**零账号零域名零卡**）+ `python3 -m http.server`，用随机不可压缩负载实测（方法与完整数据见设计文档 §14）：

| 负载 | 手机 4G 耗时 |
|---|---|
| 200 KB | **400 ms** |
| 1 MB | **921 ms** |

**已由此结掉的悬案**：证书不再需要任何自签/mkcert 方案（公共 CA 直接可信）；`--protocol http2` 够用，无需额外绕行；大陆 4G 可连 Cloudflare 边缘。
**核心结论**：瓶颈是**往返延迟（约 300–400 ms/次）而非带宽（约 9–13 Mbps）**——见设计文档 §14.3 对 P3/P4 的四条约束。

**仍待人工**：步骤 1（域名注册）、步骤 3（具名隧道的支付信息悬案）、酒店/公司 WiFi 实测。
