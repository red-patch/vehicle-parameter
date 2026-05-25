import { describe, expect, it } from 'vitest';
import {
    consolidateDefaultTagGroups,
    DEFAULT_ASSET_TAG_GROUPS,
    DEFAULT_GROUP_ID,
    normalizeTagList,
    normalizeTagGroupsConfig,
} from '../assetTagGroups';

describe('AssetTagGroupsConfig', () => {
    it('returns default config for empty', () => {
        expect(DEFAULT_ASSET_TAG_GROUPS).toEqual({ groups: [], exclusiveGroups: [] });
    });

    it('deduplicates tags within a group preserving order', () => {
        expect(normalizeTagList(['大面', '大面', ' 小卡 ', '大面', ''])).toEqual(['大面', '小卡']);
    });

    it('normalizes all groups on save shape', () => {
        const normalized = normalizeTagGroupsConfig({
            groups: [{ id: 'a', name: 'A', tags: ['x', 'x', 'y'] }],
            exclusiveGroups: [],
        });
        expect(normalized.groups[0].tags).toEqual(['x', 'y']);
    });

    it('merges duplicate default tag groups into one', () => {
        const merged = consolidateDefaultTagGroups({
            groups: [
                { id: 'vf', name: '车型族群', tags: ['大面'] },
                { id: 'other', name: '其他标签', tags: ['测试', '测试2'] },
                { id: DEFAULT_GROUP_ID, name: '其他标签', tags: ['数据体检'] },
            ],
            exclusiveGroups: [],
        });
        expect(merged.groups.filter(g => g.name === '其他标签')).toHaveLength(1);
        expect(merged.groups.find(g => g.id === DEFAULT_GROUP_ID)?.tags.sort()).toEqual(
            ['数据体检', '测试', '测试2'].sort(),
        );
    });
});
