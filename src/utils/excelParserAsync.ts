/**
 * Excel 解析异步封装 - 通过 Web Worker 在后台线程执行
 * API 与同步版本一致，返回值类型相同，调用方式改为 async/await
 * 
 * 如果 Worker 初始化失败（如浏览器不支持 module worker 或路径解析出错），
 * 自动 fallback 到主线程同步解析，保证功能不中断。
 */
import type { SheetData, SheetParseConfig } from '../types';
import { parseWorkbook, parseRequirementWorkbook, parseWorkbookWithConfig } from './excelParser';
import * as XLSX from 'xlsx';

let _worker: Worker | null = null;
let _workerFailed = false;
let _pendingId = 0;
const _pending = new Map<number, { resolve: (v: SheetData) => void; reject: (e: Error) => void }>();

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
        pending.resolve(data as SheetData);
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

const parseWithConfigSync = (buffer: ArrayBuffer, fileName: string, configs: SheetParseConfig[]): SheetData => {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  return parseWorkbookWithConfig(workbook, fileName, configs);
};

const parseRequirementSync = (buffer: ArrayBuffer, fileName: string): SheetData => {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  return parseRequirementWorkbook(workbook, fileName);
};

/**
 * 通过 Worker 发送任务（自动 fallback）
 */
const postTask = <T extends { type: string }>(msg: T, buffer: ArrayBuffer, _fileName: string, fallback: () => SheetData): Promise<SheetData> => {
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
    _pending.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, ...msg, buffer }, [buffer]);
    } catch (err) {
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
 * 异步解析 Excel 文件（自动检测模式）
 * 替代同步版 parseExcel
 */
export const parseExcelAsync = async (file: File): Promise<SheetData> => {
  const buffer = await file.arrayBuffer();
  return postTask(
    { type: 'parse' as const, buffer, fileName: file.name },
    buffer,
    file.name,
    () => parseSync(buffer, file.name)
  );
};

/**
 * 异步解析 - 配置化模式
 * 替代同步版 parseWorkbookWithConfig
 */
export const parseWithConfigAsync = async (
  file: File,
  configs: SheetParseConfig[]
): Promise<SheetData> => {
  const buffer = await file.arrayBuffer();
  return postTask(
    { type: 'parseWithConfig' as const, buffer, fileName: file.name, configs },
    buffer,
    file.name,
    () => parseWithConfigSync(buffer, file.name, configs)
  );
};

/**
 * 异步解析需求文件
 * 替代同步版 parseRequirementExcel
 */
export const parseRequirementAsync = async (file: File): Promise<SheetData> => {
  const buffer = await file.arrayBuffer();
  return postTask(
    { type: 'parseRequirement' as const, buffer, fileName: file.name },
    buffer,
    file.name,
    () => parseRequirementSync(buffer, file.name)
  );
};
