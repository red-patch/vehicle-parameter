/**
 * Excel 解析 Web Worker
 * 将 XLSX.read + 数据解析移至独立线程，避免阻塞主线程 UI
 */
import * as XLSX from 'xlsx';
import {
  parseWorkbook,
  buildWorkbookHandleInfo,
  buildSheetObjectsResult,
  buildSheetRowsResult,
  parseByHandle,
} from '../utils/excelParser';
import type { SheetObjectsResult, SheetRowsResult } from '../utils/excelParser';
import { WorkbookHandleStore } from '../utils/workbookHandles';
import type { SheetParseConfig } from '../types';

/** worker 内持有多份 workbook（上限 3，LRU 兜底漏放） */
const handles = new WorkbookHandleStore(3);

type WorkerRequest =
  | { id: number; type: 'parse'; buffer: ArrayBuffer; fileName: string }
  | { id: number; type: 'openWorkbook'; buffer: ArrayBuffer; fileName: string }
  | { id: number; type: 'parseHandle'; handleId: number; configs?: SheetParseConfig[] }
  | { id: number; type: 'readFirstSheetRows'; buffer: ArrayBuffer }
  | { id: number; type: 'readFirstSheetObjects'; buffer: ArrayBuffer }
  // 主线程 fire-and-forget，不带 id（worker 也不回包）——类型如实反映，避免假装有 id
  | { type: 'releaseHandle'; handleId: number };

type WorkerResponse =
  | { id: number; success: true; data: unknown }
  | { id: number; success: false; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;

  // releaseHandle 是 fire-and-forget：主线程不登记 pending、不传 id，worker 也不回包。
  // 必须在任何 XLSX.read 之前返回，否则会白跑一次空解析并落到 default 报未知类型。
  if (req.type === 'releaseHandle') {
    handles.release(req.handleId);
    return;
  }

  const { id } = req;
  try {
    // parseHandle 无 buffer，同样要在下面那句 XLSX.read 之前处理。
    if (req.type === 'parseHandle') {
      const result = parseByHandle(handles, req.handleId, req.configs);
      self.postMessage({ id, success: true, data: result } satisfies WorkerResponse);
      return;
    }

    const workbook = XLSX.read(new Uint8Array(req.buffer), { type: 'array' });
    let result: unknown;

    switch (req.type) {
      case 'parse':
        result = parseWorkbook(workbook, req.fileName);
        break;
      case 'openWorkbook': {
        // workbook 留在 worker 内，只回 handle + 方向判定 + 预览
        const handleId = handles.open(workbook, req.fileName);
        result = buildWorkbookHandleInfo(workbook, handleId, req.fileName);
        break;
      }
      case 'readFirstSheetRows': {
        // 复用共享 builder（不在 worker 里重写）；显式标注类型，使 worker 与 fallback
        // 返回同形成为编译期约束（postTask 的 R 会擦掉 realm 差异，靠约定易漂移）。
        const rowsResult: SheetRowsResult = buildSheetRowsResult(workbook);
        result = rowsResult;
        break;
      }
      case 'readFirstSheetObjects': {
        const objectsResult: SheetObjectsResult = buildSheetObjectsResult(workbook);
        result = objectsResult;
        break;
      }
      default:
        throw new Error(`Unknown worker request type: ${(req as { type: string }).type}`);
    }

    self.postMessage({ id, success: true, data: result } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({ id, success: false, error: (err as Error).message } satisfies WorkerResponse);
  }
};
