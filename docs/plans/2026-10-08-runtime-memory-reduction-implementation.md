# 运行内存占用治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 降低应用稳态内存占用（状态泄漏 + 分组视图收起行仍全量挂载 + 6 处重复扫描）与单次导入峰值（重复解析）。

**Architecture:** 分两条正交轴推进。P0 收敛状态生命周期、让资产分组视图的**收起组不再挂载行**（默认视图，实测 158 组 × 均 3.3 行 = 677 行常驻）、把 6 处资产库扫描收敛成单一缓存源。P1 让 `previewWorkbook` 按 `!ref` 有界化，并让导入确认复用预览已解析的 workbook（消除重复解析）。设计依据见 `docs/plans/2026-10-08-runtime-memory-reduction-design.md`。

**Tech Stack:** Tauri 2 + React 19 + TypeScript + Vite 7 + zustand + antd 6 + Vitest（jsdom + Testing Library）。无新增运行时依赖。

**验证命令**（AGENTS.md）：`npm run lint`、`npm run typecheck`、`npm run test`、`npm run build`。

**范围裁定（2026-10-08 会话，用户确认）**：
1. 资产列表内存的主战场是**默认的分组视图**——其「收起」是 CSS `grid-rows-[0fr] invisible` 揭示（`AssetGroupedView.tsx:310`），**行始终挂载**。改为条件挂载会**去掉收起/展开的高度过渡动画**（用户已确认：换内存，去动画）。
2. **平铺视图（flat）本轮不做**窗口化，列为 P2。`AssetGroupedView` 同时服务 `grouped` / `mfr` / `family` 三个视图（`AssetFacetSections.tsx:35` 复用），改一处即覆盖三处。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/utils/importTransients.ts` | 一次性清理导入过程态（可测的清理入口） | Create |
| `src/utils/__tests__/importTransients.test.ts` | 清理函数单测（假 setter） | Create |
| `src/utils/assetManager.ts` | 加「按库路径 + 版本」的扫描缓存与失效入口 | Modify |
| `src/utils/__tests__/assetManager.cache.test.ts` | 缓存命中/失效单测（mock Tauri invoke） | Create |
| `src/components/ParameterWorkbench/AssetGroupedView.tsx` | 收起组条件挂载行（去动画） | Modify |
| `src/components/ParameterWorkbench/FileManager.tsx` | 清理泄漏态；复用预览 workbook | Modify |
| `src/utils/excelParser.ts` | `previewWorkbook` 有界化 | Modify |
| `src/utils/__tests__/excelParser.preview.test.ts` | `previewWorkbook` 等价性 + 有界性单测 | Create |

**顺序原则**：低风险独立改动先行；热点文件（`AssetGroupedView.tsx` ~342 行、`FileManager.tsx` ~719 行）只做小面积改动，新逻辑一律落在独立文件（AGENTS.md）。

---

### Task 1: 分组视图收起时不再挂载行（P0-2）

**Files:**
- Modify: `src/components/ParameterWorkbench/AssetGroupedView.tsx:306-334`

**背景与实测**：默认视图是 `grouped`（`DataSourcePanel.tsx:100`）。收起组目前用 CSS 揭示实现：

```tsx
// AssetGroupedView.tsx:308-312（现状）
<div className={`grid transition-[grid-template-rows,visibility] duration-200 ease-[var(--ease-ui)] ${
    expanded ? 'grid-rows-[1fr] visible' : 'grid-rows-[0fr] invisible'
}`}>
```

`grid-rows-[0fr] + invisible` 只是视觉折叠，**`group.files.map` 仍然全部执行、全部挂载**。真实库 519 资产 / 158 组 → **677 行常驻**（含全部收起态）。这是资产列表内存的大头。

**用户已裁定**：换取内存，接受**去掉收起/展开的高度过渡动画**。

**为什么改这里而不是抽组件做窗口化**：`AssetGroupedView` 同时服务 `grouped` / `mfr` / `family` 三个视图（`AssetFacetSections.tsx:35` 复用），且组内均 3.3 行——**按组条件挂载**即可消除绝大部分常驻行，无需引入窗口化基础设施。

- [ ] **Step 1: 改为条件挂载**

把 `AssetGroupedView.tsx` 的 `306-334` 行整段（注释 + 外层 `grid` div + 内层 `overflow-hidden` div + `mt-1 space-y-0.5` div + `group.files.map(...)`）替换为：

```tsx
                        {/* 仅展开时挂载行：收起态的组曾用 grid-rows-[0fr] 视觉折叠，
                            行仍全部常驻（实测 158 组 × 均 3.3 行 = 677 行）。
                            改为条件挂载换取内存，代价是失去高度过渡动画（2026-10-08 已确认）。 */}
                        {expanded && (
                            <div className="mt-1 space-y-0.5">
                                {group.files.map(entry => (
                                    <GroupFileRow
                                        key={entry.info.fileName}
                                        entry={entry}
                                        active={activeFileNames.has(entry.info.fileName)}
                                        focused={focusedFile === entry.info.fileName}
                                        batchMode={batchMode}
                                        checked={selectedFileNames.has(entry.info.fileName)}
                                        tags={assetTags[entry.info.fileName] || []}
                                        isLatest={latestFileNames.has(entry.info.fileName)}
                                        onRowContextMenu={onRowContextMenu}
                                        onFocusFile={onFocusFile}
                                        onToggleAsset={onToggleAsset}
                                        onOpenInspector={onOpenInspector}
                                        onToggleBatchSelected={onToggleBatchSelected}
                                    />
                                ))}
                            </div>
                        )}
```

（`GroupFileRow` 的 props 逐字保留，仅移除两层层级 div。）

- [ ] **Step 2: 验证 `GroupFileRow` 的 memo 不再被无谓触发**

确认 `GroupFileRow` 的 `React.memo` comparator（`AssetGroupedView.tsx:264`）仍成立：它比较的是数据 props（`entry` / `tags` 引用等），与挂载策略无关。无需改动，仅确认。

- [ ] **Step 3: 手工验证交互**

Run: `npm run dev`（dev 下页面切换慢属已知，只看功能）
打开应用 → 资产页（默认分组视图）→ 逐个展开/收起车型组：
- 展开能正常看到组内行；
- 收起后行消失；
- 双击行进资产检查器、右键菜单、批量勾选均正常；
- `mfr` / `family` 分节视图（`AssetFacetSections`）行为一致。

- [ ] **Step 4: 验证与提交**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: PASS。

```bash
git add src/components/ParameterWorkbench/AssetGroupedView.tsx
git commit -m "perf(memory): mount grouped rows only when expanded (drop collapse animation)"
```

**实测基线（供收尾对比）**：改造前，打开资产页且无展开组时，WebContent 进程 RSS ≈ 240 MB；改造后应显著下降（数值记入设计文档 §8）。

---


### Task 2: 收敛导入过程态的生命周期（P0-1）

**Files:**
- Create: `src/utils/importTransients.ts`
- Test: `src/utils/__tests__/importTransients.test.ts`
- Modify: `src/components/ParameterWorkbench/FileManager.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/importTransients.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { clearImportTransients } from '../importTransients';

describe('clearImportTransients', () => {
    it('releases the file cache, preview data and diff payload together', () => {
        const setFileCache = vi.fn();
        const setPreviewData = vi.fn();
        const setDiffState = vi.fn();

        clearImportTransients({ setFileCache, setPreviewData, setDiffState });

        expect(setFileCache).toHaveBeenCalledWith(new Map());
        expect(setPreviewData).toHaveBeenCalledWith([]);
        expect(setDiffState).toHaveBeenCalledTimes(1);
    });

    it('clears diff payloads (base/target) rather than only closing the modal', () => {
        const reset = vi.fn();
        const { setDiffState } = { setDiffState: reset };

        clearImportTransients({
            setFileCache: vi.fn(),
            setPreviewData: vi.fn(),
            setDiffState,
        });

        // 传入 updater 函数时，对旧状态调用应把 base/target 置空
        const updater = reset.mock.calls[0][0] as (prev: unknown) => unknown;
        const next = updater({ open: true, base: { data: [1] }, target: { data: [2] }, baseFileName: 'a', targetName: 'b' });
        expect(next).toEqual({ open: false, base: null, target: null, baseFileName: '', targetName: '' });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/importTransients.test.ts`
Expected: FAIL — `Failed to resolve import "../importTransients"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/importTransients.ts`:

```ts
import type { SheetData } from '../types';

/**
 * 导入过程态的一次性清理（内存治理 P0-1）。
 *
 * 背景：FileManager 里 fileCache / previewData / diffState 此前只设不清——
 * fileCache 是 Map<string, File> 且只有 set，原始 File 永久驻留；
 * diffState 关闭弹窗时只置 open:false，base/target 两张整表仍被引用。
 *
 * 收敛到一个可测入口：所有「预览取消 / 确认 / sheet 选择取消 / 比对关闭」
 * 路径统一调用它，避免漏清。
 */
export interface ImportTransientSetters {
    setFileCache: (next: Map<string, File>) => void;
    setPreviewData: (next: never[]) => void;
    setDiffState: (updater: (prev: {
        open: boolean;
        baseFileName: string;
        targetName: string;
        base: SheetData | null;
        target: SheetData | null;
    }) => {
        open: boolean;
        baseFileName: string;
        targetName: string;
        base: SheetData | null;
        target: SheetData | null;
    }) => void;
}

export const clearImportTransients = (s: ImportTransientSetters): void => {
    s.setFileCache(new Map());
    s.setPreviewData([]);
    s.setDiffState(() => ({ open: false, baseFileName: '', targetName: '', base: null, target: null }));
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/importTransients.test.ts`
Expected: PASS（2 tests）。

- [ ] **Step 5: 在 FileManager 的所有关闭路径调用清理**

Modify `src/components/ParameterWorkbench/FileManager.tsx`：

1. 顶部 import：`import { clearImportTransients } from '../../utils/importTransients';`
2. `handlePreviewConfirm`（`~:132`）末尾——解析并进入确认弹窗后释放预览态：
   ```tsx
   setPreviewOpen(false);
   clearImportTransients({ setFileCache, setPreviewData, setDiffState });
   ```
3. `ExcelPreviewDialog` 的 `onCancel`（`~:366`）：
   ```tsx
   onCancel={() => { setPreviewOpen(false); clearImportTransients({ setFileCache, setPreviewData, setDiffState }); }}
   ```
4. `handleSheetPickerCancel`（`~:356`）内追加同一调用。
5. `ImportDiffModal` 的 `onClose`（`~:583`）改为：
   ```tsx
   onClose={() => setDiffState(prev => ({ ...prev, open: false, base: null, target: null }))}
   ```
6. `handleConfirmSave` 成功分支（已 `setPendingFileName('')` 之处）追加 `clearImportTransients({ setFileCache, setPreviewData, setDiffState });`

> 注意：`handlePreviewConfirm` 目前依赖 `fileCache.get(pendingFileName)` 取文件；Task 5 会把它替换为复用预览 workbook。**本任务先保持行为不变**，只加清理。

- [ ] **Step 6: 验证与提交**

Run: `npm run lint && npm run test`
Expected: PASS。

```bash
git add src/utils/importTransients.ts src/utils/__tests__/importTransients.test.ts src/components/ParameterWorkbench/FileManager.tsx
git commit -m "fix(memory): release import transient state (fileCache/previewData/diffState)"
```

---

### Task 3: 资产库扫描加短生命周期缓存（P0-3）

**Files:**
- Modify: `src/utils/assetManager.ts`
- Test: `src/utils/__tests__/assetManager.cache.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/assetManager.cache.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...a: unknown[]) => invokeMock(...a) }));
// scanAssetFiles 内部会调用 reconcileSidecarEntries → @tauri-apps/plugin-fs（读/写旁路文件）。
// jsdom 下这些调用会失败；reconcile 自带 try/catch 只告警，不会污染断言，
// 但如需消除告警可一并 mock：
vi.mock('@tauri-apps/plugin-fs', () => ({
    readTextFile: vi.fn().mockRejectedValue(new Error('not tauri')),
    writeTextFile: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    readDir: vi.fn().mockResolvedValue([]),
}));

import { getAssetFilesWithInfo, invalidateAssetScanCache } from '../assetManager';

describe('getAssetFilesWithInfo scan cache', () => {
    beforeEach(() => {
        invokeMock.mockReset();
        invokeMock.mockResolvedValue([]);
        invalidateAssetScanCache();
        (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
    });

    it('serves the second call for the same library + version from cache', async () => {
        await getAssetFilesWithInfo('/lib');
        await getAssetFilesWithInfo('/lib');
        expect(invokeMock).toHaveBeenCalledTimes(1);
    });

    it('re-scans after invalidation (assetVersion bump)', async () => {
        await getAssetFilesWithInfo('/lib');
        invalidateAssetScanCache();
        await getAssetFilesWithInfo('/lib');
        expect(invokeMock).toHaveBeenCalledTimes(2);
    });

    it('re-scans when the library path changes', async () => {
        await getAssetFilesWithInfo('/lib-a');
        await getAssetFilesWithInfo('/lib-b');
        expect(invokeMock).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/assetManager.cache.test.ts`
Expected: FAIL — `invalidateAssetScanCache is not a function`。

- [ ] **Step 3: 实现缓存**

在 `src/utils/assetManager.ts` 的 `getAssetFilesWithInfo` 之前插入：

```ts
/**
 * 扫描结果短缓存（内存治理 P0-3）。
 *
 * 同一份资产库元信息此前被 6 处独立拉取（DataSourcePanel / useAssetLibrarySnapshot /
 * FileManager / AnnouncementArchiveList ×2 / AnnouncementBatchImportModal），
 * 每次都是一轮 Rust 全库扫描 + 解析。这里按 (库路径, 版本) 去重：
 * - 命中直接复用，绝不返回过期数据——任何写操作都必须调用 invalidateAssetScanCache()。
 * - 存 Promise 而非结果：并发首拉也只会触发一次扫描。
 */
let scanCache: { key: string; promise: Promise<AssetFileInfo[]> } | null = null;
let scanCacheVersion = 0;

/** 资产库发生任何写操作（保存/重命名/删除/归档/改标签或元信息）后必须调用 */
export const invalidateAssetScanCache = (): void => {
    scanCache = null;
    scanCacheVersion += 1;
};
```

并把 `getAssetFilesWithInfo` 改为带缓存。**具体做法（避免歧义）**：

1. 把现有 `getAssetFilesWithInfo`（`src/utils/assetManager.ts:212-314`，含 `if (__TAURI_INTERNALS__) { try { invoke('scan_asset_library') … } }` 的 Rust 优先 + JS 回退整段）**原样改名为内部函数** `scanAssetFiles`，一字不改函数体。
2. 在其后新增导出的缓存包装：

```ts
export const getAssetFilesWithInfo = async (libraryPath: string): Promise<AssetFileInfo[]> => {
    const key = `${libraryPath}\u0000${scanCacheVersion}`;
    if (scanCache?.key === key) return scanCache.promise;
    const promise = scanAssetFiles(libraryPath);
    scanCache = { key, promise };
    // 失败不缓存，避免一次瞬时错误被固化
    promise.catch(() => { if (scanCache?.key === key) scanCache = null; });
    return promise;
};
```

> `scanAssetFiles` 内部会调用 `reconcileSidecarEntries`（`assetManager.ts:308`），它是**读放操作但有写副作用**（清理悬空标签/元信息条目）。缓存后该对账在一轮扫描内只跑一次——语义不变（对账本就是幂等的）。

- [ ] **Step 4: 在所有写操作后失效缓存**

在 `src/utils/assetManager.ts` 的以下导出函数**即将 return 之前**调用 `invalidateAssetScanCache()`：`saveAssetFile`、`saveAssetsBatch`、`renameAssetFile`、`renameAssetIdentity`、`renameAssetProductName`、`deleteAssetFile`、`archiveAssetFile`。（`saveAssetTags` / `saveAssetMeta` / `setAssetFileTags` / `setAssetFileMeta` 只影响旁路文件，`getAssetFilesWithInfo` 不读它们，**不需要**失效。）

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/assetManager.cache.test.ts`
Expected: PASS（3 tests）。

- [ ] **Step 6: 让 6 处调用方共享该缓存**

`getAssetFilesWithInfo` 现在自带缓存，调用方无需改动即已去重；**额外**把已确认死代码的 `src/components/ParameterWorkbench/DataPreview.tsx` 删除（`grep -rn "DataPreview" src/` 已确认零引用）：

```bash
git rm src/components/ParameterWorkbench/DataPreview.tsx
```

- [ ] **Step 7: 验证与提交**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: PASS。

```bash
git add src/utils/assetManager.ts src/utils/__tests__/assetManager.cache.test.ts
git commit -m "perf(memory): cache asset library scan by (path, version); drop dead DataPreview"
```

---

### Task 4: `previewWorkbook` 有界化（P1-1）

**Files:**
- Modify: `src/utils/excelParser.ts:596-615`
- Test: `src/utils/__tests__/excelParser.preview.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/excelParser.preview.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { previewWorkbook } from '../excelParser';

const buildSheet = (rows: number, cols: number): XLSX.WorkBook => {
    const aoa: string[][] = [];
    for (let r = 0; r < rows; r++) {
        aoa.push(Array.from({ length: cols }, (_, c) => `r${r}c${c}`));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    return { SheetNames: ['S'], Sheets: { S: ws } };
};

describe('previewWorkbook', () => {
    it('caps preview rows at 100 but reports the real totals', () => {
        const wb = buildSheet(478, 20);
        const [p] = previewWorkbook(wb);
        expect(p.rows.length).toBe(100);
        expect(p.totalRows).toBe(478);
        expect(p.totalCols).toBe(20);
    });

    it('keeps real column count instead of padding to the sheet width', () => {
        // 第 1 行只有 2 列，第 2 行有 5 列；totalCols 应为 5，
        // 但每行的长度应保持其真实长度（不补空到 5）
        const ws = XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd', 'e', 'f', 'g']]);
        const wb: XLSX.WorkBook = { SheetNames: ['S'], Sheets: { S: ws } };
        const [p] = previewWorkbook(wb);
        expect(p.totalCols).toBe(5);
        expect(p.rows[0].length).toBe(2);
        expect(p.rows[1].length).toBe(5);
    });

    it('reports totals for a sheet far larger than the preview window', () => {
        const wb = buildSheet(5000, 40);
        const [p] = previewWorkbook(wb);
        expect(p.totalRows).toBe(5000);
        expect(p.totalCols).toBe(40);
        expect(p.rows.length).toBe(100);
    });

    it('handles an empty sheet without throwing', () => {
        const ws = XLSX.utils.aoa_to_sheet([]);
        const wb: XLSX.WorkBook = { SheetNames: ['S'], Sheets: { S: ws } };
        const [p] = previewWorkbook(wb);
        expect(p.rows).toEqual([]);
        expect(p.totalRows).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/excelParser.preview.test.ts`
Expected: 第 2 条 FAIL（当前实现把每行补空到 `totalCols`，`p.rows[0].length` 会是 5 而非 2）。其余通过。

- [ ] **Step 3: 改写为有界实现**

`src/utils/excelParser.ts` 的 `previewWorkbook` 整体替换为：

```ts
/** 预览最多保留的行数 */
const PREVIEW_MAX_ROWS = 100;

export const previewWorkbook = (workbook: XLSX.WorkBook): SheetPreview[] => {
    return workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];

        // 与 sheetToRows 同一套 !ref 收敛：部分文件把 !ref 膨胀到 XFD，
        // 此时降级到真实单元格边界，避免 totalCols 被算成大得离谱的值。
        const ref = getEffectiveSheetRange(sheet) || sheet['!ref'];
        const decoded = ref ? XLSX.utils.decode_range(ref) : null;

        // 行列总数直接来自收敛后的 ref，不再扫全表物化（内存治理 P1-1）：
        // 此前先 sheet_to_json 整表再 slice(0,100)，宽表会白白分配整表数组。
        const totalRows = decoded ? decoded.e.r - decoded.s.r + 1 : 0;
        const totalCols = decoded ? decoded.e.c - decoded.s.c + 1 : 0;

        let rows: string[][] = [];
        if (decoded && totalRows > 0) {
            // 只物化前 PREVIEW_MAX_ROWS + 1 行（+1 供 UI 判断「还有更多」）
            const jsonData = XLSX.utils.sheet_to_json(sheet, {
                header: 1,
                defval: '',
                range: {
                    s: { r: decoded.s.r, c: decoded.s.c },
                    e: { r: Math.min(decoded.s.r + PREVIEW_MAX_ROWS, decoded.e.r), c: decoded.e.c },
                },
            }) as unknown[][];

            // 不再按 totalCols 补空：保留每行真实长度，列对齐交给渲染层（colSpan/CSS）
            rows = jsonData.slice(0, PREVIEW_MAX_ROWS).map(row =>
                (row as unknown[]).map(c => (c !== null && c !== undefined) ? String(c) : '')
            );
        }

        const merges = (sheet['!merges'] || []).map(m => ({
            s: { r: m.s.r, c: m.s.c }, e: { r: m.e.r, c: m.e.c }
        }));

        return { sheetName, rows, totalRows, totalCols, merges };
    });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/excelParser.preview.test.ts`
Expected: PASS（4 tests）。

补充第 5 条测试，锁住「!ref 膨胀时 totalCols 收敛」的行为（防回归）：

在 `excelParser.preview.test.ts` 追加：

```ts
    it('bounds totalCols when !ref is inflated far beyond real cells', () => {
        // 手工构造 3 列数据，却把 !ref 报成到 XFD（SheetJS 能产出这种膨胀 ref）
        const ws = XLSX.utils.aoa_to_sheet([['a', 'b', 'c'], ['d', 'e', 'f']]);
        ws['!ref'] = 'A1:XFD2';
        const wb: XLSX.WorkBook = { SheetNames: ['S'], Sheets: { S: ws } };

        const [p] = previewWorkbook(wb);
        // 收敛后应按真实单元格边界算，而不是 XFD（16384 列）
        expect(p.totalCols).toBeLessThan(100);
        expect(p.totalRows).toBe(2);
    });
```

- [ ] **Step 5: 回归既有预览相关测试与类型**

Run: `npm run test && npm run typecheck`
Expected: PASS。

> 若既有测试断言「预览行已补空到 totalCols」，按新契约更新该断言（保留真实行长），并在提交信息里注明。

- [ ] **Step 6: 提交**

```bash
git add src/utils/excelParser.ts src/utils/__tests__/excelParser.preview.test.ts
git commit -m "perf(memory): bound previewWorkbook materialization to preview window"
```

---

### Task 5: 复用预览 workbook，消除重复解析（P1-2）

**Files:**
- Modify: `src/components/ParameterWorkbench/FileManager.tsx`

**张力说明**（设计文档 §4 P1-2）：Task 2 已给 `fileCache` 定了「单次导入」生命周期；本任务把承载物从原始 `File` 换成**预览期间存活**的 `WorkBook`，沿用 Task 2 建立的清理时机——弹窗关闭即释放。

- [ ] **Step 1: 引入 pendingWorkbook 引用**

在 `FileManager.tsx` 的 state 区（`fileCache` 附近）加：

```tsx
/** 预览阶段已解析的 workbook，供确认导入时复用，避免二次解析（内存治理 P1-2）。
 *  生命周期与预览弹窗一致：openPreviewDialog 写入，弹窗关闭/导入完成时释放。 */
const pendingWorkbookRef = useRef<XLSX.WorkBook | null>(null);
```

并在文件顶部补 type import：`import type * as XLSX from 'xlsx';`（若已通过其他 import 引入则复用）。

- [ ] **Step 2: 预览时保存 workbook**

`openPreviewDialog`（`~:59`）改为：

```tsx
  const openPreviewDialog = async (file: File) => {
    const workbook = await readWorkbookAsync(file);
    // 全横向格式（参数为列、车型为行，如"产品准入导出"）：列角色配置无法表达，
    // 直接自动解析进入车型确认弹窗
    if (detectWorkbookOrientation(workbook) === 'horizontal') {
      pendingWorkbookRef.current = null;
      await importHorizontalDirectly(file);
      return;
    }
    pendingWorkbookRef.current = workbook; // 供 handlePreviewConfirm 复用
    const previews = previewWorkbook(workbook);
    setPendingFileName(file.name);
    setPreviewData(previews);
    if (previews.length > 1) {
      setSheetPickerData(previews.map(p => ({ name: p.sheetName, totalRows: p.totalRows })));
      setSheetPickerOpen(true);
    } else {
      setPreviewOpen(true);
    }
  };
```

- [ ] **Step 3: 确认时复用而非重解**

`handlePreviewConfirm`（`~:131`）改为：

```tsx
  const handlePreviewConfirm = async (configs: SheetParseConfig[]) => {
    const workbook = pendingWorkbookRef.current;
    if (workbook) {
      // 复用预览已解析的 workbook：不再对原文件重新 read + parse
      const data = parseWorkbookWithConfig(workbook, pendingFileName, configs);
      await showProductConfirm(data, pendingFileName);
    } else {
      // 兜底：引用已释放（异常路径）时退回原路径
      const cachedFile = fileCache.get(pendingFileName);
      if (!cachedFile) { message.error('文件缓存过期'); return; }
      const data = await parseWithConfigAsync(cachedFile, configs);
      await showProductConfirm(data, pendingFileName);
    }
    setPreviewOpen(false);
    pendingWorkbookRef.current = null;
    clearImportTransients({ setFileCache, setPreviewData, setDiffState });
  };
```

补 import：`import { parseWorkbookWithConfig } from '../../utils/excelParser';`

- [ ] **Step 4: 所有关闭路径释放引用**

在 Task 2 引入 `clearImportTransients` 的**同一批位置**（`ExcelPreviewDialog.onCancel`、`handleSheetPickerCancel`、`handleConfirmSave` 成功分支）各追加一行：

```tsx
pendingWorkbookRef.current = null;
```

建议把这三处统一收敛为一个局部函数，避免再次遗漏：

```tsx
  const releaseImportTransients = useCallback(() => {
    pendingWorkbookRef.current = null;
    clearImportTransients({ setFileCache, setPreviewData, setDiffState });
  }, []);
```

（需从 React 引入 `useCallback`；`FileManager.tsx` 顶部已 import `useRef`，一并补。）

- [ ] **Step 5: 验证**

Run: `npm run lint && npm run typecheck && npm run test`
Expected: PASS。

Run: `npm run build`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/components/ParameterWorkbench/FileManager.tsx
git commit -m "perf(memory): reuse preview workbook on confirm (single parse per import)"
```

---

### Task 6: 全量验证与方案状态收尾

- [ ] **Step 1: 跑四条验证命令**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```

Expected: 全部通过，无警告新增。

- [ ] **Step 2: 手工内存口径复测**

用生产构建（AGENTS.md：dev 模式性能放大百倍，性能测量必须用生产构建）：

```bash
npm run build && npm run preview -- --port 4173
```

打开资产页（519 资产），用 `ps -Ao pid,rss,comm` 记录 WebContent 进程 RSS；再导入 `~/Downloads/产品准入导出*.xlsx` 前后各记一次。把数值（改造前 vs 改造后）写入设计文档 §8 实施备注。

- [ ] **Step 3: 更新设计文档状态头**

把 `docs/plans/2026-10-08-runtime-memory-reduction-design.md` 的状态头由「设计定稿（实施未开始…）」改为「P0–P1 已实施」，并追加 §8 实施备注（含 §Step 2 的实测数值、以及 P1-1 实测收益是否与预期 ~3MB 量级一致）。

- [ ] **Step 4: 提交**

```bash
git add docs/plans/2026-10-08-runtime-memory-reduction-design.md
git commit -m "docs(memory): mark runtime memory reduction P0-P1 as implemented"
```

---

## Self-Review

**Spec coverage（对照设计文档）**

| 设计条目 | 覆盖任务 | 说明 |
|---|---|---|
| P0-1 状态泄漏清理（fileCache / previewData / diffState） | Task 2 | |
| P0-2 资产列表内存 | Task 1 | **实现方式已偏离初稿**：设计文档写的是「零依赖窗口化 + 抽 AssetCard」，但勘察发现默认视图是 `grouped`，且收起组仍全量挂载行（677 行）。故改为「按组条件挂载」——更小改动拿到同量级收益，无需窗口化基础设施。设计文档 §4 P0-2 需同步修订（见下）。 |
| P0-3 6 处扫描收敛 + 死代码清理 | Task 3 | |
| P1-1 previewWorkbook 有界化 | Task 4 | |
| P1-2 免二次解析（及与 P0-1 的张力定调） | Task 5（张力在 Task 2 已定生命周期） | |
| 验证口径（四条命令 + 生产构建手工口径） | Task 6 | |
| P2（worker IPC / 模块常驻 / 平铺视图窗口化）| 设计文档 §3 明确为非目标，不在本计划 | 平铺视图窗口化新列入 P2 |

**⚠ 与设计文档的偏差（已于 2026-10-08 回填完成）**：Task 1 的方案比设计文档初稿 §4 P0-2 更小、更聚焦。设计文档已同步修订：§4 P0-2 改写为「分组视图收起组条件挂载」、新增 §4 P0-2b 记录平铺视图窗口化转 P2、§2.4 补入实测证据（默认视图 `grouped`、收起为 CSS 揭示故行仍挂载、519 资产 / 158 组 / 均 3.3 行 = **677 行常驻**）、§3 非目标新增平铺视图窗口化、§7 分期表同步。两份文档现一致。

**Placeholder scan**：无 TBD/TODO；每个代码步骤均给出可执行代码。（初稿中「按行号逐字迁移 170 行 JSX」的步骤已随 Task 1 改写而移除。）

**Type consistency**：
- `clearImportTransients` 签名（Task 2）↔ Task 5 复用调用一致；Task 5 的 `releaseImportTransients` 封装了它，未改签名。
- Task 5 用到的 `parseWorkbookWithConfig` 是 `excelParser.ts` 既有导出（已确认存在，`excelParser.ts:646`）。
- Task 4 新增的 `PREVIEW_MAX_ROWS` 与 `getEffectiveSheetRange`（既有，`excelParser.ts:284`）同文件相邻，无命名冲突。
- Task 1 只改 `AssetGroupedView.tsx` 内部 JSX 结构，`GroupFileRow` 的 props 契约不变，`AssetFacetSections` 复用不受影响。

**已知风险提示**：
1. **Task 1 是唯一的视觉/交互变更**：去掉收起动画（用户已确认接受）；需人工过一遍展开/收起/右键/批量勾选。
2. **Task 1 的 `filtersActive` 语义**：`expanded = expandedKeys.has(...) || filtersActive`（`AssetGroupedView.tsx:283`）——筛选激活时所有命中组强制展开，条件挂载后这些组会真实挂载行。这是**预期的**（用户正在筛选，就该看到命中行），但会抵消部分内存收益；实测时须分别量「无筛选全收起」与「有筛选」两种状态。
3. Task 3 的缓存是**进程级单槽**（只记最后一次库路径 + 版本），多库切换会重扫——有意的简单取舍，避免无界缓存。
4. Task 4 不再按 `totalCols` 补空预览行，渲染层（`ExcelPreviewDialog`）需能容忍不等长行；已在 Step 5 要求回归 `npm run test`。若既有测试断言补空行为，按新契约更新断言。
