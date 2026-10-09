# 运行内存占用治理（稳态 + 导入峰值）— 设计方案

> 日期：2026-10-08 ｜ 状态：**P0–P1 已实施**（分支 `perf/runtime-memory`；实施备注见 §8）
> 来源：2026-10-08 内存实测会话（真实运行时采样 + Node 复现口径，见 §2）。
> 关联：`docs/adr/0003`（每车最新版 / 主文件退役）、`docs/plans/2026-10-01-asset-panel-layout-redesign.md`（资产管理两栏，性能注记来源）、`docs/plans/2026-09-30-asset-facets-lifecycle-design.md`（分组/分节视图）。
> 术语：`CONTEXT.md`（资产 / 资产库 / 车型组 / 每车最新版）。

## 1. 背景与问题

用户报告应用运行时占用约 **4 GB**。

直觉上的可疑对象实测后**全部排除**（见 §2）：空应用基线只有 ~364 MB；整个 519 个资产库全载入也只有 121 MB；40 MB 的 xlsx 因图片多、单元格少，解析后仅 18 MB。

真正的问题拆成**两条正交的内存轴**，此前没有分开度量过：

| 轴 | 现象 | 根因类型 |
|---|---|---|
| **稳态占用** | 用一段时间后内存不回落到基线 | 状态泄漏（只增不减）+ 未虚拟化的长列表 DOM 常驻 |
| **导入峰值** | 单次导入大表瞬间飙高数十 MB，去重率低 | 解析管线对「单元格数」的放大，且跨 worker/主线程复制多份 |

两者叠加：峰值抬高上限、泄漏让上限不回落，最终稳定在 GB 级。

### 1.1 关键认知（实测得出，反直觉）

**决定内存的是「单元格数」，不是文件大小。**

- `产品准入导出20261001192732.xlsx`：磁盘仅 **1.0 MB**，却含 **240,912 个单元格**（478 行 × 504 列）→ 打开一次预览峰值 **72 MB**（放大 **70×**）。
- `无人车规格汇总（内部使用）.xlsx`：磁盘 10.8 MB，仅 647 单元格 → 0.8 MB。
- `行业客户无人车调研汇总.xlsx`：磁盘 40.2 MB，3,716 单元格 → 18 MB。

结论：按文件大小判断风险会**完全判错方向**；应监控列跨度异常（504 列）的宽表。

## 2. 实测事实（设计依据）

环境：macOS 27.2 / 24 GB RAM，生产构建（`npm run build` + `vite preview`），真实资产库 `~/车型数据库`（519 个资产 JSON，107 MB / 244,322 个参数）。

### 2.1 运行时基线

| 测量对象 | 结果 | 判断 |
|---|---|---|
| 空应用（WebView 空工作区） | Rust 84 MB + WebContent 240 MB + GPU ≈ **364 MB**，30 秒采样稳定在 415 MB | 壳子正常，**空转不泄漏** |
| JS 堆（浏览器空载） | **24.6 MB** / 1,116 DOM 节点 | 与 Electron 类应用相当 |

### 2.2 资产库不是元凶

模拟 `loadAssetFile`（`JSON.parse` + `.map(p => ({...p, productName}))`）载入**全部 519 个**资产：

```
519 文件 / 244,322 参数 / 磁盘 101.6 MB  →  JS 堆 120.8 MB
放大倍数 1.2× （JS 堆 / JSON 字节）
每资产均值 0.23 MB
```

**整个资产库全载入也只要 121 MB** —— 资产库数据本身不是 4 GB 的来源。（这里的复制是安全的：拷贝随函数边界终结、两份各自被 GC。注意与 §2.3 的 worker IPC 复制不同——那里拷贝的是**单个巨大 `WorkBook`**，且要跨线程存活到主线程用完，才是问题。）

### 2.3 解析管线是峰值来源

`产品准入导出*.xlsx`（1.0 MB / 240,912 单元格）完整导入链路：

```
buffer              0 MB
+ workbook         37 MB      ← 全量单元格对象
+ structuredClone  69 MB      ← worker → 主线程 IPC 又复制一份
+ 预览(前 100 行)  72 MB      ← previewWorkbook 全量物化后的峰值
─────────────────────────────
峰值 ≈ 72 MB = 磁盘的 70×
```

拆分这 72 MB 的**各分量**（Node 分步测量）：

| 分量 | 内存 | 归属 |
|---|---|---|
| `WorkBook` 单元格对象 | **37 MB** | 不可避免（解析本就需要） |
| worker → 主线程 `structuredClone` | **+32 MB** | **P2**（worker IPC 契约） |
| 整表 `sheet_to_json` 物化 | ~2 MB | P1-1 |
| 预览补空到 504 列 | ~1 MB | P1-1 |

**结论（重要，避免高估 P1 收益）**：峰值的大头是 `WorkBook` 本身及其 IPC 复制（69 MB），**P1-1 直接省下的只有约 3 MB**。P1-1 的价值在于**去掉 O(全表) 的中间分配**（对超宽/超高表更明显）且改动廉价低风险；真正的大头在 P2。P1 里数值收益最高的是 **P1-2（免二次解析）**——现状是确认时再解析一遍，等于**再付一次 ~37 MB + 全量转换**。

另需指出：`getEffectiveSheetRange`（`excelParser.ts:284`）已处理「`!ref` 膨胀到 XFD」的收敛，P1-1 应复用其边界思路而非另起一套。

### 2.4 稳态占用来源

| 证据 | 位置 | 说明 |
|---|---|---|
| 默认视图是 `grouped` | `DataSourcePanel.tsx:100` | `viewMode` 初始 `'grouped'`（localStorage 记忆），非平铺 |
| **收起组仍全量挂载行** | `AssetGroupedView.tsx:308-312`（`grid-rows-[0fr] invisible` 揭示）、`:315`（`group.files.map`） | 收起只是 CSS 折叠，行照常挂载；实测 519 资产 / 158 组 / 均 3.3 行 = **677 行常驻**（全部收起时亦然） |
| 平铺视图无虚拟化 | `DataSourcePanel.tsx:1026`（`filteredAssets.map`） | 非默认视图，降为 P2 |
| 扫描调用分散 | `getAssetFilesWithInfo` **6 处独立调用**（`DataSourcePanel.tsx:163`、`useAssetLibrarySnapshot.ts:46`、`FileManager.tsx:103`、`AnnouncementArchiveList.tsx:104,148`、`AnnouncementBatchImportModal.tsx:167`、`DataPreview.tsx:46`） | 每处各自全量扫 519 个 JSON，同一份数据多份副本 |
| 状态只增不减 | `FileManager.tsx:48`（`fileCache`）、`:69`（`previewData`）、`:258`（`diffState.base/target`） | `fileCache` **从不清理**，原始 `File` 永久驻留；预览/比对数据设置后不释放 |

`fileCache` 是 `useState<Map<string, File>>`，只有 `set`（`:48`）没有删；`previewData` 只有 `set`（`:69`）。`diffState` 关闭时仅置 `open:false`，`base/target`（整表 `SheetData`）仍被引用。

### 2.5 隐含的重复工作

`FileManager.tsx:60` 预览时 `readWorkbookAsync(file)` 解析一次；用户点确认后 `handlePreviewConfirm`（`:132`）再用 `fileCache` 里的原文件 `parseWithConfigAsync` **重新解析一次**。对宽表就是双倍峰值。已有优化（vue 层 memo、跳过重建闭包）见 `AssetGroupedView.tsx:11-21` 的性能注记——说明渲染侧已到边际收益递减，**瓶颈已从渲染转到数据驻留**。

## 3. 目标与非目标

**目标**：把稳态占用和单次导入峰值分别压下来；优先低风险改动。

**非目标（本轮不做，记为 P2 待议）**：
- **worker IPC 契约瘦身（实测最大单项杠杆）**：`readWorkbook`（`excelParserAsync.ts:88`、worker `excelParser.worker.ts:33`）把完整 `WorkBook` 结构化克隆回主线程，实测 **37 MB → 69 MB**，单这一项就占 72 MB 峰值的 ~44%。应让 worker 直接返回有界行集（或按 `!ref` 裁剪的片段）。之所以拆出：它同时改 IPC 契约与 6 处调用方的数据形状，与 P1-1 的 bounded preview 叠加会让回归面过宽；**但它才是压平导入峰值的根治项，建议 P0/P1 落地后立即评估。**
- 顶层模块常驻挂载治理（`App.tsx:94-118` 用 `display:none` 保活 5 个模块，各自状态树与 58 个 antd 组件常驻）。UX 收益与状态保活取舍需要单独决策。
- 平铺资产视图窗口化（见 §4 P0-2b）。用户选择本轮只做默认的分组视图。

## 4. 方案

### P0 — 稳态占用（低风险，先落地）

#### P0-1 状态泄漏清理（`FileManager.tsx`）

- `fileCache` 的生命周期收敛到**单次导入**：仅保留当前待导入的那一个文件，导入确认/取消后清空（P1-2 会把它换成单个 `pendingWorkbook` 引用，此处先定生命周期）。
- `previewData` 在预览弹窗关闭（`onCancel`/`onConfirm`）时置 `[]`。
- `diffState` 在 `onClose` 时连同 `base/target` 一起清空，而非只置 `open:false`。

**验收**：连续导入 5 个不同文件后 `fileCache.size ≤ 1`；关闭预览后 `previewData.length === 0`；关闭比对后 `diffState.base === null`。

#### P0-2 分组视图收起组条件挂载（初稿为窗口化，已按勘察修正）

**初稿（窗口化 + 抽 `AssetCard`）被推翻的原因**——勘察发现两处事实：

1. **默认视图是 `grouped`，不是平铺**。`DataSourcePanel.tsx:100` 的 `viewMode` 初始值为 `'grouped'`（并从 localStorage 读取上次选择）。初稿窗口化的是平铺视图，即用户最少用的那个。
2. **收起状态的组仍全量挂载行**。收起用的是 CSS 揭示，不是条件挂载：

   ```tsx
   // AssetGroupedView.tsx:308-312（现状）
   <div className={`grid transition-[grid-template-rows,visibility] duration-200 ease-[var(--ease-ui)] ${
       expanded ? 'grid-rows-[1fr] visible' : 'grid-rows-[0fr] invisible'
   }`}>
   ```

   `grid-rows-[0fr] + invisible` 只做视觉折叠，`group.files.map` 仍然全部执行、全部挂载。

真实库实测：519 资产 / 158 组 / 均 3.3 行 → **677 行常驻**（即使一个组都没展开）。这正是资产列表内存的大头。

**修正后的方案**：把收起的组改为**条件挂载**（`{expanded && <div>…{group.files.map(…)}</div>}`）。组内均 3.3 行，按组挂载即可消除绝大部分常驻行，**无需引入窗口化基础设施**——更小改动拿到同量级收益。

- **用户已裁定**：换取内存，接受**去掉收起/展开的高度过渡动画**。
- 一处收益会被抵消（预期内）：`expanded = expandedKeys.has(...) || filtersActive`（`AssetGroupedView.tsx:283`）——筛选激活时命中组强制展开，这些组会真实挂载行。实测须分开量「无筛选全收起」与「有筛选」。
- 改一处即覆盖三个视图：`AssetGroupedView` 同时服务 `grouped` / `mfr` / `family`（`AssetFacetSections.tsx:35` 复用）。
- **平铺视图窗口化转为 P2**（用户选择本轮不做）。

**验收**：打开资产页、无筛选、全部组收起时，DOM 行节点从 677 降到 0（仅组头）；展开某组后该组行出现；`mfr` / `family` 视图行为一致。

#### P0-2b 平铺视图窗口化（**P2，本轮不做**）

若后续要给平铺视图加窗口化（用户选择本轮不做），复现初稿思路：零依赖 `useWindowedRows` + 纯函数 `computeWindow(total, rowHeight, scrollTop, viewportHeight, overscan)`，抽 `<AssetCard>` 并固定行高（标签行 `flex-wrap` 需改为单行 + `+N` 折叠）。`useViewportPaneHeight.ts` 是现成的零依赖范式（`window.resize` + `ResizeObserver`）。

#### P0-3 资产库扫描去重

- 以 `useAssetLibrarySnapshot.ts` 为**单一数据源**（它已按 `assetLibraryPath + assetVersion` 缓存快照）。
- `DataSourcePanel`、`FileManager`、`AnnouncementArchiveList`、`AnnouncementBatchImportModal` 的 6 处直接调用改为消费该快照 / 共享缓存；`DataPreview.tsx` 已零引用（死代码，随本轮清理）。
- 在 `assetManager` 层加**按 `(libraryPath, assetVersion)` 的短期缓存**，作为非 React 调用方的兜底，避免重复 IPC + 解析。

**验收**：打开资产页后，`scan_asset_library` 的 Rust 调用次数由「多处并发」降到 1 次（可用 Rust 侧计数或前端埋点确认）。

### P1 — 导入峰值（改动较大，需跑全量验证）

#### P1-1 预览有界化（`excelParser.ts:596` `previewWorkbook`）

- 用收敛后的 `!ref`（`decode_range`）直接得到 `totalRows / totalCols`，不再扫全表。
- 仅对**前 101 行**调 `sheet_to_json`（`range` 只约束行、列仍取 `!ref` 全宽），再 `slice(0, 100)`。

**勘误（2026-10-08，实测后）**：初稿第 3 条「去掉按 `totalCols` 补空」**做不到且不必做**。`sheet_to_json` 传 `defval: ''` 时会把每行补满到 `range` 的宽度，所以有界化后行仍是等宽——已实测：新实现在 7 组用例（含 ragged、XFD 膨胀、空表、5000 行）下与旧实现**逐字节一致**。因此本项的收益来自**行数**（整表 → 101 行），不是列补空。

**实测收益**（真实文件 `产品准入导出*.xlsx`，478×504）：物化行数 **478 → 101**，预览堆增量约 **11.0 MB → 2.4 MB**（单次预览量级；具体数值受 GC 时机影响有波动，行数是稳定事实）。

**验收**：`previewWorkbook` 输出与旧实现逐字节一致（回归单测，含 XFD 膨胀与 ragged 用例）；用 spy 断言 `sheet_to_json` 收到的 `range.e.r - range.s.r ≤ 100`（即不再整表物化）。

#### P1-2 免二次解析（`FileManager.tsx`）— P1 中数值收益最高

- 预览阶段已拿到的 `WorkBook` 缓存起来，`handlePreviewConfirm` 直接复用，不再 `parseWithConfigAsync(cachedFile, configs)` 重读重解。现状是**解析两遍**，省下的是第二次的整份 ~37 MB + 全量转换，是 P1 里最大的单笔收益。

**与 P0-1 的张力（需在此定调，否则两阶段会互相打架）**：缓存 `WorkBook` 与 P0-1「清 `fileCache` 防泄漏」直接冲突。定调如下：

- 缓存**只在预览弹窗存活期间**持有：`openPreviewDialog` 存入，`onConfirm`/`onCancel` 立即释放。**不跨导入周期保留**。
- 不以「用户可能重开同一文件」为由长期缓存 `WorkBook`。
- 承载物从 `fileCache: Map<string, File>`（保留原始 `File`）改为**单个 `pendingWorkbook` 引用**（`useRef` 或 state），生命周期与弹窗一致。

**验收**：确认导入同文件时 `XLSX.read` 调用次数由 2 降到 1（前端埋点/单测断言）；弹窗关闭后 `pendingWorkbook` 已释放。

## 5. 验证口径

改完必须跑（AGENTS.md）：

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

- **触碰 `excelParser.ts` / `FileManager.tsx` / `DataSourcePanel.tsx`（热点文件）**：四条全跑。
- **手工内存口径**（可复现）：生产构建 + `vite preview`，打开 519 资产库、选 N 台车，记录 WebContent 进程 RSS；导入 `产品准入导出*.xlsx` 前后各记一次。
- **Node 复现口径**（已用于本设计，见 §2.3）：`node --expose-gc` 脚本对真实文件跑「整表 vs 有界」两条路径对比峰值，作为 P1 的验收基准。
- 新增单测：`computeWindow` 边界、`previewWorkbook` 等价性；测试 mock 数组/对象须共享可变状态（AGENTS.md 已知坑，避免 jsdom OOM）。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 窗口化引入滚动跳动/定位错位 | 保留原「聚焦定位」逻辑；`computeWindow` 纯函数单测覆盖边界；先只对平铺视图落地，分组视图分步切 |
| 预览有界化改变解析结果 | 用真实库全量回归 `previewWorkbook` 等价性；列角色配置依赖的行范围先确认 |
| 去重扫描引入缓存失效 bug | 缓存键含 `assetVersion`，对象级动作后 `bumpAssetVersion` 已存在，沿用现有失效信号 |
| 热点文件（1690/1260 行）改动 | 新逻辑优先落到独立文件/子组件（AGENTS.md），不往大文件里堆；`AssetCard` 抽成独立组件 |

回滚：P0/P1 各自独立提交，任一阶段出问题可按阶段回退，不互相阻塞。

## 7. 实施分期

| 阶段 | 内容 | 触点 | 验证 |
|---|---|---|---|
| P0-1 | 状态泄漏清理 | `FileManager.tsx` | lint + test |
| P0-2 | 分组视图收起组条件挂载（去收起动画） | `AssetGroupedView.tsx` | lint + typecheck + test |
| P0-3 | 扫描缓存去重 | `assetManager.ts`（+ 删死代码 `DataPreview.tsx`） | lint + test |
| P1-1 | 预览有界化（小收益，去 O(全表) 分配） | `excelParser.ts` | lint + typecheck + test + build |
| P1-2 | 免二次解析（P1 最大单笔收益） | `FileManager.tsx` | lint + test + build |

**优先级提示**：若只想动一处拿最大收益，选 **P2 的 worker IPC 瘦身**（§3 非目标，~44% 峰值）；若限定在 P0/P1 内，选 **P1-2**。

实施完把本文件状态头改为「已实施」，实施备注追加到 §8。

> 实施计划（Task 粒度、含完整代码与测试命令）见 `2026-10-08-runtime-memory-reduction-implementation.md`。
> 勘误（2026-10-08，勘察后）：§4 P0-2 初稿的「窗口化 + 抽 AssetCard」已修正为「分组视图收起组条件挂载」——默认视图是 `grouped` 且收起组仍全量挂载行（677 行常驻）；平铺视图窗口化转 P2。

## 8. 实施备注（2026-10-08）

本阶段落于分支 `perf/runtime-memory`（当时 9 提交；后续 P2 在同一分支追加）。全部四条验证通过：`lint` 0 error（24 条既有 warning）、`typecheck` 干净、`test` 44 文件 / **356** 测试、`build` 通过。

### 8.1 实测结果

| 项 | 测量 | 结果 |
|---|---|---|
| **P0-2 分组视图**（主收益） | jsdom 渲染 158 组 × 3 行，全部收起 | DOM 节点 **8,059 → 2,845（−65%）**；行元素 **474 → 0（−100%）**。展开某组只挂载该组 3 行 |
| **P1-1 预览有界化** | 真实文件 `产品准入导出*.xlsx`（478×504 / 240,912 单元格） | 物化行数 **478 → 100**；预览堆增量约 **11.0 → 2.4 MB**（单次观测，GC 时机有波动；行数是稳定事实） |
| **P1-1 输出等价性** | 5 个真实表 + 12 个构造形态（含 ragged / XFD 膨胀 / 非 0 起始行 / 空表） | **逐字节一致**（`defval:''` 会补满行宽，故列行为不变——见 §4 P1-1 勘误） |
| **P1-2 免二次解析** | 代码路径核对 | 确认导入的 `XLSX.read` 次数 **2 → 1** |
| **P0-3 扫描缓存** | 单测 | 6 处调用共享一次扫描；并发首拉只扫一次；写操作后失效；空结果/失败不缓存 |
| **主线程解析代价**（P1-2 的权衡） | 最坏真实文件 | 确认时主线程同步解析约 **49ms**（sheet_to_json 45ms + 单元格遍历 4ms）——单次用户动作，可接受；注意到它从 Worker 移到了主线程 |

### 8.2 实施中发现并修正的问题（初稿/初判有误）

1. **P0-2 目标搞错**（实施前勘察发现）：初稿要窗口化「平铺视图」，但默认视图是 `grouped`，且收起组是用 CSS `grid-rows-[0fr]` 视觉折叠、**行仍全量挂载**。改为条件挂载，一行改动拿到同量级收益，无需窗口化基础设施。代价（去动画）已获用户确认。
2. **P1-1 收益来源判断有误**：初稿称「去掉按 `totalCols` 补空」，实测 `defval:''` 本就会补满行宽，**该补空去不掉也不必去**；真实收益来自行数。已改验收口径为「断言 `range` 上界 + 输出等价」。
3. **扫描缓存会把瞬时故障固化成空库**（实现后发现）：`scanAssetFiles` 对失败是「吞错 → 回退」，故障与真空库都表现为 `[]`，缓存后 UI 会长期显示「资产库空空如也」。改为**空结果一律不缓存**。
4. **扫描缓存让「刷新资产库」按钮失效**（终审发现）：缓存只在应用内写操作时失效，用户在 Finder 里增删改没有失效信号，刷新按钮会一直返回过期列表。为 `getAssetFilesWithInfo` 加 `force` 参数供刷新强制重扫。
5. **共享缓存数组被原地排序**：`DataSourcePanel` 原本 `infos.sort(...)` 原地改，加缓存后所有调用方共享同一数组会互相污染；改为 `[...infos].sort(...)`。

### 8.3 测试覆盖

新增单测：`importTransients`（4）、`assetManager.cache`（12，含 5 条写操作失效）、`excelParser.preview`（7）。共 +23 测试（333 → 356）。

**已知覆盖缺口**：`FileManager` / `DataSourcePanel` / `AssetGroupedView` 三个组件的改动无单测——这三个文件没有既有测试文件，且 AGENTS.md 警告重型 jsdom 套件会 OOM（本次已观测到 CompareView 测试在全量跑时偶发超时、单独跑正常）。P0-2 的收益用一次性 jsdom 探针实测（见 8.1），未固化为回归测试。

### 8.4 未做（P2，见 §3）

worker IPC 瘦身（实测占导入峰值 ~44%，压平峰值的根治项）、顶层模块常驻治理、平铺视图窗口化。建议下一步优先评估 worker IPC。
