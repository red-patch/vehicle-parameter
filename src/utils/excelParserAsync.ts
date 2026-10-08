/**
 * Excel 解析异步封装 - 通过 Web Worker 在后台线程执行
 * API 与同步版本一致，返回值类型相同，调用方式改为 async/await
 * 
 * 如果 Worker 初始化失败（如浏览器不支持 module worker 或路径解析出错），
 * 自动 fallback 到主线程同步解析，保证功能不中断。
 */
import type { SheetData, SheetParseConfig } from '../types';
import {
  buildSheetObjectsResult,
  buildSheetRowsResult,
  buildWorkbookHandleInfo,
  parseByHandle,
  parseWorkbook,
} from './excelParser';
import type { SheetObjectsResult, SheetRowsResult } from './excelParser';

// 类型定义在 excelParser（生产者旁），此处再导出以保持既有引用路径
export type { SheetObjectsResult, SheetRowsResult };
import { WorkbookHandleStore } from './workbookHandles';
import type { WorkbookHandleInfo } from './workbookHandles';
import * as XLSX from 'xlsx';

let _worker: Worker | null = null;
let _workerFailed = false;
let _pendingId = 0;
// resolve 类型为 unknown：既承载 SheetData，也承载 WorkbookHandleInfo（handle 协议）。
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

const createWorker = (): Worker | null => {
  if (_workerFailed) return null;
  try {
    const worker = new Worker(
      new URL('../workers/excelParser.worker.ts', import.meta.url),
      { type: 'module' }
    );
    worker.onmessage = (e: MessageEvent<{ id: number; success: boolean; data?: unknown; error?: string }>) => {
      const { id, success, data, error } = e.data;
      const pending = _pending.get(id);
      if (!pending) return;
      _pending.delete(id);
      if (success) {
        // 不再 as SheetData：_pending 的 resolve 已放宽为 unknown，
        // 强转会把 WorkbookHandleInfo 谎报成 SheetData。
        pending.resolve(data);
      } else {
        pending.reject(new Error(error || 'Worker parse failed'));
      }
    };
    worker.onerror = (ev) => {
      _workerFailed = true;
      _worker = null;
      for (const [, p] of _pending) {
        p.reject(new Error(ev.message || 'Worker error'));
      }
      _pending.clear();
    };
    return worker;
  } catch {
    _workerFailed = true;
    console.warn('Web Worker 初始化失败，回退到主线程解析');
    return null;
  }
};

const getWorker = (): Worker | null => {
  if (_workerFailed) return null;
  if (!_worker) {
    _worker = createWorker();
  }
  return _worker;
};

/**
 * 主线程同步解析（fallback）
 */
const parseSync = (buffer: ArrayBuffer, fileName: string): SheetData => {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  return parseWorkbook(workbook, fileName);
};

/** 主线程 fallback 时的 handle 存储（worker 可用时不用它） */
const _fallbackStore = new WorkbookHandleStore(3);

const openWorkbookSync = (buffer: ArrayBuffer, fileName: string): WorkbookHandleInfo => {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const handleId = _fallbackStore.open(workbook, fileName);
  return buildWorkbookHandleInfo(workbook, handleId, fileName);
};

const parseHandleSync = (handleId: number, configs?: SheetParseConfig[]): SheetData =>
  parseByHandle(_fallbackStore, handleId, configs);

const firstSheetRowsSync = (buffer: ArrayBuffer): SheetRowsResult => {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  return buildSheetRowsResult(workbook);
};

const firstSheetObjectsSync = (buffer: ArrayBuffer): SheetObjectsResult => {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  return buildSheetObjectsResult(workbook);
};

/**
 * 通过 Worker 发送任务（自动 fallback）。
 *
 * buffer 可选：handle 协议的 parseHandle 没有 buffer（workbook 已在解析侧），
 * 此时不构造 transfer 列表。返回值 R 既可能是 SheetData，也可能是
 * WorkbookHandleInfo（含 handleId）——由调用方泛型决定。
 */
const postTask = <R, M extends { type: string } = { type: string } & Record<string, unknown>>(
  msg: M,
  buffer: ArrayBuffer | undefined,
  fallback: () => R
): Promise<R> => {
  const worker = getWorker();
  if (!worker) {
    // Worker 不可用，直接主线程执行
    return new Promise((resolve, reject) => {
      try {
        resolve(fallback());
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  return new Promise((resolve, reject) => {
    const id = ++_pendingId;
    _pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    try {
      if (buffer) worker.postMessage({ id, ...msg, buffer }, [buffer]);
      else worker.postMessage({ id, ...msg });
    } catch {
      _pending.delete(id);
      // postMessage 失败（如 buffer 已 detach），回退主线程
      try {
        resolve(fallback());
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  });
};

/**
 * 一次解析：worker 内 `XLSX.read` 后**留在 worker 内**缓存，只回方向判定 + 预览 + handle。
 * 这是 P2 的核心——完整 workbook 不再跨线程克隆（实测省 32.2MB/次）。
 */
export const openWorkbookAsync = async (file: File): Promise<WorkbookHandleInfo> => {
  const buffer = await file.arrayBuffer();
  const worker = getWorker();
  if (!worker) return openWorkbookSync(buffer, file.name);
  return postTask<WorkbookHandleInfo>(
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
  return postTask<SheetData>(
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
  try {
    worker.postMessage({ type: 'releaseHandle' as const, handleId });
  } catch {
    _fallbackStore.release(handleId);
  }
};

/**
 * 异步解析 Excel 文件（自动检测模式）
 * 替代同步版 parseExcel
 */
export const parseExcelAsync = async (file: File): Promise<SheetData> => {
  const buffer = await file.arrayBuffer();
  return postTask(
    { type: 'parse' as const, buffer, fileName: file.name },
    buffer,
    () => parseSync(buffer, file.name)
  );
};

/**
 * 解析侧直接产出首 sheet 的 header:1 二维数组（不给调用方 workbook）。
 * 供「只按索引取列」的消费者使用——整份 workbook 不再跨线程克隆。
 */
export const readFirstSheetRowsAsync = async (buffer: ArrayBuffer): Promise<SheetRowsResult> =>
  postTask({ type: 'readFirstSheetRows' as const, buffer }, buffer, () => firstSheetRowsSync(buffer));

/**
 * 解析侧直接产出首 sheet 的表头对象数组（SheetJS 默认语义）。
 * 转换发生在解析侧用 SheetJS 本身完成，主线程只收终态对象（0.54MB vs 21.37MB workbook）。
 */
export const readFirstSheetObjectsAsync = async (buffer: ArrayBuffer): Promise<SheetObjectsResult> =>
  postTask({ type: 'readFirstSheetObjects' as const, buffer }, buffer, () => firstSheetObjectsSync(buffer));

/**
 * Phase 5：Tauri Rust 命令（calamine）按路径解析，返回 SheetJS 兼容 WorkBook。
 * 仅 Tauri 环境可用（调用方需已持有文件路径，如 dialog 返回值）。
 */
export const readWorkbookFromPathAsync = async (path: string): Promise<XLSX.WorkBook> => {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('readWorkbookFromPathAsync 仅在 Tauri 环境可用');
  }
  const { invoke } = await import('@tauri-apps/api/core');
  const workbook = await invoke<unknown>('read_workbook', { path });
  return workbook as XLSX.WorkBook;
};
