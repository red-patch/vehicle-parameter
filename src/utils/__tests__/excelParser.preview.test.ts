import { afterEach, describe, expect, it, vi } from 'vitest';
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
    afterEach(() => vi.restoreAllMocks());

    it('caps preview rows at 100 but reports the real totals', () => {
        const wb = buildSheet(478, 20);
        const [p] = previewWorkbook(wb);
        expect(p.rows.length).toBe(100);
        expect(p.totalRows).toBe(478);
        expect(p.totalCols).toBe(20);
    });

    it('bounds sheet_to_json to the preview window instead of the whole sheet', () => {
        const spy = vi.spyOn(XLSX.utils, 'sheet_to_json');
        previewWorkbook(buildSheet(5000, 40));
        expect(spy).toHaveBeenCalled();
        const opts = spy.mock.calls[0][1] as { range?: { s: { r: number }; e: { r: number } } };
        expect(opts.range).toBeDefined();
        // 只物化前 101 行，而不是整表 5000 行
        expect(opts.range!.e.r - opts.range!.s.r).toBeLessThanOrEqual(100);
    });

    it('is byte-identical to the previous full-sheet implementation', () => {
        // defval:'' 会把行补满到 range 宽度，所以有界化不影响输出——
        // 这里锁住「输出不变」这一契约（ragged 形态）。
        const ragged = XLSX.utils.aoa_to_sheet([['a', 'b'], ['c', 'd', 'e', 'f', 'g']]);
        const [p] = previewWorkbook({ SheetNames: ['S'], Sheets: { S: ragged } });
        expect(p.totalRows).toBe(2);
        expect(p.totalCols).toBe(5);
        expect(p.rows).toEqual([['a', 'b', '', '', ''], ['c', 'd', 'e', 'f', 'g']]);
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

    it('keeps the row bound relative to a non-zero start row', () => {
        // 数据不从第 1 行开始时，预览仍取「最早 100 个数据行」，
        // 而不是从第 0 行起数（那会少取/错取）。
        const sheet: XLSX.WorkSheet = { '!ref': 'A5:B604' };
        for (let r = 5; r < 605; r++) {
            sheet[`A${r}`] = { t: 's', v: 'h' };
            sheet[`B${r}`] = { t: 's', v: `v${r - 5}` };
        }
        const wb: XLSX.WorkBook = { SheetNames: ['S'], Sheets: { S: sheet } };

        const [p] = previewWorkbook(wb);
        expect(p.totalRows).toBe(600);
        expect(p.rows.length).toBe(100);
        expect(p.rows[0]).toEqual(['h', 'v0']);
        expect(p.rows[99]).toEqual(['h', 'v99']);
    });

    it('bounds totalCols when !ref is inflated far beyond real cells', () => {
        // 手工把 !ref 膨胀到 XFD（SheetJS 能产出这种膨胀 ref）
        const ws = XLSX.utils.aoa_to_sheet([['a', 'b', 'c'], ['d', 'e', 'f']]);
        ws['!ref'] = 'A1:XFD2';
        const wb: XLSX.WorkBook = { SheetNames: ['S'], Sheets: { S: ws } };
        const [p] = previewWorkbook(wb);
        expect(p.totalCols).toBeLessThan(100);
        expect(p.totalRows).toBe(2);
    });
});
