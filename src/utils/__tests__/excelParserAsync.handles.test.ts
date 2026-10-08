import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

// 构造一个真实 workbook（走 XLSX.write，避免手搓单元格格式）
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

    it('parses by handle with configs → parseWorkbookWithConfig', async () => {
        const info = await openWorkbookAsync(makeFile([['参数名', '值'], ['整备质量', '1000']]));
        // 显式给一份解析配置，走 parseWorkbookWithConfig 分支
        const data = await parseHandleAsync(info.handleId, [
            {
                sheetName: 'S1',
                headerRows: [0],
                dataStartRow: 1,
                nameColIndex: 0,
                groupColIndex: -1,
                productColumns: [{ index: 1, name: '测试车型' }],
            },
        ]);
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

    it('settles (rejects) rather than hanging when the worker cannot handle the message', async () => {
        class FakeWorker {
            onmessage: ((e: MessageEvent) => void) | null = null;
            onerror: ((e: ErrorEvent) => void) | null = null;
            postMessage(msg: { id: number; type: string }) {
                queueMicrotask(() => this.onmessage?.({
                    data: { id: msg.id, success: false, error: `Unknown worker request type: ${msg.type}` },
                } as MessageEvent));
            }
        }
        vi.stubGlobal('Worker', FakeWorker);
        // 关键：模块缓存在 _worker / _workerFailed 上。前面几个用例跑完时
        // jsdom 无 Worker → _workerFailed 已置 true，直接用静态导入会走 fallback，
        // 测不到 worker 路径。resetModules + 重新动态 import 让模块在新 stub 下重新求值。
        vi.resetModules();
        try {
            const mod = await import('../excelParserAsync');
            const outcome = await Promise.race([
                mod.openWorkbookAsync(new File([new Uint8Array([1, 2, 3])], 'x.xlsx'))
                    .then(() => ({ ok: true as const, err: null as Error | null }),
                          (err: Error) => ({ ok: false as const, err })),
                new Promise<{ ok: false; err: Error }>((resolve) =>
                    setTimeout(() => resolve({ ok: false, err: new Error('HUNG') }), 1500)),
            ]);
            // 真的 settled（拒绝），且不是超时哨兵
            expect(outcome.ok).toBe(false);
            expect(outcome.err!.message).toMatch(/Unknown worker request type/);
            expect(outcome.err!.message).not.toBe('HUNG');
        } finally {
            vi.unstubAllGlobals();
            vi.resetModules();
        }
    });
});

describe('parseByHandle（worker 与 fallback 共用的唯一实现）', () => {
    it('throws the same user-facing message for a missing handle', async () => {
        const { parseByHandle } = await import('../excelParser');
        const { WorkbookHandleStore } = await import('../workbookHandles');
        const store = new WorkbookHandleStore(3);
        // 这条文案是用户可见诊断，只此一份（worker 与 fallback 都走它）
        expect(() => parseByHandle(store, 42)).toThrow(/workbook handle 不存在或已释放：42/);
    });
});
