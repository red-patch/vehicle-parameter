import { describe, expect, it } from 'vitest';
import { DEFAULT_ASSET_TAG_GROUPS, mergeAssetTagGroupsConfig } from '../assetTagGroups';

describe('assetTagGroups', () => {
    it('keeps defaults when no custom config is provided', () => {
        expect(mergeAssetTagGroupsConfig(null)).toEqual(DEFAULT_ASSET_TAG_GROUPS);
    });

    it('overrides only configured groups and normalizes values', () => {
        expect(mergeAssetTagGroupsConfig({
            vehicleFamilyTags: [' 大面 ', '轻卡', '大面'],
        })).toEqual({
            otherTags: [],
            vehicleFamilyTags: ['大面', '轻卡'],
            manufacturerTags: DEFAULT_ASSET_TAG_GROUPS.manufacturerTags,
        });
    });

    it('derives unassigned observed tags into otherTags and keeps unique ownership', () => {
        expect(mergeAssetTagGroupsConfig({
            otherTags: ['公告数据', '福田'],
            vehicleFamilyTags: ['大面'],
            manufacturerTags: ['福田'],
        }, ['公告数据', '客运版', '大面', '福田'])).toEqual({
            otherTags: ['公告数据', '客运版'],
            vehicleFamilyTags: ['大面'],
            manufacturerTags: ['福田'],
        });
    });
});
