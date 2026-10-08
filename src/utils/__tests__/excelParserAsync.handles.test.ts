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
});
