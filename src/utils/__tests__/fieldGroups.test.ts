import { describe, expect, it } from 'vitest';
import { DEFAULT_FIELD_GROUPS, normalizeFieldGroupsConfig } from '../fieldLists';

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
