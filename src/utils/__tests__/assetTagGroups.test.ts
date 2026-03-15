import { describe, expect, it } from 'vitest';
import { assignTagToGroup, DEFAULT_ASSET_TAG_GROUPS, mergeAssetTagGroupsConfig } from '../assetTagGroups';

describe('assetTagGroups', () => {
    it('keeps defaults when no custom config is provided', () => {
        expect(mergeAssetTagGroupsConfig(null)).toEqual(DEFAULT_ASSET_TAG_GROUPS);
    });

    it('overrides only configured groups and normalizes values', () => {
        expect(mergeAssetTagGroupsConfig({
            vehicleFamilyTags: [' 大面 ', '轻卡', '大面'],
        }, ['大面', '轻卡'])).toEqual({
            manualTags: [],
            otherTags: [],
            vehicleFamilyTags: ['大面', '轻卡'],
            manufacturerTags: [],
        });
    });

    it('derives unassigned observed tags into otherTags and keeps unique ownership', () => {
        expect(mergeAssetTagGroupsConfig({
            otherTags: ['公告数据', '福田'],
            vehicleFamilyTags: ['大面'],
            manufacturerTags: ['福田'],
        }, ['公告数据', '客运版', '大面', '福田'])).toEqual({
            manualTags: [],
            otherTags: ['公告数据', '客运版'],
            vehicleFamilyTags: ['大面'],
            manufacturerTags: ['福田'],
        });
    });

    it('does not inject system preset tags that were never observed or configured', () => {
        expect(mergeAssetTagGroupsConfig(null, ['公告数据', '福田', '大面'])).toEqual({
            manualTags: [],
            otherTags: ['公告数据', '福田', '大面'],
            vehicleFamilyTags: [],
            manufacturerTags: [],
        });
    });

    it('keeps a tag in exactly one group when reassigned', () => {
        expect(assignTagToGroup({
            manualTags: [],
            otherTags: ['公告数据', '大面'],
            vehicleFamilyTags: [],
            manufacturerTags: ['福田'],
        }, '大面', 'vehicleFamily')).toEqual({
            manualTags: [],
            otherTags: ['公告数据'],
            vehicleFamilyTags: ['大面'],
            manufacturerTags: ['福田'],
        });
    });

    it('keeps manually created tags visible even when assets do not use them', () => {
        expect(mergeAssetTagGroupsConfig({
            manualTags: ['新标签'],
            otherTags: ['新标签'],
        }, ['公告数据'])).toEqual({
            manualTags: ['新标签'],
            otherTags: ['新标签', '公告数据'],
            vehicleFamilyTags: [],
            manufacturerTags: [],
        });
    });

    it('drops stale configured tags that are neither observed nor manually created', () => {
        expect(mergeAssetTagGroupsConfig({
            otherTags: ['乘用车'],
        }, ['公告数据'])).toEqual({
            manualTags: [],
            otherTags: ['公告数据'],
            vehicleFamilyTags: [],
            manufacturerTags: [],
        });
    });
});
