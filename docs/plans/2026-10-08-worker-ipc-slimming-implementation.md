# worker IPC 瘦身 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让完整 `XLSX.WorkBook` 永不跨 worker↔主线程边界——worker 内按 handle 持有，主线程只收 `SheetPreview` / `SheetData`；并把「只需行」的消费者改为收 AOA，去掉 Rust `read_workbook` 的单元格矩阵。

**Architecture:** 新增纯模块 `workbookHandles.ts`（LRU + 幂等释放，可单测），worker 与主线程 fallback 各持一个实例，共用同一套 handle 协议。`excelParserAsync` 暴露 `openWorkbookAsync` / `parseHandleAsync` / `releaseWorkbookHandle`。迁移 4 个消费者后删除 `readWorkbookAsync` / `readWorkbookFromBufferAsync`，避免留下仍会拖 32MB 的入口。设计依据见 `docs/plans/2026-10-08-worker-ipc-slimming-design.md`。

**Tech Stack:** Tauri 2 + React 19 + TypeScript + Vite 7 + antd 6 + Vitest（jsdom）；P2-4 触及 Rust（calamine / serde_json）。

**验证命令**（AGENTS.md）：`npm run lint`、`npm run typecheck`（**不跑裸 `tsc --noEmit`**）、`npm run test`、`npm run build`；P2-4 另跑 `cd src-tauri && cargo test`。

**范围裁定**：批准的是设计文档，§7 含 P2-4。P2-4 是**另一条传输通道**（Rust IPC，非 worker），收益与风险独立，且是最后一阶段——若想先停在 P2-3，直接不执行 Task 7 即可，前六阶段不回滚。

---

## File Structure

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/utils/workbookHandles.ts` | 纯逻辑：handle→workbook 的 LRU 存储、幂等释放、缺失查错 | Create |
| `src/utils/__tests__/workbookHandles.test.ts` | 上述模块单测（容量/驱逐/幂等/缺失） | Create |
| `src/utils/excelParserAsync.ts` | handle 协议 API + worker 消息 + 主线程 fallback | Modify |
| `src/workers/excelParser.worker.ts` | worker 侧 `openWorkbook`/`parseHandle`/`releaseHandle` 处理 | Modify |
| `src/utils/__tests__/excelParserAsync.handles.test.ts` | 协议端到端（jsdom 无 Worker → 走 fallback，同一套逻辑） | Create |
| `src/components/ParameterWorkbench/FileManager.tsx` | 改持 handle（主路径，收益核心） | Modify |
| `src/components/AssetLibrary/AssetUpgradeModal.tsx` | 改持 handle，消掉确认时重解析 | Modify |
| `src/components/ParameterWorkbench/MultiVehicleView.tsx` | 改收行（AOA） | Modify |
| `src/components/ParameterWorkbench/SmartFillView.tsx` | 改收行（AOA） | Modify |
| `src/components/AttributeDedup/AttributeDedup.tsx` | 改收表头对象（由解析侧用 SheetJS 转好） | Modify |
| `src-tauri/src/excel.rs` | `read_workbook` 改回 AOA | Modify |
| `src/components/SmartFiller/EnumImportModal.tsx` | 改用 AOA 行 | Modify |

> **原稿的 `rowsToHeaderObjects.ts` + 其测试已作废**：实测发现 SheetJS 的表头命名语义（空表头 `""`/重复 `_1`/超宽列 `__EMPTY`/`null` 键省略/全空行保留）手写复刻风险高。改为**在解析侧直接调 SheetJS 转换**，只把终态对象送回（0.54MB vs 21.37MB workbook）。详见 Task 6 的「设计修正」。

**顺序原则**：先落纯模块与协议（Task 1–2，可独立单测），再迁主路径（Task 3），再迁外围（Task 4–5），最后删旧入口与 Rust（Task 6–7）。`readWorkbook*` 保留到 Task 6 才删——保证中途任何阶段可退。

---

### Task 1: `workbookHandles` 纯模块

**Files:**
- Create: `src/utils/workbookHandles.ts`
- Test: `src/utils/__tests__/workbookHandles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/workbookHandles.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WorkbookHandleStore } from '../workbookHandles';
import type * as XLSX from 'xlsx';

/** workbook 只当不透明载荷用，这里用最小桩对象 */
const wb = (tag: string) => ({ SheetNames: [tag], Sheets: {} } as unknown as XLSX.WorkBook);

describe('WorkbookHandleStore', () => {
    it('opens and reads back a handle', () => {
        const s = new WorkbookHandleStore(3);
        const id = s.open(wb('a'), 'a.xlsx');
        expect(s.get(id)?.fileName).toBe('a.xlsx');
        expect(s.size).toBe(1);
    });

    it('evicts the least-recently-used entry beyond capacity', () => {
        const s = new WorkbookHandleStore(3);
        const a = s.open(wb('a'), 'a.xlsx');
        const b = s.open(wb('b'), 'b.xlsx');
        const c = s.open(wb('c'), 'c.xlsx');
        // 触碰 a，使其成为最近使用；此时 b 是最久未用
        expect(s.get(a)).toBeDefined();
        const d = s.open(wb('d'), 'd.xlsx');
        expect(s.size).toBe(3);
        expect(s.get(a)).toBeDefined(); // 被触碰过，保留
        expect(s.get(b)).toBeUndefined(); // LRU 被驱逐
        expect(s.get(c)).toBeDefined();
        expect(s.get(d)).toBeDefined();
    });

    it('release is idempotent (double release / unknown id do not throw)', () => {
        const s = new WorkbookHandleStore(3);
        const id = s.open(wb('a'), 'a.xlsx');
        expect(s.release(id)).toBe(true);
        expect(s.release(id)).toBe(false);
        expect(s.release(9999)).toBe(false);
        expect(s.size).toBe(0);
    });

    it('get on an unknown id returns undefined rather than throwing', () => {
        const s = new WorkbookHandleStore(3);
        expect(s.get(1234)).toBeUndefined();
    });

    it('hands out distinct ids for repeated opens of the same file', () => {
        const s = new WorkbookHandleStore(3);
        const first = s.open(wb('a'), 'a.xlsx');
        const second = s.open(wb('a'), 'a.xlsx');
        expect(first).not.toBe(second);
        expect(s.size).toBe(2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/workbookHandles.test.ts`
Expected: FAIL — `Failed to resolve import "../workbookHandles"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/workbookHandles.ts`:

```ts
import type * as XLSX from 'xlsx';

/**
 * workbook handle 存储（内存治理 P2）。
 *
 * 背景：完整 WorkBook 跨 worker→主线程结构化克隆实测 32.2MB（478×504 / 240912 单元格），
 * 而消费者真正需要的 SheetData 是 21.6MB、AOA 只要 2.0MB。本模块让 workbook 留在
 * 解析侧（worker 或主线程 fallback），主线程只拿一个 id。
 *
 * LRU 上限是**安全网**：调用方（组件卸载/弹窗关闭）本应显式 release，
 * 上限保证漏放时内存有界，而不是无声增长。
 */
export interface WorkbookHandleEntry {
    workbook: XLSX.WorkBook;
    fileName: string;
}

export class WorkbookHandleStore {
    private readonly entries = new Map<number, WorkbookHandleEntry>();
    private readonly capacity: number;
    private nextId = 1;

    // 注意：tsconfig.app.json 开了 erasableSyntaxOnly，禁止构造器参数属性
    // （constructor(private readonly capacity = 3) 会报 TS1294），必须显式声明字段。
    constructor(capacity = 3) {
        this.capacity = capacity;
    }

    /** 存入并返回 handle id；超出容量时驱逐最久未用的一项 */
    open(workbook: XLSX.WorkBook, fileName: string): number {
        const id = this.nextId++;
        this.entries.set(id, { workbook, fileName });
        this.evict();
        return id;
    }

    /** 读取并标记为最近使用；不存在返回 undefined */
    get(id: number): WorkbookHandleEntry | undefined {
        const entry = this.entries.get(id);
        if (!entry) return undefined;
        // Map 保持插入序：重插以刷新 LRU 位置
        this.entries.delete(id);
        this.entries.set(id, entry);
        return entry;
    }

    /** 释放；返回是否确实释放了（重复释放/未知 id → false，不抛错） */
    release(id: number): boolean {
        return this.entries.delete(id);
    }

    get size(): number {
        return this.entries.size;
    }

    private evict(): void {
        while (this.entries.size > this.capacity) {
            const oldest = this.entries.keys().next().value as number | undefined;
            if (oldest === undefined) return;
            this.entries.delete(oldest);
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/workbookHandles.test.ts`
Expected: PASS（5 tests）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/workbookHandles.ts src/utils/__tests__/workbookHandles.test.ts
git commit -m "feat(memory): add WorkbookHandleStore (LRU handle store for workbooks)"
```

---

### Task 2: handle 协议接入 `excelParserAsync`

**Files:**
- Modify: `src/utils/excelParserAsync.ts`
- Test: `src/utils/__tests__/excelParserAsync.handles.test.ts`

**说明**：jsdom 不实现 `Worker`，`new Worker(...)` 抛错 → 既有代码置 `_workerFailed = true` 并走主线程 fallback。fallback 与 worker 共用 `WorkbookHandleStore`，因此**协议逻辑在 jsdom 下真实可测**（测的就是 fallback 分支）。

- [ ] **Step 1: Write the failing test**

Create `src/utils/__tests__/excelParserAsync.handles.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

// 构造一个真实 workbook（走 XLSX.read，避免手搓单元格格式）
const makeFile = (aoa: unknown[][], name = 't.xlsx'): File => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb: XLSX.WorkBook = { SheetNames: ['S1'], Sheets: { S1: ws } };
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return new File([buf], name);
};

import {
    openWorkbookAsync,
    parseHandleAsync,
    releaseWorkbookHandle,
} from '../excelParserAsync';

describe('workbook handle protocol (main-thread fallback path)', () => {
    afterEach(() => vi.restoreAllMocks());

    it('opens a workbook and returns orientation + previews without the workbook', async () => {
        const info = await openWorkbookAsync(makeFile([['参数名', '值'], ['整备质量', '1000']]));
        expect(info.handleId).toBeGreaterThan(0);
        expect(info.fileName).toBe('t.xlsx');
        expect(info.sheetNames).toEqual(['S1']);
        expect(info.orientation).toBe('vertical');
        expect(info.previews.length).toBe(1);
        expect(info.previews[0].totalRows).toBe(2);
        // 返回值里绝不能带 workbook 字段
        expect(Object.keys(info)).not.toContain('workbook');
        releaseWorkbookHandle(info.handleId);
    });

    it('parses by handle (no configs → parseWorkbook)', async () => {
        const info = await openWorkbookAsync(makeFile([['参数名', '值'], ['整备质量', '1000']]));
        const data = await parseHandleAsync(info.handleId);
        expect(data.fileName).toBe('t.xlsx');
        expect(data.data.length).toBeGreaterThan(0);
        releaseWorkbookHandle(info.handleId);
    });

    it('rejects when the handle was already released', async () => {
        const info = await openWorkbookAsync(makeFile([['参数名', '值'], ['整备质量', '1000']]));
        releaseWorkbookHandle(info.handleId);
        await expect(parseHandleAsync(info.handleId)).rejects.toThrow(/handle/i);
    });

    it('releaseWorkbookHandle is safe to call twice / with unknown id', () => {
        expect(() => releaseWorkbookHandle(999999)).not.toThrow();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/excelParserAsync.handles.test.ts`
Expected: FAIL — `openWorkbookAsync is not a function`.

- [ ] **Step 3: Implement the protocol**

Modify `src/utils/excelParserAsync.ts`. Add imports and the new API:

```ts
import { detectWorkbookOrientation, previewWorkbook, parseWorkbook, parseWorkbookWithConfig } from './excelParser';
import type { SheetData, SheetParseConfig, SheetPreview } from '../types';
import type { WorkbookOrientation } from './excelParser';
import { WorkbookHandleStore } from './workbookHandles';
```

（`parseWorkbook, parseWorkbookWithConfig` 已 import，合并去重即可。）

在文件下方新增（`readWorkbookSync` 附近）：

```ts
/** 主线程 fallback 时的 handle 存储（worker 可用时不用它） */
const _fallbackStore = new WorkbookHandleStore(3);

/**
 * openWorkbook 的返回值：主线程需要的全部信息，**不含 workbook**。
 * workbook 留在解析侧（worker 或 fallback store），主线程通过 handleId 引用。
 */
export interface WorkbookHandleInfo {
    handleId: number;
    fileName: string;
    sheetNames: string[];
    orientation: WorkbookOrientation;
    /** 已按 P1-1 有界化（≤100 行） */
    previews: SheetPreview[];
}

const openWorkbookSync = (buffer: ArrayBuffer, fileName: string): WorkbookHandleInfo => {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    const handleId = _fallbackStore.open(workbook, fileName);
    return {
        handleId,
        fileName,
        sheetNames: workbook.SheetNames,
        orientation: detectWorkbookOrientation(workbook),
        previews: previewWorkbook(workbook),
    };
};

const parseHandleSync = (handleId: number, configs?: SheetParseConfig[]): SheetData => {
    const entry = _fallbackStore.get(handleId);
    if (!entry) throw new Error(`workbook handle 不存在或已释放：${handleId}`);
    return configs
        ? parseWorkbookWithConfig(entry.workbook, entry.fileName, configs)
        : parseWorkbook(entry.workbook, entry.fileName);
};
```

导出 API（worker 不可用时走上面的 sync 版本）：

```ts
/**
 * 一次解析：worker 内 `XLSX.read` 后**留在 worker 内**缓存，只回方向判定 + 预览 + handle。
 * 这是 P2 的核心——完整 workbook 不再跨线程克隆（实测省 32.2MB/次）。
 */
export const openWorkbookAsync = async (file: File): Promise<WorkbookHandleInfo> => {
    const buffer = await file.arrayBuffer();
    const worker = getWorker();
    if (!worker) return openWorkbookSync(buffer, file.name);
    return postHandleTask<WorkbookHandleInfo>(
        { type: 'openWorkbook' as const, buffer, fileName: file.name },
        buffer,
        () => openWorkbookSync(buffer, file.name)
    );
};

/** 用 handle 在解析侧解析；configs 缺省 → parseWorkbook */
export const parseHandleAsync = async (
    handleId: number,
    configs?: SheetParseConfig[]
): Promise<SheetData> => {
    const worker = getWorker();
    if (!worker) return parseHandleSync(handleId, configs);
    return postHandleTask<SheetData>(
        { type: 'parseHandle' as const, handleId, configs },
        undefined,
        () => parseHandleSync(handleId, configs)
    );
};

/** 释放解析侧的 workbook 缓存；幂等，未知 id 不抛错 */
export const releaseWorkbookHandle = (handleId: number): void => {
    const worker = getWorker();
    if (!worker) {
        _fallbackStore.release(handleId);
        return;
    }
    // fire-and-forget：释放不阻塞调用方，失败也不影响正确性（worker 内有 LRU 兜底）
    try {
        worker.postMessage({ type: 'releaseHandle' as const, handleId });
    } catch {
        _fallbackStore.release(handleId);
    }
};
```

`postHandleTask` 是 `postTask` 的泛化版——`postTask` 目前把 `buffer` 作为 transferable 且**必传**，而 `parseHandle`/`releaseHandle` 没有 buffer。抽一个内部函数：

```ts
/** postTask 的泛化版：buffer 可选；transfer 列表按需构造 */
const postHandleTask = <R, M extends { type: string }>(
    msg: M,
    buffer: ArrayBuffer | undefined,
    fallback: () => R
): Promise<R> => {
    const worker = getWorker();
    if (!worker) {
        return new Promise((resolve, reject) => {
            try { resolve(fallback()); } catch (err) { reject(err instanceof Error ? err : new Error(String(err))); }
        });
    }
    return new Promise((resolve, reject) => {
        const id = ++_pendingId;
        _pending.set(id, { resolve: resolve as (v: SheetData) => void, reject });
        try {
            if (buffer) worker.postMessage({ id, ...msg, buffer }, [buffer]);
            else worker.postMessage({ id, ...msg });
        } catch {
            _pending.delete(id);
            try { resolve(fallback()); } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
        }
    });
};
```

并把 `_pending` 的 resolve 类型从 `(v: SheetData) => void` 放宽为 `(v: unknown) => void`（handle 协议返回 `WorkbookHandleInfo`，不再是 `SheetData`）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/excelParserAsync.handles.test.ts`
Expected: PASS（4 tests）。

- [ ] **Step 5: 手工确认既有 API 未被破坏**

Run: `npm run typecheck && npm run test`
Expected: PASS（`parseExcelAsync` / `parseWithConfigAsync` / `readWorkbook*` 行为不变，既有测试全绿）。

- [ ] **Step 6: Commit**

```bash
git add src/utils/excelParserAsync.ts src/utils/__tests__/excelParserAsync.handles.test.ts
git commit -m "feat(memory): workbook handle protocol (openWorkbook/parseHandle/release)"
```

---

### Task 3: worker 侧实现三类消息

**Files:**
- Modify: `src/workers/excelParser.worker.ts`
- Modify: `src/utils/excelParserAsync.ts`（Step 0 的两个收口）

**说明**：改完必须**跑一次真实应用**才能确认 worker 分支（jsdom 走不到）。见 Step 3。

**Task 2 评审提出的三项改进，在本任务一并落地**（否则会留下重复实现）：

- [ ] **Step 0a: 消除 `postTask` / `postHandleTask` 的重复**

两者除「buffer 是否可选」外逐行相同，且 P2-3 还会再加两个 `postHandleTask` 调用方——泛化版正在变成主路径。把 `postTask` 的签名改为 `buffer?: ArrayBuffer`，让现有三个调用方（`parseExcelAsync`、`parseWithConfigAsync`、`readWorkbookFromBufferAsync`）原样传 buffer，然后**删除 `postHandleTask`**，全部改调 `postTask`。
验证：`npm run typecheck && npm run test` 全绿（既有 5 个 API 行为不变）。

- [ ] **Step 0b: 抽出共享的 `buildWorkbookHandleInfo`**

`openWorkbookSync`（`excelParserAsync.ts`）与 worker 侧要构造**同一个**对象字面量，而 `previews` 的「≤100 行」保证必须两边都成立——两份拷贝必然漂移。抽成共享纯函数，放在 `src/utils/excelParser.ts`（它已导出 `detectWorkbookOrientation` / `previewWorkbook`，是自然归属）：

```ts
/** 构造 handle 信息的唯一实现：主线程 fallback 与 worker 共用，避免两份拷贝漂移 */
export const buildWorkbookHandleInfo = (
    workbook: XLSX.WorkBook,
    handleId: number,
    fileName: string
): WorkbookHandleInfo => ({
    handleId,
    fileName,
    sheetNames: workbook.SheetNames,
    orientation: detectWorkbookOrientation(workbook),
    previews: previewWorkbook(workbook),
});
```

（`WorkbookHandleInfo` 从 `./workbookHandles` type-only import。）`openWorkbookSync` 与 worker 的 `openWorkbook` case 都改调它。

- [ ] **Step 0c: 补一条「worker 路径干净拒绝」的测试**

Task 2 实测确认：worker 未实现新消息类型时，worker 的 catch 会回 `{id, success:false}`（含原 id），主线程据此 **reject**（错误信息 `Unknown worker request type: openWorkbook`），**不会挂起**。这条现在无人守护，Task 3 落地后更会失效。补一条用假 Worker 的测试锁住「主线程一定能收到 settled 结果（reject 或 resolve），不得挂起」——这是整个协议最关键的不变量。

- [ ] **Step 1: 扩展 worker**

`src/workers/excelParser.worker.ts`：

```ts
import * as XLSX from 'xlsx';
import { parseWorkbook, parseWorkbookWithConfig, previewWorkbook, detectWorkbookOrientation } from '../utils/excelParser';
import { WorkbookHandleStore } from '../utils/workbookHandles';
import type { SheetParseConfig } from '../types';

/** worker 内持有多份 workbook（上限 3，LRU 兜底漏放） */
const handles = new WorkbookHandleStore(3);

type WorkerRequest =
  | { id: number; type: 'parse'; buffer: ArrayBuffer; fileName: string }
  | { id: number; type: 'parseWithConfig'; buffer: ArrayBuffer; fileName: string; configs: SheetParseConfig[] }
  | { id: number; type: 'readWorkbook'; buffer: ArrayBuffer }
  | { id: number; type: 'openWorkbook'; buffer: ArrayBuffer; fileName: string }
  | { id: number; type: 'parseHandle'; handleId: number; configs?: SheetParseConfig[] }
  | { id: number; type: 'releaseHandle'; handleId: number };
```

在 `switch` 中新增三个 case（`releaseHandle` **必须**在 `XLSX.read` 之前返回，不能落入现有流程）：

```ts
self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type } = e.data;

  // releaseHandle 不需要解析，且没有 buffer
  if (type === 'releaseHandle') {
    handles.release(e.data.handleId);
    self.postMessage({ id, success: true, data: null } satisfies WorkerResponse);
    return;
  }

  try {
    if (type === 'parseHandle') {
      const entry = handles.get(e.data.handleId);
      if (!entry) throw new Error(`workbook handle 不存在或已释放：${e.data.handleId}`);
      const result = e.data.configs
        ? parseWorkbookWithConfig(entry.workbook, entry.fileName, e.data.configs)
        : parseWorkbook(entry.workbook, entry.fileName);
      self.postMessage({ id, success: true, data: result } satisfies WorkerResponse);
      return;
    }

    const { buffer } = e.data;
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    let result: unknown;

    switch (type) {
      case 'parse':
        result = parseWorkbook(workbook, e.data.fileName);
        break;
      case 'parseWithConfig':
        result = parseWorkbookWithConfig(workbook, e.data.fileName, e.data.configs);
        break;
      case 'readWorkbook':
        result = workbook;
        break;
      case 'openWorkbook': {
        // workbook 留在 worker 内：主线程只拿 id + 它真正需要的产物。
        // 复用共享构造函数（Step 0b），不要内联对象字面量——两份拷贝会漂移。
        const handleId = handles.open(workbook, e.data.fileName);
        result = buildWorkbookHandleInfo(workbook, handleId, e.data.fileName);
        break;
      }
      default:
        throw new Error(`Unknown worker request type: ${(e.data as { type: string }).type}`);
    }

    self.postMessage({ id, success: true, data: result } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({ id, success: false, error: (err as Error).message } satisfies WorkerResponse);
  }
};
```

补 `import type { WorkbookHandleInfo } from '../utils/excelParserAsync';`（类型只在 worker 内使用；若造成循环依赖警告，改为本地声明同形 interface 并在两处加注释说明必须同步）。

> **循环依赖注意**：`excelParserAsync` 会 import worker 的 URL，worker 若 import `excelParserAsync` 的类型形成环。**优先做法**：把 `WorkbookHandleInfo` 定义在 `src/utils/workbookHandles.ts`（双方都依赖的叶子模块），两边从那里 import。Step 1 的 `handles.open` 返回值直接构造成该类型。

- [ ] **Step 2: 类型与构建验证**

Run: `npm run typecheck && npm run build`
Expected: PASS。`npm run build` 会真正打包 worker，能暴露 worker 内的 import/类型问题（jsdom 测试覆盖不到）。

- [ ] **Step 3: 真机确认 worker 分支（人工）**

Run: `npm run dev`（或 `npm run build && npm run preview`）
打开资产页 → 导入一个 `.xlsx`：
- 预览弹窗正常出现（说明 worker 的 `openWorkbook` 分支跑通，因为浏览器/Tauri 下 `Worker` 可用）；
- 确认导入后车型确认弹窗正常列出车型（说明 `parseHandle` 跑通）；
- DevTools Console 无 `workbook handle 不存在或已释放`。

**若本环境无法跑 GUI**：明确记为未验证（同 P0–P1 的 Task 6 Step 2 缺口），不要勾选此项冒充完成。

- [ ] **Step 4: Commit**

```bash
git add src/workers/excelParser.worker.ts src/utils/workbookHandles.ts
git commit -m "feat(memory): worker-side workbook handle handling"
```

---

### Task 4: 迁移 `FileManager`（主路径）

**Files:**
- Modify: `src/components/ParameterWorkbench/FileManager.tsx`

**说明**：这是收益核心——`FileManager` 是 32MB 克隆的来源。

- [ ] **Step 1: 换 import 与 ref**

```tsx
// 原：import { previewWorkbook, detectWorkbookOrientation, parseWorkbook, parseWorkbookWithConfig } from '../../utils/excelParser';
// 原：import { parseWithConfigAsync, readWorkbookAsync } from '../../utils/excelParserAsync';
import { parseWithConfigAsync } from '../../utils/excelParserAsync';
import { openWorkbookAsync, parseHandleAsync, releaseWorkbookHandle } from '../../utils/excelParserAsync';
```

移除 `import type * as XLSX from 'xlsx';`（不再直接持 workbook；若 lint 报未使用则删）。

`pendingWorkbookRef` 改为：

```tsx
  /** 预览阶段解析出的 workbook 留在解析侧；主线程只持 handle（内存治理 P2）。
   *  生命周期 = 一次预览会话：openPreviewDialog 写入，releaseImportTransients 释放。 */
  const pendingHandleIdRef = useRef<number | null>(null);
```

- [ ] **Step 2: `openPreviewDialog` 改用 handle**

```tsx
  const openPreviewDialog = async (file: File) => {
    const info = await openWorkbookAsync(file);
    // 全横向格式（参数为列、车型为行，如"产品准入导出"）：列角色配置无法表达，
    // 直接自动解析进入车型确认弹窗
    if (info.orientation === 'horizontal') {
      pendingHandleIdRef.current = null;
      await importHorizontalDirectly(file.name, info.handleId);
      return;
    }
    pendingHandleIdRef.current = info.handleId; // 供 handlePreviewConfirm 复用
    setPendingFileName(info.fileName);
    setPreviewData(info.previews);
    if (info.previews.length > 1) {
      setSheetPickerData(info.previews.map(p => ({ name: p.sheetName, totalRows: p.totalRows })));
      setSheetPickerOpen(true);
    } else {
      setPreviewOpen(true);
    }
  };
```

- [ ] **Step 3: 横向路径改用 handle（并保证释放）**

```tsx
  const importHorizontalDirectly = async (fileName: string, handleId: number) => {
    try {
      // 用 handle 在解析侧解析：不重读文件、也不把 workbook 送到主线程
      const data = await parseHandleAsync(handleId);
      const productCount = new Set(data.data.map(p => p.productName)).size;
      message.info(`检测到横向格式（参数为列、车型为行），已解析出 ${productCount} 个车型`);
      await showProductConfirm(data, fileName);
    } catch (err) {
      message.error('解析失败：' + (err instanceof Error ? err.message : String(err)));
    } finally {
      // 横向路径同步消费完，立即释放（不残留到确认阶段）
      releaseWorkbookHandle(handleId);
    }
  };
```

- [ ] **Step 4: `handlePreviewConfirm` 改用 handle**

```tsx
  const handlePreviewConfirm = async (configs: SheetParseConfig[]) => {
    try {
      const handleId = pendingHandleIdRef.current;
      if (handleId !== null) {
        // 在解析侧用缓存的 workbook 解析：不重读文件、workbook 不过线程边界
        const data = await parseHandleAsync(handleId, configs);
        await showProductConfirm(data, pendingFileName);
      } else {
        // 兜底：handle 已释放（异常路径）时退回原路径
        const cachedFile = fileCache.get(pendingFileName);
        if (!cachedFile) { message.error('文件缓存过期'); return; }
        const data = await parseWithConfigAsync(cachedFile, configs);
        await showProductConfirm(data, pendingFileName);
      }
    } catch (err) {
      // 解析侧会抛用户可读错误（如「按当前配置未提取到任何参数数据」）；
      // 必须在此捕获，否则 onConfirm 未被 await 会让它变成无人处理的 rejection。
      message.error('解析失败：' + (err instanceof Error ? err.message : String(err)));
      return;
    }
    setPreviewOpen(false);
    releaseImportTransients();
  };
```

- [ ] **Step 5: `releaseImportTransients` 释放 handle**

```tsx
  /** 释放导入过程态（fileCache/previewData/diffState/解析侧 workbook handle）。
   *  预览/确认/选择器的关闭与取消路径统一走它。 */
  const releaseImportTransients = useCallback(() => {
    if (pendingHandleIdRef.current !== null) {
      releaseWorkbookHandle(pendingHandleIdRef.current);
      pendingHandleIdRef.current = null;
    }
    clearImportTransients({ setFileCache, setPreviewData, setDiffState });
  }, []);
```

**验证所有释放路径都覆盖**：`ExcelPreviewDialog.onCancel`、`handleSheetPickerCancel`、`handleConfirmModalCancel`、`handleConfirmSave` 成功分支、`handlePreviewConfirm` 都应调用 `releaseImportTransients()`（P0–P1 已接好，本步只是让它顺带释放 handle）。用 grep 确认 `releaseImportTransients` 调用点 ≥ 5 处。

- [ ] **Step 6: 验证**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/components/ParameterWorkbench/FileManager.tsx
git commit -m "perf(memory): FileManager holds workbook handle instead of the workbook"
```

---

### Task 5: 迁移 `AssetUpgradeModal`

**Files:**
- Modify: `src/components/AssetLibrary/AssetUpgradeModal.tsx`

- [ ] **Step 1: 换 import 与 ref**

`pendingFileRef: useRef<File | null>` → `pendingHandleIdRef: useRef<number | null>(null)`。
import：`readWorkbookAsync` + `parseWithConfigAsync` → `openWorkbookAsync` + `parseHandleAsync` + `releaseWorkbookHandle`（`parseExcelAsync` 若仍用于自动导入则保留）。

- [ ] **Step 2: `openPreviewDialog` 改用 handle**

原 `readWorkbookAsync(file)` + `previewWorkbook(workbook)` + `pendingFileRef.current = file` 改为：

```tsx
            const info = await openWorkbookAsync(file);
            setPendingFileName(info.fileName);
            pendingHandleIdRef.current = info.handleId;
            setPreviewData(info.previews);
            setPreviewOpen(true);
```

- [ ] **Step 3: 确认时用 handle 解析（消掉原来的整份重解析）**

原 `parseWithConfigAsync(file, configs)` 改为：

```tsx
            const parsed = await parseHandleAsync(handleId, configs);
```

并在该路径结束后 `releaseWorkbookHandle(handleId); pendingHandleIdRef.current = null;`（弹窗关闭/成功都要释放，参照该文件既有的 `pendingFileRef.current = null` 位置）。

- [ ] **Step 4: 验证与提交**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`
Expected: PASS。

```bash
git add src/components/AssetLibrary/AssetUpgradeModal.tsx
git commit -m "perf(memory): AssetUpgradeModal uses workbook handle (drops re-parse)"
```

---

### Task 6: 在解析侧直接产出终态载荷 + 迁移「只需行」消费者 + 删旧入口

**设计修正（实施前实测发现，比原稿更好）**

原稿打算：worker 回 AOA 行，主线程用自写的 `rowsToHeaderObjects` 复刻 SheetJS 的表头命名。**实测否决**——SheetJS 默认 `sheet_to_json` 的语义比预想复杂且必须逐字一致：

| 情形 | 实测行为 |
|---|---|
| 空表头 | 键名为 `""`；**重复空表头**为 `""`、`"_1"` |
| 重复表头 | `k`、`k_1`、`k_2` |
| 行超出表头宽度 | 多余列命名为 `__EMPTY`、`__EMPTY_1` |
| 单元格为 `null` | **该键整体不出现在对象里**（不是空串） |
| 全空行 | **保留**（不跳过） |
| 表头行为空 | 返回 `[]` |

手写复刻极易静默改结果。**更好的做法：worker 里用 SheetJS 自己转换**——workbook 本就在解析侧，让 `sheet_to_json` 在那里跑，只把结果送回来。零复刻、零风险，而且载荷更小：

| 载荷 | 大小（111,936 单元格的枚举文件） |
|---|---|
| workbook 克隆（现状） | 21.37 MB |
| AOA 行 | 1.72 MB |
| **终态对象数组**（worker 内转好） | **0.54 MB** |

**Files:**
- Modify: `src/utils/excelParserAsync.ts`、`src/workers/excelParser.worker.ts`、`src/utils/excelParser.ts`
- Modify: `src/components/ParameterWorkbench/MultiVehicleView.tsx`、`SmartFillView.tsx`、`src/components/AttributeDedup/AttributeDedup.tsx`
- （**不需要**新建 `rowsToHeaderObjects.ts`——原稿的该文件与测试作废）

- [ ] **Step 1: 在 `excelParser.ts` 里加两个共享纯函数（worker 与 fallback 共用）**

```ts
/** 首 sheet 的二维数组（header:1），不给调用方 workbook */
export const firstSheetRows = (workbook: XLSX.WorkBook): unknown[][] => {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
};

/** 首 sheet 的表头对象数组——直接委托 SheetJS，语义由库保证（勿手写复刻） */
export const firstSheetHeaderObjects = (workbook: XLSX.WorkBook): Record<string, unknown>[] => {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
};
```

- [ ] **Step 2: `excelParserAsync.ts` 新增两个 AOA/对象接口**

```ts
export interface SheetRowsResult {
    sheetName: string;
    /** header:1 的二维数组 */
    rows: unknown[][];
}

export interface SheetObjectsResult {
    sheetName: string;
    /** SheetJS 默认语义的表头对象数组（含空表头/重复去重/__EMPTY 规则） */
    objects: Record<string, unknown>[];
}

const firstSheetRowsSync = (buffer: ArrayBuffer): SheetRowsResult => {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    return { sheetName: workbook.SheetNames[0], rows: firstSheetRows(workbook) };
};

const firstSheetObjectsSync = (buffer: ArrayBuffer): SheetObjectsResult => {
    const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    return { sheetName: workbook.SheetNames[0], objects: firstSheetHeaderObjects(workbook) };
};

export const readFirstSheetRowsAsync = async (buffer: ArrayBuffer): Promise<SheetRowsResult> =>
    postHandleTask({ type: 'readFirstSheetRows' as const, buffer }, buffer, () => firstSheetRowsSync(buffer));

export const readFirstSheetObjectsAsync = async (buffer: ArrayBuffer): Promise<SheetObjectsResult> =>
    postHandleTask({ type: 'readFirstSheetObjects' as const, buffer }, buffer, () => firstSheetObjectsSync(buffer));
```

- [ ] **Step 3: worker 加两个对应 case**

`case 'readFirstSheetRows'` / `case 'readFirstSheetObjects'` → 复用 `excelParser.ts` 的同名函数（**不要在 worker 里重写**，保证与 fallback 完全一致）。

- [ ] **Step 4: 迁移三个消费者**

- `MultiVehicleView.tsx:363-365`、`SmartFillView.tsx:213-215`：`readFirstSheetRowsAsync(buffer)`，用 `rows`；原 `rows.length < 2` 判空保持不变（`rows` 含表头行，语义与原 `rows` 一致）。删各自的 `import * as XLSX from 'xlsx'`（若无其他用途）。
- `AttributeDedup.tsx:43-46`：`readFirstSheetObjectsAsync(buffer)`，用 `objects` 替代原来的 `jsonData`（`XLSX.utils.sheet_to_json(sheet)` 的输出）——**语义完全一致，因为它就是同一个函数的输出**。删 `import * as XLSX`。
  注意：原代码有 `if (!jsonData.length)` 判空 → 改为 `if (!objects.length)`。

- [ ] **Step 5: 删除旧入口**

确认无调用方后删除 `readWorkbookAsync`、`readWorkbookFromBufferAsync`、`readWorkbookSync`：

Run: `grep -rn "readWorkbookAsync\|readWorkbookFromBufferAsync" src/` → 期望无输出。

- [ ] **Step 6: 验证与提交**

Run: `npm run lint && npm run typecheck && npm run test && npm run build`
Expected: PASS。

```bash
git add src/utils/excelParser.ts src/utils/excelParserAsync.ts src/workers/excelParser.worker.ts \
        src/components/ParameterWorkbench/MultiVehicleView.tsx \
        src/components/ParameterWorkbench/SmartFillView.tsx \
        src/components/AttributeDedup/AttributeDedup.tsx
git commit -m "perf(memory): row-only consumers get rows/objects from the parse side"
```

---


### Task 7: Rust `read_workbook` 改回 AOA + 迁移 `EnumImportModal`

> 本阶段独立可退（另一条传输通道）。若本轮只到 Task 6，跳过即可。

**Files:**
- Modify: `src-tauri/src/excel.rs`、`src/components/SmartFiller/EnumImportModal.tsx`

- [ ] **Step 1: Rust 侧改为 AOA**

`read_workbook_blocking` 返回 `{ sheetNames: [..], sheets: { [name]: { rows: [[Value]], totalRows, totalCols } } }`。要点：
- 用 `range.rows()` 逐行 `map` 出 `Vec<Value>`，**保留 `CellData::Empty` 为 `Value::Null`**（`rows()` 按 `width()` 分块，行天然等宽——空单元格必须补位，否则列错位）；
- 删掉 `column_name()` 与逐格 A1 字符串构造、以及 `"!ref"` 的构造（AOA 下不需要）；`column_name` 若无其他调用方一并删除；
- `cell_to_json` 改为不返回 `Option`（空单元格 → `Value::Null`），或保留但把 `Empty` 映射为 `Null`。

在 `src-tauri/src/excel.rs` 末尾加 Rust 单测覆盖：含空单元格的行**列不错位**、行宽 == `totalCols`。

- [ ] **Step 2: Rust 验证**

Run: `cd src-tauri && cargo test`
Expected: PASS。

- [ ] **Step 3: 迁移 `EnumImportModal`**

`readWorkbookFromPathAsync` 改为返回 AOA 结构（改 `excelParserAsync.ts` 里的包装与返回类型，或新增 `readSheetRowsFromPathAsync`）。`EnumImportModal` 中 `decode_cell` / `encode_cell` / `sheet[addr]` 那整套手工还原行列网格的代码删除，改为：表头 = `rows[0]`，单元格 = `rows[r][c]`，取值 `v == null ? '' : String(v)`。

**等价性**：原实现 `cell ? String(cell.v ?? '') : ''`，与 AOA 下空 → `''` 一致；`!ref` 收敛逻辑（`minCol/maxCol/minRow/maxRow` 扫描）不再需要——`rows` 已对齐。

- [ ] **Step 4: 验证与提交**

Run: `npm run lint && npm run typecheck && npm run test && npm run build && (cd src-tauri && cargo test)`
Expected: 全部 PASS。

```bash
git add src-tauri/src/excel.rs src/utils/excelParserAsync.ts src/components/SmartFiller/EnumImportModal.tsx
git commit -m "perf(memory): Rust read_workbook returns AOA; EnumImportModal uses rows"
```

---

### Task 8: 全量验证与收尾

- [ ] **Step 1: 四条验证 + Rust**

```bash
npm run lint && npm run typecheck && npm run test && npm run build && (cd src-tauri && cargo test)
```

Expected: 全部通过，无新增 warning。

- [ ] **Step 2: 全局搜索确认无遗留**

```bash
grep -rn "readWorkbookAsync\|readWorkbookFromBufferAsync\|readWorkbookFromPathAsync" src/ || echo "已全部移除"
grep -rn "_fallbackStore\|WorkbookHandleStore" src/ | head
```

Expected：旧入口无残留；handle 存储只在 `workbookHandles.ts` 定义、在 `excelParserAsync.ts` 与 worker 各实例化一次。

- [ ] **Step 3: 内存口径复测（可复现部分）**

Node 侧对比「旧：`readWorkbookAsync`+主线程 `parseWorkbookWithConfig`」与「新：`openWorkbookAsync`+`parseHandleAsync`」在真实文件（`~/Downloads/产品准入导出*.xlsx`）上的峰值，预期省掉一份 32MB 量级 workbook 克隆。把数值写入设计文档 §8。

- [ ] **Step 4: 更新设计文档状态头 + §8**

`docs/plans/2026-10-08-worker-ipc-slimming-design.md` 状态头由「设计定稿（实施未开始…）」改为「P2-1～P2-4 已实施」，追加 §8 实施备注：实测数值、实施中发现的问题、以及**哪些步骤未经真机验证**（Task 3 Step 3 / 同 P0–P1 的 RSS 缺口）。

- [ ] **Step 5: 提交**

```bash
git add docs/plans/2026-10-08-worker-ipc-slimming-design.md
git commit -m "docs(memory): mark P2 worker IPC slimming implemented"
```

---

## Self-Review

**Spec coverage（对照设计文档 §4/§7）**

| 设计条目 | 覆盖任务 |
|---|---|
| P2-1 handle 协议 + worker 持有 + 迁 `FileManager` | Task 1（纯模块）、Task 2（协议）、Task 3（worker 侧）、Task 4（FileManager） |
| P2-2 迁 `AssetUpgradeModal` | Task 5 |
| P2-3 「只需行」消费者改走解析侧 + 删 `readWorkbook*` | Task 6 |
| P2-4 Rust → AOA + `EnumImportModal` | Task 7 |
| handle 生命周期（LRU 上限 3、幂等释放、缺失报错、降级） | Task 1（LRU/幂等/缺失）、Task 2（降级 fallback） |
| 验证口径（四条 + cargo + 等价性 + 内存口径） | 各任务 Step、Task 8 |

**与设计文档的三处细化（实施层面，非语义变更）**：
1. `parseHandleAsync(handleId, configs?)` —— 设计文档写的是 `(handleId, fileName, configs?)`。fileName 改由解析侧存储持有（`WorkbookHandleEntry`），避免调用方传参不一致；语义等价且更不易错。
2. `WorkbookHandleInfo` 类型定义放在 `workbookHandles.ts`（叶子模块）而非 `excelParserAsync.ts`，以避免 worker ↔ excelParserAsync 的循环依赖。
3. **P2-3 从「回 AOA + 主线程复刻对象转换」改为「解析侧直接产出终态载荷」**——实测否决了设计文档 §4 P2-3 的隐含假设（主线程用自写函数把 AOA 转成表头对象）。SheetJS 的表头命名语义比预想复杂（空表头 `""`、重复 `_1`、超宽列 `__EMPTY`、`null` 键省略、全空行保留），手写复刻会静默改结果；改用 SheetJS 自己在解析侧转换，载荷还更小（0.54MB vs workbook 21.37MB）。设计文档 §4 P2-3 应据此同步修订。

**Placeholder scan**：无 TBD/TODO。Task 7 的 Rust 改动以「要点 + 验收」给出而非逐行代码——Rust 侧改动是删除与结构替换（删 A1 地址构造、`Empty`→`Null`），逐行贴出会与现有文件漂移；已在 Step 1 列明必须保留的语义（空单元格补位）与必须删除的部分（`column_name`、`!ref`）。

**Type consistency**：
- `WorkbookHandleInfo` 的五个字段在 Task 2 定义、Task 3（worker 构造）、Task 4（FileManager 消费 `info.orientation`/`info.previews`/`info.fileName`）、Task 5（AssetUpgradeModal 消费同名字段）一致。
- `WorkbookHandleStore` 的 `open/get/release/size` 在 Task 1 定义，Task 2（fallback）、Task 3（worker）使用一致。
- `SheetRowsResult` / `SheetObjectsResult` 在 Task 6 定义，三个消费者按 `rows` / `objects` 使用一致。
- `firstSheetRows` / `firstSheetHeaderObjects` 在 `excelParser.ts` 定义（Task 6 Step 1），被 `excelParserAsync` 的 fallback 与 worker 共用——**单一实现，无双份漂移**。

**已知风险提示**：
1. **Task 3 的 worker 分支 jsdom 测不到**——jsdom 无 `Worker`，测试只覆盖 fallback。worker 侧靠 `npm run build`（会打包 worker）+ 真机 Step 3 验证。这是本计划最大的验证缺口，已在 Task 3 与 Task 8 显式记录。
2. **handle 泄漏**由 LRU 上限兜底（3），但 LRU 驱逐会让被驱逐 handle 的后续 `parseHandle` 报错——正常流程下调用方在弹窗关闭即释放，不会触顶。
3. **Task 6 的等价性来自「用同一个函数」而非「复刻」**——`firstSheetHeaderObjects` 直接委托 `sheet_to_json`，与 `AttributeDedup` 原来的调用是同一个函数，因此语义差异风险为零；这也是放弃手写复刻的原因。
