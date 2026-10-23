import { describe, expect, it } from 'vitest';
import { diffFields, extractTemplateFields } from '../coreFieldImport';

describe('extractTemplateFields', () => {
    it('跳过「参数项名称」表头，按第一列顺序取字段', () => {
        const result = extractTemplateFields([
            ['参数项名称', '参数值'],
            ['公告续航里程（km）', '465'],
            ['车身颜色', '白色'],
        ]);
        expect(result.headerSkipped).toBe(true);
        expect(result.fields).toEqual(['公告续航里程（km）', '车身颜色']);
    });

    it('首行不是标准表头时也按第一列提取（不丢首行）', () => {
        const result = extractTemplateFields([['车身颜色', '单选'], ['车厢材质', '单选']]);
        expect(result.headerSkipped).toBe(false);
        expect(result.fields).toEqual(['车身颜色', '车厢材质']);
    });

    it('去空行、trim、重复只保留首次出现并报告', () => {
        const result = extractTemplateFields([
            ['参数项名称'],
            ['  车身颜色  ', ''],
            [undefined],
            [''],
            ['车身颜色', '重复'],
            ['轴距（mm）', '1'],
        ]);
        expect(result.fields).toEqual(['车身颜色', '轴距（mm）']);
        expect(result.duplicates).toEqual(['车身颜色']);
    });

    it('441 项模板全量读入且无重复', () => {
        const rows: unknown[][] = [['参数项名称', '参数值']];
        for (let i = 0; i < 441; i++) rows.push([`字段${i}`, '']);
        const result = extractTemplateFields(rows);
        expect(result.fields).toHaveLength(441);
        expect(result.duplicates).toHaveLength(0);
    });
});

describe('diffFields', () => {
    it('报告新增与移除', () => {
        expect(diffFields(['A', 'B'], ['B', 'C'])).toEqual({ added: ['C'], removed: ['A'] });
    });

    it('完全一致时两侧都为空', () => {
        expect(diffFields(['A'], ['A'])).toEqual({ added: [], removed: [] });
    });
});
