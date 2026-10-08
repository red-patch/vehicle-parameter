# worker IPC 瘦身 — workbook 改由 worker 持有 — 设计方案

> 日期：2026-10-08 ｜ 状态：设计定稿（**实施未开始，待用户确认后动工**）
> 前置文档：`2026-10-08-runtime-memory-reduction-design.md`（P0–P1，已实施）、`2026-10-08-runtime-memory-reduction-implementation.md`（实施计划）。
> 来源：该方案 §3 非目标中列为 P2 的「实测最大单项杠杆」，2026-10-08 续做。

## 1. 背景与问题

P0–P1 已把稳态占用与预览峰值压下来，但**导入峰值的大头没动**：`readWorkbook` 这条 IPC 把 worker 里刚解析出的**完整 workbook 结构化克隆回主线程**。P0–P1 的实测拆分里，这一项占单次导入 72 MB 峰值的 ~44%，是全套改动里最大的单项。

进一步实测（本次）发现，问题比「复制一份」更具体：**主线程拿到 workbook 后，几乎没人真的需要它。**

### 1.1 六个消费者，只有一个需要单元格矩阵

| 消费者 | 调用 | 实际用途 |
|---|---|---|
| `FileManager` | `readWorkbookAsync` | 判方向 + 出预览 + 确认时按配置解析 |
| `AssetUpgradeModal` | `readWorkbookAsync` | 出预览；确认时**再从 File 重解析一遍** |
| `MultiVehicleView` | `readWorkbookFromBufferAsync` | 取首 sheet 行 → 提字段名 |
| `SmartFillView` | `readWorkbookFromBufferAsync` | 取首 sheet 行 → 提字段名 |
| `AttributeDedup` | `readWorkbookFromBufferAsync` | 取首 sheet 行 → 建对象数组 |
| `EnumImportModal` | `readWorkbookFromPathAsync`（**Rust 路径**，另一条传输通道） | 按单元格地址读表头与数据 |

即：**5/6 的消费者只要「行」，从来不用单元格矩阵**；唯一真需要矩阵的那个走的是 Rust 路径，不在本方案的 worker IPC 范围内（见 P2-4，另一条通道同样该瘦）。

## 2. 实测事实（设计依据）

真实文件 `~/Downloads/产品准入导出20261001192732.xlsx`（磁盘 1.03 MB，478 行 × 504 列，**240,912 单元格**）：

| 跨 worker→主线程的载荷 | 内存 | 相对 workbook |
|---|---|---|
| `structuredClone(WorkBook)`（**现状**） | **32.2 MB** | — |
| 完整 AOA 行 | 2.0 MB | **小 94%** |
| 有界 AOA（前 101 行，预览所需） | 0.44 MB | **小 99%** |
| `parseWorkbook` 产出的 `SheetData`（确认所需，无法再瘦） | 21.6 MB | 小 33% |

**重解析代价**（P1-2 当初避免的东西）：`XLSX.read` **745 ms** + `sheet_to_json` 57 ms ≈ **802 ms** CPU。→ 这就是「不能简单让确认时重解析」的量化依据。

**Rust 侧同一病**（`EnumImportModal` 的 111,936 单元格文件）：

| 跨 Tauri IPC | 大小 |
|---|---|
| SheetJS 兼容单元格矩阵 JSON 字符串（现状） | 6.41 MB |
| AOA 替代 | 1.71 MB（小 73%） |

注意这只是**字符串**长度；Rust 侧还要同时持有构建中的 `serde_json::Value`，JS 侧 `JSON.parse` 后又是一份。

### 2.1 一处与初判不同的发现

设计文档原先假设「主线程需要 workbook 以便确认时复用」（P1-2 据此把 workbook 留在主线程 `pendingWorkbookRef`）。实测表明：**确认所需的是 `SheetData`（21.6 MB），不是 workbook（32.2 MB）**。让 worker 持有 workbook、确认时在 worker 内解析并只回 `SheetData`，可以同时拿到「不复制 workbook」与「不重解析」两个好处——这正是本方案的核心。

## 3. 目标与非目标

**目标**：让完整 workbook **永不跨进程/线程边界**；主线程只收它真正消费的载荷。

**非目标（本轮不做）**：
- `parseExcelAsync`（整文件 → `SheetData`）无需改动——它已经是 worker 解析、只回 `SheetData`，本就最优（§1.1 已核）。
- 顶层模块常驻挂载治理（`App.tsx:94-118`），与内存轴不同，另行评估。
- `detectWorkbookOrientation` 逐 sheet 全量 `sheet_to_json` 的隐式开销：新方案下它跑在 worker 内，不再卡 UI；是否再有界化留待观察后决定（见 §6）。

## 4. 方案

### P2-1 引入 workbook handle 协议，worker 持有 workbook

核心：把「返回 workbook」换成「返回 handle + 主线程真正需要的产物」。worker 内用 `Map<number, XLSX.WorkBook>` 持有，主线程只拿 id。

```ts
// excelParserAsync.ts 新增导出
export interface WorkbookHandleInfo {
    handleId: number;
    fileName: string;
    sheetNames: string[];
    orientation: WorkbookOrientation;
    /** 已按 P1-1 有界化（≤100 行），实测 0.44MB 量级 */
    previews: SheetPreview[];
}

/** 一次解析，worker 内缓存 workbook；返回方向判定 + 预览 + handle */
export const openWorkbookAsync = async (file: File): Promise<WorkbookHandleInfo>;

/** 在 worker 内用缓存的 workbook 解析（configs 缺省 → parseWorkbook） */
export const parseHandleAsync = async (
    handleId: number,
    fileName: string,
    configs?: SheetParseConfig[]
): Promise<SheetData>;

/** 释放 worker 内缓存（幂等） */
export const releaseWorkbookHandle = (handleId: number): void;
```

worker 侧新增三类消息：`openWorkbook`（`XLSX.read` → `detectWorkbookOrientation` + `previewWorkbook` → 缓存 → 回 `{handleId, orientation, previews, sheetNames}`）、`parseHandle`（查缓存 → `parseWorkbook`/`parseWorkbookWithConfig` → 回 `SheetData`）、`releaseHandle`。

**handle 生命周期**（本方案最容易出错的地方，逐条定死）：
- worker 内缓存**上限 3 个**，超出按 LRU 驱逐（防调用方漏释放导致 worker 内无界增长）。
- 主线程侧每个持有方在**组件卸载 / 弹窗关闭 / 路径退出**时释放；沿用 P1-2 已建立的 `releaseImportTransients` 漏斗（`FileManager.tsx`），不新开释放点。
- `releaseWorkbookHandle` 必须幂等（重复释放/释放不存在的 id 不抛错）。
- 释放后对该 handle 的 `parseHandleAsync` 必须**明确报错**（而非静默返回空），便于定位漏放。

**worker 不可用时的降级**：保持同一套 handle 协议，但把 `Map` 放在主线程（模块级）。此时内存行为退化为今天的样子（workbook 在主线程），**正确性不变、性能不倒退**。仅当 module worker 不支持时触发（Tauri 的现代 WebKit 实际不触发）。

**迁移 `FileManager`（主路径）**：`openPreviewDialog` 改为 `openWorkbookAsync(file)`，`pendingWorkbookRef: XLSX.WorkBook | null` 换成 `pendingHandleIdRef: number | null`；`handlePreviewConfirm` 改为 `parseHandleAsync(handleId, ...)`。横向路径（`importHorizontalDirectly`）同样改为 `parseHandleAsync` 不带 configs。

### P2-2 迁移 `AssetUpgradeModal`

它今天保留原始 `File`（`pendingFileRef`）供确认时 `parseWithConfigAsync` 重解析一遍——本方案下改为持 handle，顺带消掉这次重解析。与 P2-1 同一协议，无新概念。

### P2-3 「只需行」的消费者改走解析侧载荷

> **实施前实测修正**：本节的初稿要求「worker 回 AOA，主线程用自写函数把 AOA 转成表头对象并复刻 SheetJS 命名」。实测否决——SheetJS 的命名语义比预想复杂：空表头 → `""`、**重复空表头 → `_1`**、行超出表头宽度 → `__EMPTY`/`__EMPTY_1`、**单元格为 `null` → 该键整体省略**、**全空行保留**、表头行为空 → `[]`。手写复刻极易静默改结果。
>
> **改为：在解析侧直接调 SheetJS 转换**（workbook 本就在那里），只把终态送回。零复刻、零语义风险，且载荷更小：终态对象 **0.54MB** vs AOA 1.72MB vs workbook 克隆 21.37MB（111,936 单元格的枚举文件实测）。

新增两个接口（替换 `readWorkbookFromBufferAsync` 的使用）：

```ts
export interface SheetRowsResult { sheetName: string; rows: unknown[][] }
export interface SheetObjectsResult { sheetName: string; objects: Record<string, unknown>[] }

/** 首 sheet 的行（header:1），workbook 不出解析侧 */
export const readFirstSheetRowsAsync = async (buffer: ArrayBuffer): Promise<SheetRowsResult>;
/** 首 sheet 的表头对象数组——解析侧直接委托 SheetJS sheet_to_json，语义由库保证 */
export const readFirstSheetObjectsAsync = async (buffer: ArrayBuffer): Promise<SheetObjectsResult>;
```

底层两个转换函数（`firstSheetRows` / `firstSheetHeaderObjects`）放在 `excelParser.ts`，**worker 与主线程 fallback 共用同一份实现**（不做双份，避免漂移）。

迁移：
- `MultiVehicleView`、`SmartFillView` → `readFirstSheetRowsAsync`，用 `rows`；
- `AttributeDedup` → `readFirstSheetObjectsAsync`，用 `objects`。它原来调的就是 `sheet_to_json(sheet)`（默认语义），现在由解析侧调**同一个函数**，语义差异为零——这正是放弃手写复刻的原因。

`readWorkbookFromBufferAsync` / `readWorkbookAsync` **在本轮全部迁移完成后删除**，避免留下仍会拖 32MB 的入口。

### P2-4 Rust `read_workbook` 改回 AOA

`EnumImportModal` 是唯一调用方（`readWorkbookFromPathAsync`）。它今天用 `decode_cell` + `sheet[addr]` 重建行列网格——**其实就是在手工还原 AOA**。改为：

- Rust `read_workbook` 返回 `{ sheetNames, sheets: { [name]: { rows: Value[][], totalRows, totalCols } } }`（或按需只回首 sheet），去掉 A1 寻址的单元格矩阵。calamine 的 `range.rows()` 本就是行迭代，**这个改动在 Rust 侧是简化**（现状每个单元格都要 `format!` 生成一个 A1 地址字符串 + 一个 `Value::Object`，AOA 直接省掉这两笔分配）。
- `EnumImportModal` 改为直接用 `rows`（表头 = `rows[0]`，单元格 = `rows[r][c]`），并**去掉 `decode_cell`/`encode_cell`/`sheet[addr]` 那套手工还原行列网格的代码**（它本就是在把矩阵转回 AOA）。

**⚠ 空单元格必须补位，否则列会错位**：现状 `cell_to_json` 对 `CellData::Empty` 返回 `None`，即**空单元格不出现在 map 里**；A1 寻址下这没问题（查不到就是空）。改成 AOA 后必须保证每行按 `totalCols` 补满（空 → `null`），否则该行后面的列会整体左移。calamine 的 `range.rows()` 已按工作表列范围对齐、并含 `CellData::Empty`，因此**照 `row.iter()` 逐格转换即可天然对齐**——但这条要在等价性验收里显式覆盖（构造含空单元格的行，断言列不错位）。

收益：该文件的 IPC 字符串 6.41 MB → 1.71 MB。**此阶段可独立验收、独立回滚**（不同传输通道），若你想缩小本轮范围，可单独推后。

## 5. 验证口径

改完必跑（AGENTS.md）：`npm run lint && npm run typecheck && npm run test && npm run build`；P2-4 另需 `cd src-tauri && cargo test`（若新增 Rust 单测）。

- **自动化**：`openWorkbookAsync` → `parseHandleAsync` → `releaseWorkbookHandle` 全链路单测（mock worker 或直接测 handle 协议）；handle 上限驱逐、重复释放幂等、释放后解析报错、worker 降级路径——各一条。
- **回归红线**：迁移后 `previewWorkbook`/`parseWorkbook`/`parseWorkbookWithConfig` 的输出必须与迁移前**逐字节一致**（沿用 P1-1 已建立的真实文件对比口径，5 个真实表 + 构造形态）。
- **内存口径（可复现）**：Node/浏览器侧量「一次 openWorkbook + parseHandle 的峰值」，与「旧 readWorkbookAsync + parseWorkbookWithConfig」对比；预期省掉一份 32MB 量级的 workbook 克隆。
- **真实应用 RSS 复测仍待人工**：与 P0–P1 一样，本环境无法驱动 Tauri 应用，最终数字需人工在真机补（见 P0–P1 设计文档 §8 同名缺口）。

## 6. 风险与回滚

| 风险 | 缓解 |
|---|---|
| **handle 泄漏**（worker 内 workbook 不释放） | worker 内 LRU 上限 3；单测覆盖漏放场景；释放走既有 `releaseImportTransients` 漏斗 |
| **worker 持有期内存**：并发打开多个大文件时 worker 内可能同时持有多份 workbook | 上限 3 已界定上界；配合 LRU 驱逐 |
| handle 协议改动波及 6 处调用方 | 分阶段：P2-1 只迁 FileManager（主路径，风险集中点），独立验证通过再推 P2-2/P2-3；`readWorkbook*` 最后删 |
| worker 崩溃导致 handle 失效 | 协议明确报错；降级到主线程 store 保持可用；不静默返回空数据 |
| Rust 侧改动改变解析结果 | P2-4 独立阶段，用相同真实文件做 AOA 等价对比 |
| `detectWorkbookOrientation` 在 worker 内全量物化（未定） | 先测新方案下的 worker 峰值；若仍显著，另开一项有界化（不塞进本方案） |

回滚：P2-1/P2-2/P2-3/P2-4 各自独立提交，可按阶段回退；`readWorkbook*` 保留到最后一阶段才删，保证中途可退。

### 6.1 释放粒度是刻意的差异（勿"统一"）

两个消费者释放 handle 的粒度**故意不同**，不是遗漏：

| 消费者 | 释放入口 | 粒度 | 原因 |
|---|---|---|---|
| `FileManager` | `releaseImportTransients`（P0–P1 既有漏斗） | handle + fileCache/previewData/diffState | 该组件本就以这个漏斗统一清理导入过程态，handle 搭同一班车最不易漏 |
| `AssetUpgradeModal` | `releasePendingHandle` | 仅 handle | 其状态形状不同，没有那套 process-state 需要一起清 |

另外 `FileManager` 的 handle 有**两种持有形态**：非横向（跨预览→确认持有，由 `releaseImportTransients` 释放）与横向（在 `importHorizontalDirectly` 的 `finally` 内消费即释放，且 ref 在调用前置 null）。

**后续代理注意**：看到两者不对称时，不要以"保持一致"为由重构——差异由各自的状态形状决定。若确实要统一，先确认 `AssetUpgradeModal` 是否真的需要 fileCache/diffState 这类状态。

## 7. 实施分期

| 阶段 | 内容 | 触点 | 验证 |
|---|---|---|---|
| P2-1 | handle 协议 + worker 持有 + 迁移 `FileManager` | `excelParserAsync.ts`、`workers/excelParser.worker.ts`、`FileManager.tsx` | lint + typecheck + test + build |
| P2-2 | 迁移 `AssetUpgradeModal`（消掉重解析） | `AssetUpgradeModal.tsx` | 同上 |
| P2-3 | AOA 接口 + 迁移 3 个「只需行」消费者；删 `readWorkbook*` | `excelParserAsync.ts`、`MultiVehicleView.tsx`、`SmartFillView.tsx`、`AttributeDedup.tsx` | 同上 |
| P2-4 | Rust `read_workbook` → AOA + 迁移 `EnumImportModal`（可独立推后） | `src-tauri/src/excel.rs`、`EnumImportModal.tsx` | 四条 + `cargo test` |

**优先级提示**：P2-1 是本方案的收益核心（主路径 32MB 克隆）；P2-4 是另一条通道的同类问题，收益独立、风险独立，可单独排期。
