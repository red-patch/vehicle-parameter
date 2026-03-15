import { join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { loadCustomConfig, loadAssetTags } from './assetManager';

export interface AssetTagGroupsConfig {
    manualTags: string[];
    otherTags: string[];
    vehicleFamilyTags: string[];
    manufacturerTags: string[];
}

export type AssetTagGroupKey = 'other' | 'vehicleFamily' | 'manufacturer';

export const DEFAULT_ASSET_TAG_GROUPS: AssetTagGroupsConfig = {
    manualTags: [],
    otherTags: [],
    vehicleFamilyTags: [],
    manufacturerTags: [],
};

const TAG_GROUPS_FILE = 'custom_asset_tag_groups.json';

let cachedAssetTagGroups: AssetTagGroupsConfig = DEFAULT_ASSET_TAG_GROUPS;

const normalizeTags = (values: string[] | undefined) =>
    Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));

const collectConfiguredTags = (config: Partial<AssetTagGroupsConfig>) =>
    normalizeTags([
        ...(config.otherTags || []),
        ...(config.vehicleFamilyTags || []),
        ...(config.manufacturerTags || []),
    ]);

export const mergeAssetTagGroupsConfig = (
    customConfig: Partial<AssetTagGroupsConfig> | null | undefined,
    observedTags: string[] = []
): AssetTagGroupsConfig => {
    const manualTags = customConfig?.manualTags
        ? normalizeTags(customConfig.manualTags)
        : [];
    const vehicleFamilyTags = customConfig?.vehicleFamilyTags
        ? normalizeTags(customConfig.vehicleFamilyTags).filter((tag) => observedTags.includes(tag) || manualTags.includes(tag))
        : DEFAULT_ASSET_TAG_GROUPS.vehicleFamilyTags;
    const manufacturerTags = customConfig?.manufacturerTags
        ? normalizeTags(customConfig.manufacturerTags)
            .filter((tag) => !vehicleFamilyTags.includes(tag))
            .filter((tag) => observedTags.includes(tag) || manualTags.includes(tag))
        : DEFAULT_ASSET_TAG_GROUPS.manufacturerTags.filter((tag) => !vehicleFamilyTags.includes(tag));

    const configuredOtherTags = customConfig?.otherTags
        ? normalizeTags(customConfig.otherTags)
            .filter((tag) => !vehicleFamilyTags.includes(tag) && !manufacturerTags.includes(tag))
            .filter((tag) => observedTags.includes(tag) || manualTags.includes(tag))
        : [];

    const derivedOtherTags = normalizeTags(observedTags).filter((tag) => !vehicleFamilyTags.includes(tag) && !manufacturerTags.includes(tag));

    return {
        manualTags,
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
    const normalized = mergeAssetTagGroupsConfig(config, collectConfiguredTags(config));
    const configPath = await join(libraryPath, TAG_GROUPS_FILE);
    await writeTextFile(configPath, JSON.stringify(normalized, null, 2));
    cachedAssetTagGroups = normalized;
};

export const getAssetTagGroupsSync = () => cachedAssetTagGroups;

export const assignTagToGroup = (
    config: AssetTagGroupsConfig,
    tag: string,
    group: AssetTagGroupKey
) => {
    const trimmed = tag.trim();
    if (!trimmed) return config;

    const next = {
        manualTags: config.manualTags.filter((item) => item !== trimmed),
        otherTags: config.otherTags.filter((item) => item !== trimmed),
        vehicleFamilyTags: config.vehicleFamilyTags.filter((item) => item !== trimmed),
        manufacturerTags: config.manufacturerTags.filter((item) => item !== trimmed),
    };

    if (!config.otherTags.includes(trimmed) && !config.vehicleFamilyTags.includes(trimmed) && !config.manufacturerTags.includes(trimmed)) {
        next.manualTags.push(trimmed);
    } else if (config.manualTags.includes(trimmed)) {
        next.manualTags.push(trimmed);
    }

    if (group === 'other') next.otherTags.push(trimmed);
    if (group === 'vehicleFamily') next.vehicleFamilyTags.push(trimmed);
    if (group === 'manufacturer') next.manufacturerTags.push(trimmed);

    return mergeAssetTagGroupsConfig(next, collectConfiguredTags(next));
};
