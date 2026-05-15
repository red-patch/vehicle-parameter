import { join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { loadCustomConfig } from './assetManager';

export interface TagGroupItem {
    id: string;
    name: string;
    tags: string[];
}

export interface AssetTagGroupsConfig {
    groups: TagGroupItem[];
    exclusiveGroups: string[];
}

export const DEFAULT_ASSET_TAG_GROUPS: AssetTagGroupsConfig = {
    groups: [],
    exclusiveGroups: [],
};

const TAG_GROUPS_FILE = 'custom_asset_tag_groups.json';

let cachedConfig: AssetTagGroupsConfig = DEFAULT_ASSET_TAG_GROUPS;

export const getAssetTagGroupsSync = () => cachedConfig;

export const getTagsForGroup = (groupId: string): string[] => {
    const group = cachedConfig.groups.find(g => g.id === groupId);
    return group?.tags ?? [];
};

export const getAllGroupTags = (): string[] => {
    return Array.from(new Set(cachedConfig.groups.flatMap(g => g.tags)));
};

export const isGroupExclusive = (groupId: string): boolean => {
    return cachedConfig.exclusiveGroups.includes(groupId);
};

export const reloadCustomAssetTagGroups = async (libraryPath: string): Promise<void> => {
    if (!libraryPath) {
        cachedConfig = DEFAULT_ASSET_TAG_GROUPS;
        return;
    }
    try {
        const config = await loadCustomConfig<any>(libraryPath, TAG_GROUPS_FILE);
        if (!config) {
            cachedConfig = DEFAULT_ASSET_TAG_GROUPS;
        } else if (config.groups) {
            // 新格式
            cachedConfig = config as AssetTagGroupsConfig;
        } else {
            // 旧格式迁移：{ otherTags, vehicleFamilyTags, manufacturerTags } → { groups }
            const groups: TagGroupItem[] = [];
            if (config.vehicleFamilyTags?.length) groups.push({ id: 'vehicleFamily', name: '车型族群', tags: [...config.vehicleFamilyTags] });
            if (config.manufacturerTags?.length) groups.push({ id: 'manufacturer', name: '厂商', tags: [...config.manufacturerTags] });
            const otherTags = [...(config.otherTags || [])];
            if (otherTags.length) groups.push({ id: 'other', name: '其他标签', tags: otherTags });
            cachedConfig = { groups, exclusiveGroups: config.exclusiveGroups || [] };
        }
    } catch {
        cachedConfig = DEFAULT_ASSET_TAG_GROUPS;
    }
};

export const saveCustomAssetTagGroups = async (libraryPath: string, config: AssetTagGroupsConfig): Promise<void> => {
    cachedConfig = config;
    const configPath = await join(libraryPath, TAG_GROUPS_FILE);
    await writeTextFile(configPath, JSON.stringify(config, null, 2));
};
