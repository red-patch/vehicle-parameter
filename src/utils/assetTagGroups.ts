import { join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { loadCustomConfig, loadAssetTags } from './assetManager';

export interface AssetTagGroupsConfig {
    otherTags: string[];
    vehicleFamilyTags: string[];
    manufacturerTags: string[];
}

export const DEFAULT_ASSET_TAG_GROUPS: AssetTagGroupsConfig = {
    otherTags: [],
    vehicleFamilyTags: [
        '中面',
        '大面',
        '小卡',
        '微卡',
        '轻卡',
        '无人车',
        '中卡',
        '乘用车',
        '二类底盘',
        '冷藏中卡',
        '冷藏大面',
        '冷藏小卡',
        '冷藏微卡',
        '冷藏轻卡',
        '大VAN',
        '小面',
        '微车',
        '微面',
        '油电混合轿车',
        '蓝牌轻卡',
        '轿车',
        '重卡',
        '黄牌中型卡车',
        '黄牌轻型卡车',
    ],
    manufacturerTags: [
        '九识',
        '吉利',
        '大通',
        '白犀牛',
        '福田',
        '新石器',
    ],
};

const TAG_GROUPS_FILE = 'custom_asset_tag_groups.json';

let cachedAssetTagGroups: AssetTagGroupsConfig = DEFAULT_ASSET_TAG_GROUPS;

const normalizeTags = (values: string[] | undefined) =>
    Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));

export const mergeAssetTagGroupsConfig = (
    customConfig: Partial<AssetTagGroupsConfig> | null | undefined,
    observedTags: string[] = []
): AssetTagGroupsConfig => {
    const vehicleFamilyTags = customConfig?.vehicleFamilyTags
        ? normalizeTags(customConfig.vehicleFamilyTags)
        : DEFAULT_ASSET_TAG_GROUPS.vehicleFamilyTags;
    const manufacturerTags = customConfig?.manufacturerTags
        ? normalizeTags(customConfig.manufacturerTags).filter((tag) => !vehicleFamilyTags.includes(tag))
        : DEFAULT_ASSET_TAG_GROUPS.manufacturerTags.filter((tag) => !vehicleFamilyTags.includes(tag));

    const configuredOtherTags = customConfig?.otherTags
        ? normalizeTags(customConfig.otherTags).filter((tag) => !vehicleFamilyTags.includes(tag) && !manufacturerTags.includes(tag))
        : [];

    const derivedOtherTags = normalizeTags(observedTags).filter((tag) => !vehicleFamilyTags.includes(tag) && !manufacturerTags.includes(tag));

    return {
        otherTags: Array.from(new Set([...configuredOtherTags, ...derivedOtherTags])),
        vehicleFamilyTags,
        manufacturerTags,
    };
};

export const reloadCustomAssetTagGroups = async (libraryPath: string): Promise<void> => {
    if (!libraryPath) {
        cachedAssetTagGroups = DEFAULT_ASSET_TAG_GROUPS;
        return;
    }

    try {
        const tagsMap = await loadAssetTags(libraryPath);
        const observedTags = Array.from(new Set(Object.values(tagsMap).flat()));
        const customConfig = await loadCustomConfig<Partial<AssetTagGroupsConfig>>(libraryPath, TAG_GROUPS_FILE);
        cachedAssetTagGroups = mergeAssetTagGroupsConfig(customConfig, observedTags);
    } catch (error) {
        console.error('动态加载 custom_asset_tag_groups.json 失败', error);
        cachedAssetTagGroups = DEFAULT_ASSET_TAG_GROUPS;
    }
};

export const saveCustomAssetTagGroups = async (libraryPath: string, config: AssetTagGroupsConfig) => {
    const normalized = mergeAssetTagGroupsConfig(config);
    const configPath = await join(libraryPath, TAG_GROUPS_FILE);
    await writeTextFile(configPath, JSON.stringify(normalized, null, 2));
    cachedAssetTagGroups = normalized;
};

export const getAssetTagGroupsSync = () => cachedAssetTagGroups;
