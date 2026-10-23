import { describe, expect, it } from 'vitest';
import { DEFAULT_FIELD_GROUPS, normalizeExportFormats, normalizeFieldGroupsConfig } from '../fieldLists';

describe('field group config', () => {
    it('keeps default groups when config is empty', () => {
        const groups = normalizeFieldGroupsConfig(null);
        expect(groups.map((group) => group.id)).toEqual(DEFAULT_FIELD_GROUPS.map((group) => group.id));
    });

    it('migrates the old two-list format into named groups', () => {
        const groups = normalizeFieldGroupsConfig({
            systemRequired: ['快充', '慢充'],
            qualityCheck: ['品牌'],
        });

        expect(groups).toEqual([
            { id: 'system-required', name: '系统必填字段', fields: ['快充', '慢充'] },
            { id: 'quality-check', name: '质量验车字段', fields: ['品牌'] },
        ]);
    });

    it('normalizes the new grouped format and deduplicates fields', () => {
        const groups = normalizeFieldGroupsConfig({
            groups: [
                { id: 'b-system', name: 'B系统必填字段', fields: [' 字段A ', '字段B', '字段A'] },
            ],
        });

        expect(groups).toEqual([
            { id: 'b-system', name: 'B系统必填字段', fields: ['字段A', '字段B'] },
        ]);
    });
});

describe('export format config', () => {
    const groups = [{ id: 'g1', name: '模板组', fields: ['A', 'B'] }];
    const format = {
        id: 'f1',
        name: '货运格式',
        fieldGroupId: 'g1',
        sheetName: '产品准入导入模版',
        fileNamePattern: '车上云系统导入_{车型}_{日期}',
    };

    it('保留引用有效字段组的格式', () => {
        expect(normalizeExportFormats([format], groups)).toHaveLength(1);
    });

    it('引用了不存在的字段组 → 该格式被丢弃（下拉里会看不到）', () => {
        expect(normalizeExportFormats([{ ...format, fieldGroupId: 'gone' }], groups)).toEqual([]);
    });

    it('缺 sheet 名 / 文件名模板时补默认值，不丢格式', () => {
        const result = normalizeExportFormats([{ ...format, sheetName: '', fileNamePattern: '' }], groups);
        expect(result[0].sheetName).toBeTruthy();
        expect(result[0].fileNamePattern).toContain('{车型}');
    });

    it('空配置不抛错', () => {
        expect(normalizeExportFormats(undefined, groups)).toEqual([]);
    });
});
