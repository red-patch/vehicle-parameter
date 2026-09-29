/**
 * Excel 解析 Web Worker
 * 将 XLSX.read + 数据解析移至独立线程，避免阻塞主线程 UI
 */
import * as XLSX from 'xlsx';
import { parseWorkbook, parseWorkbookWithConfig } from '../utils/excelParser';
import type { SheetParseConfig } from '../types';

type WorkerRequest =
  | { id: number; type: 'parse'; buffer: ArrayBuffer; fileName: string }
  | { id: number; type: 'parseWithConfig'; buffer: ArrayBuffer; fileName: string; configs: SheetParseConfig[] }
  | { id: number; type: 'readWorkbook'; buffer: ArrayBuffer };

type WorkerResponse =
  | { id: number; success: true; data: unknown }
  | { id: number; success: false; error: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, type, buffer } = e.data;
  try {
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
        // 仅解析、不做行转换；WorkBook 为纯数据对象，可被 postMessage 结构化克隆
        result = workbook;
        break;
      default:
        throw new Error(`Unknown worker request type: ${(e.data as { type: string }).type}`);
    }

    self.postMessage({ id, success: true, data: result } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({ id, success: false, error: (err as Error).message } satisfies WorkerResponse);
  }
};
