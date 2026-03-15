import { describe, expect, it } from 'vitest';
import { classifyAssetTags, filterAssetInfos } from '../assetTagFilters';

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

describe('assetTagFilters', () => {
    it('classifies tags into vehicle family, manufacturer, and other groups', () => {
        expect(classifyAssetTags(['大面', '福田', '客运版', '公告数据'])).toEqual({
            vehicleFamilyTags: ['大面'],
            manufacturerTags: ['福田'],
            otherTags: ['客运版', '公告数据'],
        });
    });

    it('filters assets using grouped selections and other-tag intersection', () => {
        const result = filterAssetInfos({
            assets,
            assetTags,
            selectedVehicleFamilyTag: '大面',
            selectedManufacturerTag: '福田',
            selectedOtherFilterTags: ['客运版'],
        });

        expect(result.map((asset) => asset.fileName)).toEqual(['a.json']);
    });
});
