# 用 MyGo Native UI 改造本项目 — 可行性评估（结论：不采用）

> 日期：2026-10-12 ｜ 状态：**结论定稿；不采用（用户 2026-10-12 确认放弃）**
> 来源：2026-10-12 grilling 会话（Q1–Q18 五轮；用户逐项回答 Q1/Q6/Q7/Q8/Q9/Q10/Q12/Q13/Q14，其余由证据裁定）。
> 被测对象：<https://mygo.egoist.dev/docs/ui>（MyGo 的 Native UI 路径）。
> 关联：`docs/adr/0001`–`0004`、`docs/PRD.md`（技术栈 §3.1、导入格式 §1）、`AGENTS.md`（热点文件、验证命令）、`docs/重构方案A_性能优化与Rust下沉.md`（既有性能结论）。
>
> 本文件的全部数字均为**本次会话实测**（`dist/` 产物、源码统计、`pkg.go.dev`、GitHub API），不是估算；标注「未核实」的项已显式说明。

## 1. 背景与问题

用户提出：评估用 MyGo 的 Native UI 改造本项目的可行性。经 Q1 澄清，评估目标定为 **(a)+(d)**：「MyGo Native UI 能否取代 Tauri+React」的 go/no-go。

**被测对象是什么**（本次会话实测，非依据印象）：

- MyGo 是 **Go 语言的桌面框架**（`github.com/egoist/mygo`，MIT）。它有两种窗口：**Web 前端模式**（Go 后端 + Vite/TS 页面跑系统 webview，架构上等同 Tauri/Electron，不构成新品类）与 **Native UI**（`/docs/ui`：UI 由框架在 GPU 上自绘，Metal/D3D11/OpenGL；用 Go 写；无 HTML/JS/CSS/webview/前端构建；同一套 UI 可编到 WASM + WebGL 2 在浏览器运行）。
- 成熟度（GitHub API 实测）：**创建于 2026-09-26**（评估时 16 天），最新 **v0.4.5 发布于 2026-10-11**（评估当日），1,566 star，**47 个 open issue**，MIT，无 1.0。三周内从 0.1.0 走到 0.4.5，隐含破坏性变更的高频节奏。

## 2. 结论

**不采用。** 主应用（Tauri + React + Ant Design 那 3.5 万行）保持现状；MyGo Native UI 不作为迁移目标，也不作为下一代技术栈方向。

理由**不依赖任何单一未验证的未知**，而是四条叠加的结构性成本：

1. **收益量级不足。** 想解决的问题（启动/内存/包体积）实测收益是**约 2 倍量级，不是数量级**——Tauri 已经不打包浏览器引擎（用系统 WebKit/WebView2），相对 Electron 省掉的那 100MB+ 本项目**早就省掉了**。MyGo native UI 官方自述 hello-world 约 **7MB 二进制**，本项目 `.app` 现存的是 Rust 二进制 + 2.6MB 前端，落点大致 10–15MB → 7MB。
2. **换的是「债的形式」，不是债的量。** 本项目 `src/` 只有 30,379 行非测试 TS，**是因为 Ant Design 把虚拟滚动、树形数据、多选、展开行、列过滤、分页、粘性表头、弹出层定位、焦点陷阱、无障碍全部实现了**。换到 MyGo，这些从「调用库」变成「自己拥有的代码」——**代码总量会显著上升，不是下降**。60 个组件手搓一遍，用 Go 熟练也不会快。
3. **丢掉已投入且已验证的资产**（实测）：**5,530 行前端测试 / 51 个文件**（其中 `src/utils/` 34 文件 4,271 行）**全部不携带**；`src-tauri/` **4,233 行 Rust 与 69 个 `#[test]`** 因 MyGo 保证 `CGO_ENABLED=0`（不能 cgo 调 Rust）而**只能重写或丢弃**。
4. **时点最差。** 要冻结重写的，恰好是刚设计完、测试最厚、领域理解最深的部分：`41cb6ed feat(compare): 对比视图「按字段名合并」` 落地于 **2026-10-09（评估前 5 天）**；`regulations.rs` 1,477 行含 **46 个 Rust 测试**；`mobile.rs` 928 行含 10 个测试。

**这个结论不是「技术上做不到」**（展开行可在 `cell(row,col)` 内自实现，Bitap 可逐行搬），而是**没有任何一条驱动项配得上成本**。用户问「平替不行就调整业务逻辑变相实现」——这需要按业务域**手搓 4-6 个组件**，是那个方向里**最难**的一支，与「用 Go 熟所以快」直接矛盾：用 Go 熟**恰恰不改变这部分**（用的是 MyGo 从未设计过的更高层抽象）。

## 3. 决定性的实测事实

### 3.1 前端与设计体系

| 项 | 实测值 |
|---|---|
| `src/` 总量 | 176 文件 / **35,378 行** TS/TSX（非测试 **30,379**）；TSX 20,041 行 |
| 组件 | `src/components/` **61 个非测试 React 组件** / 19,936 行 |
| **组件库** | **Ant Design v6**（`antd ^6.1.3`）——**61 文件 import antd，45 文件 import `@ant-design/icons`**。无任何其他 UI 库 |
| `className=` 出现 | **979 处**（Tailwind v3.4.17；`darkMode` **未设**，实际靠 CSS 变量 + antd 双算法） |
| 设计令牌 | `themeConfig.ts` 140 行（**5 个 per-component token 组 + ~25 全局 token + 明暗算法 + `cssVar:{}`**） |
| CSS 耦合 | `index.css` 伸手进 **24 个 `.ant-*` 选择器**，含行状态（`.required-empty`/`.diff-row`/`.group-row`）与 `.ant-modal.ant-zoom-enter` 动画名覆盖 |
| 业务逻辑 | `src/utils/` **13,050 行**（非测试 **8,779**）；`xlsx` 13 文件（8 非测试）；`fuse.js` 3 文件 |

AGENTS.md 第 8 行标称技术栈为「Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind 3」，**漏了 antd / zustand / xlsx**；`docs/PRD.md` §3.1 是写全的（「UI 组件库：Ant Design v6」）。**AGENTS.md 的技术栈行应补全**（见 §7）。

### 3.2 Ant Design 的真实承重面（不是「用了 Table 和几个按钮」）

| 用法 | 规模 | 证据 |
|---|---|---|
| `message.*` **命令式** | **228 处 / 29 文件** | 零 `useMessage`、零 `App.useApp`（无 context holder）；含 3 处 `message.loading(msg, 0)` 需返回可关闭句柄 |
| `Modal.confirm` **命令式** | **13 处 / 9 文件** | 含 async `onOk`、JSX content、danger 按钮 |
| `<Table>` | **23 处 / 18 文件** | 承重特性**同时叠加**：受控 `rowSelection`(7 文件)、受控 `expandable`(5 文件)、固定列(7)、排序、每列 filter 下拉、`scroll{x,y}`、`virtual`(1)、`rowClassName` 行状态、分页+size changer |
| `notification` | 1 处，但重型 | `AnnouncementQuery.tsx:150`：key + JSX body + JSX 按钮行 + `duration:0` + `destroy(key)` |
| 拖拽 / 虚拟滚动 | **0 / 1** | 无任何 dnd 库；虚拟滚动仅 `MatchResultTable.tsx:560` |

### 3.3 Rust 后端（被低估的部分）

`src-tauri/src/` **4,233 行**，**20 个 `#[tauri::command]`**；前端 `invoke()` 仅 **12 处**（11 生产代码），实际触及 **11 个命令**。

**Rust 已经实现了本项目的多数「重」逻辑**：`assets.rs`(352) / `announcements.rs`(225) / `regulations.rs`(1,477，法规文件名解析全在此) / `pdf_sniff.rs`(937) / `excel.rs`(208，calamine 读 + rust_xlsxwriter 写) / `mobile.rs`(928)。`regulationIO.ts` 的注释即设计声明：**JS 侧故意不写第二实现，因为会造成漂移**。

因此「改造成 MyGo」的真实形状是：**用 3.5 万行新 Go 代码，替换一份已跑通、且已编译成 Rust 的后端**——而非「把 JS 换成 Go 会更快」。

### 3.4 最复杂业务部分的移植难度（Q3 的直接答案）

| 业务块 | 规模 | 移植 Go | 真正的风险 |
|---|---|---|---|
| **模糊匹配**（`fuse.js`） | `matchingEngine.ts` 210 行 | **高** | **唯一真硬处**，见下 |
| Excel 读写（SheetJS） | parser 792 + 219 行 | 中 | 读取侧换库可行；写出侧是外部契约 |
| 对比/diff 引擎 | `comparator.ts` 145 + `compareMatrix.ts` 152 | **低** | 纯 map join，只耦合模糊匹配 |
| 报告导出 | `reportExport.ts` 273 + 2 兄弟 | **低** | 全字符串拼装；仅 1 个函数碰 DOM |
| 领域 IO | Rust 已实现 | 中低 | 已有**两份**同规则实现（`assets.rs::scan_one` ↔ `assetManager.ts::scanAssetFiles`），再搬会变**第三份** |
| Store 逻辑 | 1,035 行 | 低—中 | 一个 `localeCompare('zh-Hans-CN')` 中文排序边界 |

**模糊匹配是唯一「真硬」且不可替代的**：

- `matchingEngine.ts:113-126` 用 `useExtendedSearch:true` + `ignoreLocation:true`，走 **Bitap**（`MAX_BITS=32`，超长分块）；打分 = 误差/长度 + 位置邻近项 + 3 位小数字段长度归一 + `Math.pow` 组合。**该分数不是内部细节**：`matcher.ts:4` 把它转成 `max(0,1-score).toFixed(2)`，**变成用户可见的「置信度」数字**，同时是 `bidFieldMapping.ts` 「自动采纳 vs 待人工确认」的闸门。差几个百分点，行就在「自动匹配/备选/未匹配」三态间跳。
- **三处调用点配置还不同**：`matchingEngine` 0.3+扩展+忽略位置；`MatchResultTable.tsx:73` 0.6；`DataPurifyView.tsx:63` 0.6 且**未开 `ignoreLocation`**（位置敏感）。Go 侧要复现**两套打分模式**。
- **Go 生态无等价物**（`pkg.go.dev` 实测核实）：搜到的 `fuse` 均为 FUSE 文件系统库；主流 Go 模糊检索（`lithammer/fuzzysearch`、`sahilm/fuzzy`、`suggest-go/suggest` 等）全是 **Levenshtein/子序列**，**打分尺度与 fuse.js 完全不同**。唯一忠实路径 = 逐行搬 fuse.js 的 `BitapSearch`/`computeScore`/`parseQuery`（约 300–400 行）并以 golden test 钉住。

### 3.5 能力与契约（Q18）

- **`.xls` 读取**：`excelize` **不支持** `.xls`（`pkg.go.dev` 核实：仅 xlsx/xlsm/xltx/xltm）；Go 侧须换 `extrame/xls` / `shakinm/xlsReader` / `pbnjay/grate` 一类**维护度更低**的库。**且 `docs/PRD.md` §1 明文要求支持 `.xlsx/.xls`**，UI 上传口亦收 `.xls`（`ExcelUploader.tsx:116` `accept=".xlsx,.xls,.csv"`）。→ 不是「做不到」，是「换低维护度库」或「正式撤回 PRD 承诺」二选一。
- **写出侧不可动**（外部系统契约，非本项目可改）：`车上云系统导入_{车型名}_{YYYYMMDD}_.xlsx`（`MatchResultTable.tsx:468`）、`投标取数_<方案名>_<日期>.xlsx` / `.csv`（`BidPullView.tsx:237,248`）。
- **`excelParser.ts:665-673` 的注释写着「勿手写复刻」**（`sheet_to_json` 默认对象模式的 `""`→`__EMPTY`→`__EMPTY_1` quirk），而 Go 侧没有该函数、**只能手写**。→ 「Excel 严格保真」（Q9 用户同意）与「搬到 Go」在**这一处互斥**。

### 3.6 MyGo 的强项恰好是本项目的空地

| MyGo 强项 | 本项目使用量 |
|---|---|
| 一等公民拖拽 `Drag`/`Drop[T]`/`transfer` | **0** |
| 虚拟滚动（经 List） | **1** |
| 无障碍原语 | 未使用（依赖 antd） |
| 原生窗口管理 / inspector | 未使用 |
| WASM + WebGL2 浏览器目标 | 未使用 |

**MyGo 强的面正好是本项目的空地；MyGo 空缺的面（Table 展开行、行状态钩子、命令式 confirm、per-component 设计令牌、Form 校验引擎）正好是本项目的密集区。** 这个错位是本次评估最关键的发现。

### 3.7 现有包体积构成（实测，`dist/` 构建于 2026-10-09 18:27，与 `src/` 同步）

`dist/` 合计 2.6MB（未压缩），gzip 后约 836KB：

| 产物 | gzip | 内容 |
|---|---|---|
| `vendor-antd-*.js` | **376.4K** | antd + `@ant-design/icons` |
| `vendor-xlsx-*.js` | **137.1K** | SheetJS（主线程一份） |
| `excelParser.worker-*.js` | **115.2K** | **SheetJS 又被打进 worker 一份** |
| `index-*.js` | 66.4K | React + 应用壳 |
| `ParameterWorkbench-*.js` | 51.3K | 最大页面 chunk |

**antd + SheetJS 合计 628K gz = 前端 75%；自研业务代码 gzip 后 < 90KB。**（另见 §7：SheetJS 被 build 两次。）

## 4. 触发/未触发的止损项

会话中先设止损清单（Q10），后逐项裁定：

| 项 | 状态 | 裁定依据 |
|---|---|---|
| (a) 移植一个中等组件超 N 小时 | 未执行 | 未做 spike |
| (b) `ui.Table` 做不出某个承重特性 | **未知（非「已触发」）** | MyGo **无内置**展开行/行状态钩子/命令式 confirm/主题令牌，但 `ui.Element` builder 链**可扩展**，**大概率能自造**。会话中一度误报为「已触发」，已收回 |
| (c) 模糊匹配无 Go 替代 | **触发** | §3.5：`pkg.go.dev` 核实无等价库，须逐行搬 Bitap |
| (d) 失去 HMR 不可接受 | **未触发** | 用户答「可以接受」（Q6）。但代价真实：`mygo dev` 为「编辑 → 重建 → 重启」，**每次重启丢界面状态**，无组件级热替换 |
| (e) 收益低于 2 倍 | **未实测** | 未跑 `tauri build` 量真实 `.app`，未跑 MyGo 对照。结论 §2.1 按「约 2 倍」量级判断 |

**关键：主结论 no 不依赖 (b)——(b) 是 spike 可定的未知，而 §2 的四条结构性成本与 Go 熟练度无关。** 用户答 Q8「非常熟悉 Go + 希望尽快完成」后，成本模型仅消除了「学语言」与「精力分散」两项，未能消除 §2 的任一条。

## 5. 如果将来要用 MyGo，需要先满足的条件

若未来重启此评估，下列条件构成进入前提（非建议清单，是 gate）：

1. 明确一条**不在成本账里**的战略理由（学习目的 / 受够 antd 抽象层 / 长期完全拥有技术栈），且承认这是**技术选型决策而非 ROI 决策**。
2. 给出**预算上限数字**。会话中估主应用重写 = **2–4 个月全职**（依据：3 万行逻辑 + 5 个须重建子系统 + 语料验证 + 65+ 测试须重新长出）。「尽快」与此矛盾，须取其一。
3. 先做**限时 spike**，并**先测收益**（§4 的 (e)）——若收益不足 2 倍，后续成本不必再算。
4. 定**「可接受降级清单」**与**验收基准**：建议用 `docs/test_data/` 的 **26 个真实 xlsx 语料** + 现有 **5,530 行测试的断言集**做回归基准。缺此则无法证明「重构没走偏」。
5. 处置 `.xls` 与 PRD §1 的冲突（保留换低维护度库 / 改 PRD 正式撤回）。
6. 决定旧应用删不删、何时删。

## 6. 本会话未决与未核实

- **未核实（曾因 WebSearch 后端故障无法联网验证）**：Go 模糊检索库布局、`excelize` 的 `.xls` 支持——**后两项已由本会话直接抓 `pkg.go.dev` 复核**；模糊检索「无等价物」结论亦经 `pkg.go.dev` 搜索复核。**仍未实测**：MyGo `List`/`Table` 状态能否在一个视图里驱动两个独立选择的表格（本项目有嵌套表格：`ConfigManagerView.tsx:487`+`:599`、`BidPullView.tsx:418`+`:492`）。
- **未实测**：真实 `.app` 体积与冷启动耗时（需 `tauri build` + 对照构建）。
- **未评**（用户 Q14 明确排除）：手机只读面（ADR-0004）用 MyGo native UI 的可行性。该子命题**独立于主结论**：绿地（`mobile.rs` 的 `/` 现为 P1 占位，`src/mobile/` 不存在）、ADR-0004 明文要求移动端「不背 antd/xlsx 依赖树」而 MyGo 零前端构建命中、且不碰 §3.4 任何风险。**留待手机面（P3）有排期时单独评估。**

## 7. 附带发现与处置（与本次评估无关，但已验证的真实缺陷）

以下均为**本次会话实测**。用户 2026-10-12 批准清理前三条；实际只做了 1、2，3 判定为重构而非清理，4–6 未动。

| # | 发现 | 处置 |
|---|---|---|
| 1 | **`@ant-design/icons` 是未声明的直接依赖**：45 个文件直接 import，但**不在 `package.json`**，仅靠 antd 的传递依赖解析；`vite.config.ts` 的 `manualChunks` 还显式引用了它 | **已修**：`package.json` 补 `"@ant-design/icons": "^6.1.0"`（与 antd 内部锁定同版本），运行时不打包则不增体积 |
| 2 | **四个声明了却零 import 的依赖**：`clsx`、`tailwind-merge`、`file-saver`、`lodash`（另 `@types/file-saver` 被错放为运行时依赖、`@types/lodash` 为 devDependency）。项目无 `cn()`/`classNames()` 工具，条件类名靠模板字符串手写 | **已修**：6 项全部移除，`npm install` 移除 5 个包 |
| 3 | **SheetJS 被 build 两次**：`vendor-xlsx`(140.4K gz) 与 `excelParser.worker`(115.2K gz) 各一份 | **未修——判定为重构，非清理**。worker 需要 xlsx 做**解析**（这是它存在的理由，文档记 32.2MB/次收益），主线程需要它做**导出**（`aoa_to_sheet`/`sheet_to_csv`/`writeFile`，散在 `MatchResultTable.tsx`/`ParametersTable.tsx`/`MultiVehicleView.tsx`/`BidPullView.tsx`）。去掉一份须把导出搬进 worker（但 `writeFile` 触发浏览器下载、需要 DOM）或删掉主线程同步 fallback——**属行为变更**，须单独立项评估 |
| 4 | **`matchingEngine.ts` 的阈值缓存缺陷**：`Fuse` 实例按 `candidates` 数组身份缓存在 `WeakMap`，**但构造时的 `threshold` 一并被缓存**；对比流传 0.4、填报流用默认 0.3，同一数组被两流共用时结果随调用顺序漂移 | **已修（确定性部分）**：缓存改为 `WeakMap<数组, Map<阈值, Fuse>>`，两流各自建索引、互不污染；新增 `src/utils/__tests__/matchingEngine.test.ts`（3 测试）钉住，已验证**旧代码 2 条失败、修复后全过**。**精确机制**：`threshold` 参与 Bitap 早期剪枝（`fuse.js` 以 `min(精确匹配得分, threshold)` 为放弃上界），而 `findBestMatch` 事后另有按调用方阈值的复检——故缺陷**只在「先窄后宽」时显形**（数组被 0.3 先建索引后，0.4 调用时候选已被剪掉，复检无从施展）；反向被复检兜住，这正是它长期未被察觉的原因。**仍未决（保留）**：对比流 0.4 与填报流 0.3 是否该统一——那是产品决定，会改变用户可见结果 |
| 5 | **`AGENTS.md` 与实现不符**：第 8 行技术栈漏 antd/zustand/xlsx；热点文件表行数 `DataSourcePanel.tsx ~1680`（实际 1,282）、`DiffResultView.tsx ~730`（实际 517） | **已修**：技术栈行补 `+ Ant Design v6`、状态用 Zustand；热点表行数改为 `~1270 / ~1280 / ~520`；「已知坑」中「有 3 个 TODO」的陈旧说法改写为「部分内容已陈旧」并附实测差异 |
| 6 | **`docs/交互优化设计方案.md` 已部分陈旧**：AGENTS.md 称其含 3 个 TODO，实测 `TODO|待定|TBD` **0 命中**；该文档称「`App.tsx` 从 243 行降到 ~120 行」而实际 134 行且 `LegacyDiffPanel` 仍挂载 | **已修（仅改 AGENTS.md 的引用说明，未动该设计文档本身）** |

**全部改动后的验证**（2026-10-12）：`npm run lint` exit 0（72 warning / 0 error，均为既存 `react-hooks/exhaustive-deps`）；`npm run typecheck` 通过；`npm test` **448 测试 / 52 文件全过**；`npm run build` exit 0。

## 8. 一句话收束

**这个项目的瓶颈不是 Tauri、不是 React、不是 Tailwind，而是「UI 组件层」和「已编译后端」已经沉淀得比想象中厚**（antd 60+ 组件、5,530 行测试、4,233 行 Rust、69 个 Rust 测试）。换掉外壳能拿到的只是约 2 倍量级的启动/内存收益；要付的却是把这些沉淀全部重做一遍。**评估到此为止，结论：不采用。**
