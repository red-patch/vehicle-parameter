import { describe, expect, it } from 'vitest';
import { classifyAvailableTagsWithConfig, filterAssetInfos } from '../assetTagFilters';
import type { AssetTagGroupsConfig } from '../assetTagGroups';

const assets = [
    { fileName: 'a.json', productName: '车型A' },
    { fileName: 'b.json', productName: '车型B' },
    { fileName: 'c.json', productName: '车型C' },
];

const assetTags = {
    'a.json': ['公告数据', '大面', '福田', '客运版'],
    'b.json': ['数据体检', '小卡', '吉利'],
    'c.json': ['大面', '大通', '冷藏'],
};

const tagGroups: AssetTagGroupsConfig = {
    groups: [
        { id: 'vf', name: '车型族群', tags: ['大面', '小卡'] },
        { id: 'mf', name: '厂商', tags: ['福田', '吉利', '大通'] },
        { id: 'other', name: '其他标签', tags: ['客运版', '公告数据', '数据体检', '冷藏'] },
    ],
    exclusiveGroups: [],
};

describe('assetTagFilters', () => {
    it('classifies tags by groups, puts ungrouped into _other', () => {
        const result = classifyAvailableTagsWithConfig(['大面', '福田', '客运版', '公告数据', '未知标签'], tagGroups);
        expect(result.vf).toEqual(['大面']);
        expect(result.mf).toEqual(['福田']);
        expect(result.other).toEqual(['客运版', '公告数据']);
        expect(result._other).toEqual(['未知标签']);
    });

    it('filters assets using grouped selections and other-tag intersection', () => {
        const result = filterAssetInfos({
            assets,
            assetTags,
            selectedGroupTags: { vf: '大面', mf: '福田' },
            selectedOtherFilterTags: ['客运版'],
        });

        expect(result.map((asset) => asset.fileName)).toEqual(['a.json']);
    });
});
