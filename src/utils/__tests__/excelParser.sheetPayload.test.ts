import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildSheetObjectsResult, buildSheetRowsResult, firstSheetHeaderObjects } from '../excelParser';

const wbOf = (aoa: unknown[][]): XLSX.WorkBook => ({
    SheetNames: ['S1'],
    Sheets: { S1: XLSX.utils.aoa_to_sheet(aoa) },
});

/** 参照实现：直接调 SheetJS 默认 sheet_to_json——任务正确性完全依赖这个语义 */
const reference = (wb: XLSX.WorkBook) =>
    XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);

describe('firstSheetHeaderObjects（委托 SheetJS，勿手写复刻）', () => {
    const cases: { name: string; aoa: unknown[][] }[] = [
        { name: '普通表头', aoa: [['属性名称', '值'], ['a', '1'], ['b', '2']] },
        { name: '空表头', aoa: [['属性名称', '', '值'], ['a', 'b', 'c']] },
        { name: '重复表头（需去重后缀）', aoa: [['k', '', 'k', 'k'], ['a', 'b', 'c', 'd']] },
        { name: '行超出表头宽度（__EMPTY）', aoa: [['a'], ['1', '2', '3']] },
        { name: 'null 单元格（键应省略）', aoa: [['a', 'b', 'c'], ['1', null, '']] },
        { name: '全空行（应保留）', aoa: [['a', 'b'], ['1', '2'], ['', ''], ['3', '4']] },
        { name: '表头行为空', aoa: [[], ['1', '2']] },
    ];

    for (const { name, aoa } of cases) {
        it(`与 SheetJS 输出一致：${name}`, () => {
            const wb = wbOf(aoa);
            expect(firstSheetHeaderObjects(wb)).toEqual(reference(wb));
        });
    }
});

describe('载荷形状（worker 与主线程 fallback 必须同形）', () => {
    it('buildSheetRowsResult 返回 { sheetName, rows }', () => {
        const r = buildSheetRowsResult(wbOf([['参数名', '值'], ['整备质量', '1000']]));
        expect(Object.keys(r).sort()).toEqual(['rows', 'sheetName']);
        expect(r.sheetName).toBe('S1');
        expect(r.rows[0]).toEqual(['参数名', '值']);
    });

    it('buildSheetObjectsResult 返回 { sheetName, objects }', () => {
        const r = buildSheetObjectsResult(wbOf([['属性名称'], ['a']]));
        expect(Object.keys(r).sort()).toEqual(['objects', 'sheetName']);
        expect(r.sheetName).toBe('S1');
        expect(r.objects).toEqual([{ 属性名称: 'a' }]);
    });
});
