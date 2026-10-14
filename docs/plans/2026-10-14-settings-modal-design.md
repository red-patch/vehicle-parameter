# 设置（Preferences）— 设计方案

> 日期：2026-10-14 ｜ 状态：已实施
> 关联：`docs/adr/0004-read-only-remote-access-surface.md`（手机查看，本设计补其缺失的前端入口）、`docs/plans/2026-10-08-mobile-asset-viewer-design.md`（同）、`docs/plans/2026-10-12-rename-vehicle-product-workbench-design.md`（产品名落点）
> 领域术语见 `CONTEXT.md`。

## 1. 背景与问题

### 1.1 用户诉求

> 我想做一个设置，按 Command+逗号触发，同时加一个按钮，把一些常规的系统相关设置都集成到这里面来作为入口。

### 1.2 现状缺口（实测）

| 缺口 | 证据 |
|---|---|
| 文案承诺了一个不存在的「右上角设置按钮」 | `docs/User_Manual.md:138`「点击右上角设置按钮」；`SaveAssetModal.tsx:64`「请先在应用右上角"⚙️"设置」；`AssetListDrawer.tsx:219`「请先在应用右上角("设置")配置」——右上角只有暗色切换与「重置本地数据」两个裸图标 |
| 「跟随系统外观」有逻辑无 UI | `themeStore.ts` 有 `followSystem` 字段与 `prefers-color-scheme` 联动，但**无任何界面**；用户手动切过一次暗色后 `followSystem` 永久变 `false`，再也回不到跟随系统 |
| 「手机查看」有后端无入口 | `src-tauri/src/mobile.rs` 有 6 个命令（`start_mobile_server` / `set_mobile_server_enabled` / `mobile_server_status` / `create_mobile_pairing_code` / `set_mobile_public_url` / `revoke_all_mobile_devices`），前端 `src/` 对它们**零调用**——P1 已实施（见 mobile 设计文档 §13），但用户摸不到 |
| 设置项散落各业务页 | 资产库目录埋在「车型资产」页（`DataSourcePanel.tsx:246`）；法规库目录埋在「法规标准」页（`RegulationLibrary.tsx:81`） |
| 危险操作无标签、无分组 | `MainLayout.tsx` header 的「重置本地数据」是不可逆操作，却是一个无文字的裸图标，与暗色切换并排 |

### 1.3 目标

1. 提供一个统一的**系统级设置入口**：macOS 菜单栏「设置…（⌘,）」+ header 齿轮按钮 + 键盘快捷键（三通道）。
2. 把**系统/环境相关**的设置收敛到一处：外观、路径、手机查看、数据与危险操作。
3. 修复三处「去右上角设置」的空头文案——按钮真的存在了。

### 1.4 非目标

- **不搬「字段与词表」**：它已有顶级导航位（`MainLayout.tsx` items `dict`），且属业务域（受控属性 / 词表 / 别名词典）而非系统域。
- **不做「快捷键一览」入口**：`AssetHotkeyCheatsheet` 已由 ⌘/ 覆盖（`AssetHotkeyCheatsheet.tsx`）。
- **不删页内原有入口**：车型资产页 / 法规页各自的「选择目录」保留；设置面板是**汇总入口**，不是唯一入口。
- **不新增任何设置项的业务语义**（如新的策略开关）——本设计只做聚合与补齐缺失的 UI。
- **暗色快捷图标保留在 header**：主题切换是高频动作，值得一次点击。

## 2. 决策记录

| # | 问题 | 结论 | 理由 |
|---|---|---|---|
| Q1 | 收纳分类 | **外观 / 路径与位置 / 手机查看 / 数据与危险操作** 四类 | 用户四选全中；边界卡死在「系统/环境相关」防杂物抽屉 |
| Q2 | 界面形态 | **居中 Modal，左分类 + 右内容** | 最接近 macOS「偏好设置」心智；⌘, 落地自然；不打断当前工作页 |
| Q3 | 快捷键覆盖 | **macOS 原生菜单项（Rust）+ Windows JS 监听** | 符合 `AGENTS.md` L-1「同类改动一次覆盖所有平台，不留尾」。macOS 走 Rust 菜单 = 菜单栏可见 + webview 无焦点也生效；Windows 无菜单栏，JS 监听 Ctrl+, |
| Q4 | 是否新增顶级 tab | **否** | 设置是低频入口，不占顶级位 |

## 3. 架构

### 3.1 新增文件（全部独立，不往热点文件堆逻辑）

```
src/store/settingsStore.ts                        # isOpen / activeSection / fontSize
src/components/Settings/SettingsModal.tsx          # 居中 Modal 外壳 + 左分类导航
src/components/Settings/sections/AppearanceSection.tsx
src/components/Settings/sections/PathsSection.tsx
src/components/Settings/sections/MobileSection.tsx
src/components/Settings/sections/DataSection.tsx
src/components/Settings/useSettingsHotkey.ts       # Ctrl+, 监听 + Rust 事件桥
src/components/Settings/__tests__/SettingsModal.test.tsx
src/components/Settings/__tests__/sections.test.tsx
```

### 3.2 改动文件

| 文件 | 改动 |
|---|---|
| `src/components/Layout/MainLayout.tsx` | 加齿轮按钮；挂载 `<SettingsModal/>`；把「重置本地数据」按钮从 header 移入设置面板（`handleClearCache` 逻辑迁至 `DataSection`） |
| `src/theme/themeConfig.ts` | `getThemeConfig(isDark, fontSize?)` 增加第二个参数 |
| `src/App.tsx` | 从 `settingsStore` 读 `fontSize` 传给 `getThemeConfig`；同步 `data-font-scale` 到 DOM |
| `src/index.css` | 加 `[data-font-scale]` 覆盖 `--fs-*` 三档 |
| `src-tauri/src/lib.rs` | macOS App 菜单加「设置…」项（`CmdOrCtrl+,`）+ `on_menu_event` 发 `open-settings` 事件 |

### 3.3 数据流

```
⌘, ──┬─ macOS: Rust 菜单 Accelerator ─→ on_menu_event("settings") ─→ app.emit("open-settings")
     │                                                                        │
     └─ Windows: window keydown (ctrlKey && key === ',') ─────┐                │
                                                              ▼                ▼
header 齿轮按钮 ─────────────────────────────────────→ useSettingsHotkey / onClick
                                                              │
                                                              ▼
                                                    settingsStore.open()
                                                              │
                                                              ▼
                                                     <SettingsModal/> 渲染
```

- **单一开合源**：`settingsStore` 的 `isOpen`。三个入口（快捷键 / 菜单事件 / 按钮）都只调 `open()`。
- **主题仍归 `themeStore`**：`AppearanceSection` 直接读写 `themeStore`，不复制状态。
- **路径仍归各自 store**：`PathsSection` 读写 `vehicleStore.assetLibraryPath` 与 `regulationStore.rootPath`，不复制状态。

## 4. 各分类设计

### 4.1 外观

| 项 | 控件 | 读写 |
|---|---|---|
| 主题 | Radio：跟随系统 / 亮色 / 暗色 | `themeStore.followSystem` + `setFollowSystem` / `setDarkMode`。选「亮色/暗色」→ `setFollowSystem(false)` + `setDarkMode(...)`；选「跟随系统」→ `setFollowSystem(true)` 并立即按 `prefers-color-scheme` 校正 |
| 界面字号 | Segmented：小 / 中 / 大 | `settingsStore.fontSize`（持久化）→ `App.tsx` 作为 `getThemeConfig` 第二参 + `data-font-scale` 属性 |

**字号实现与其边界**：字号驱动两处——antd 的 `token.fontSize`（13 → 12/13/15），以及 `index.css` 的 `--fs-*` 变量（`[data-font-scale="small"|"large"]` 覆盖）。**明确不做**的：`src/` 中 104 处内联 `fontSize: N` 的 px 值不随字号缩放（它们不读 CSS 变量）。这是 v1 的已知边界，写在此处以免被当成 bug。

### 4.2 路径与位置

| 项 | 控件 | 数据 |
|---|---|---|
| 资产库目录 | 显示当前路径 + 更换 + 在访达中显示 | `vehicleStore.assetLibraryPath` / `setAssetLibraryPath`；`plugin-dialog` 选目录；`plugin-opener` 的 `revealItemInDir` |
| 法规标准库目录 | 同上 | `regulationStore.rootPath` / `setRootPath` + `load()` |

未设置时显示「未设置」+ 一句提示（「用于持久保存车型资产，导入前需先设置」）。切换资产库目录后沿用现有副作用（`MainLayout` 的 `assetLibraryPath` effect 会自动 reload 词表/枚举/标签组）。

### 4.3 手机查看

对应 `mobile.rs` 6 命令，界面为**状态卡 + 操作**：

| 界面元素 | 命令 |
|---|---|
| 服务状态（运行中/已停止 + 端口 + 已配对设备数 + 公网地址） | `mobile_server_status` |
| 开关「对手机开放」 | `set_mobile_server_enabled` |
| 「启动服务」（用当前资产库路径） | `start_mobile_server(library_path)` |
| 「生成配对码」→ 显示 8 位码 + 有效期 10 分钟 + 配对链接 | `create_mobile_pairing_code` |
| 「设置公网地址」（隧道地址，配对链接要用） | `set_mobile_public_url` |
| 「撤销全部设备」 | `revoke_all_mobile_devices`（二次确认） |

非 Tauri 环境（jsdom 测试 / 浏览器 dev）整段降级为一句「仅桌面端可用」。

**边界提醒**：`mobile.rs` 的三条不可动摇（只绑 `127.0.0.1` / 只读 / 每设备长期 token，ADR-0004）不在本设计改动范围，前端只是调用面。

### 4.4 数据与危险操作

| 项 | 行为 |
|---|---|
| 打开数据目录 | `appDataDir()` → `openPath`（沿用 `sessionPersistence.ts:66` 的取法） |
| 重置本地数据 | 由 `MainLayout.handleClearCache` 迁入，逻辑不变（确认弹窗 + `localStorage.clear()` + reload）；展示物理数据路径 |
| 缓存占用 | 显示 `localStorage` 序列化后字节数（`Blob`/字符数估算），供用户判断重置的必要性 |

## 5. 测试

- `SettingsModal.test.tsx`：分类切换渲染对应 section；⌘,/Ctrl+, keydown 调 `open()`；`open-settings` 事件调 `open()`。
- `sections.test.tsx`：各 section 在非 Tauri 环境不炸；主题切「跟随系统」调 `setFollowSystem(true)`；字号 Segmented 写 store。
- `MainLayout.navigation.test.tsx`：补一条「header 有齿轮按钮，点击后设置面板可见」。
- 遵循 `AGENTS.md`：「测试里的 mock 数组/对象不要在每次渲染时新建」。

## 6. 验证

改了逻辑 + Rust：`npm run lint && npm run typecheck && npm run test && npm run build` 四条全跑；Rust 侧 `cargo test`（`src-tauri`）。回退测试：新测试在旧代码（无 `SettingsModal`）下必须真挂。
