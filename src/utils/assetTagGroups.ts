import { join } from '@tauri-apps/api/path';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { loadCustomConfig, loadAssetTags, saveAssetTags } from './assetManager';

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

/** 单组内标签去重（保留首次出现顺序，去除空白） */
export const normalizeTagList = (tags: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of tags) {
        const t = raw.trim();
        if (!t || seen.has(t)) continue;
        seen.add(t);
        result.push(t);
    }
    return result;
};

/** 规范化分组配置：各组内去重 */
export const normalizeTagGroupsConfig = (config: AssetTagGroupsConfig): AssetTagGroupsConfig => ({
    ...config,
    groups: config.groups.map((g) => ({
        ...g,
        tags: normalizeTagList(g.tags),
    })),
});

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

/** 互斥组的标签集合列表（批量打标签的组内替换语义用；跳过空组与已删除组） */
export const getExclusiveGroupTagSets = (): string[][] => {
    return cachedConfig.exclusiveGroups
        .map(id => cachedConfig.groups.find(g => g.id === id)?.tags ?? [])
        .filter(tags => tags.length > 0);
};

export const reloadCustomAssetTagGroups = async (libraryPath: string): Promise<void> => {
    if (!libraryPath) {
        cachedConfig = DEFAULT_ASSET_TAG_GROUPS;
        return;
    }
    try {
        // 现格式 { groups, exclusiveGroups }；旧格式为三个平铺标签数组，读到后归并成 groups
        type LegacyTagGroupsConfig = Partial<AssetTagGroupsConfig> & {
            otherTags?: string[];
            vehicleFamilyTags?: string[];
            manufacturerTags?: string[];
        };
        const config = await loadCustomConfig<LegacyTagGroupsConfig>(libraryPath, TAG_GROUPS_FILE);
        if (!config) {
            cachedConfig = DEFAULT_ASSET_TAG_GROUPS;
        } else if (config.groups) {
            cachedConfig = normalizeTagGroupsConfig(config as AssetTagGroupsConfig);
        } else {
            // 旧格式迁移：{ otherTags, vehicleFamilyTags, manufacturerTags } → { groups }
            const groups: TagGroupItem[] = [];
            if (config.vehicleFamilyTags?.length) groups.push({ id: 'vehicleFamily', name: '车型族群', tags: [...config.vehicleFamilyTags] });
            if (config.manufacturerTags?.length) groups.push({ id: 'manufacturer', name: '厂商', tags: [...config.manufacturerTags] });
            const otherTags = [...(config.otherTags || [])];
            if (otherTags.length) groups.push({ id: 'other', name: '其他标签', tags: otherTags });
            cachedConfig = normalizeTagGroupsConfig({ groups, exclusiveGroups: config.exclusiveGroups || [] });
        }
    } catch {
        cachedConfig = DEFAULT_ASSET_TAG_GROUPS;
    }
};

export const saveCustomAssetTagGroups = async (libraryPath: string, config: AssetTagGroupsConfig): Promise<void> => {
    const normalized = normalizeTagGroupsConfig(consolidateDefaultTagGroups(config));
    cachedConfig = normalized;
    const configPath = await join(libraryPath, TAG_GROUPS_FILE);
    await writeTextFile(configPath, JSON.stringify(normalized, null, 2));
};

/**
 * 从资产库彻底删除标签：移除所有分组词典项，并从 _asset_tags.json 各资产绑定中剥离。
 * @returns 更新了标签绑定的资产文件数量
 */
export const purgeTagFromLibrary = async (libraryPath: string, tag: string): Promise<number> => {
    const normalized = tag.trim();
    if (!normalized) return 0;

    const tagsMap = await loadAssetTags(libraryPath);
    let assetsUpdated = 0;
    for (const [fileName, fileTags] of Object.entries(tagsMap)) {
        if (!fileTags.includes(normalized)) continue;
        const next = fileTags.filter((t) => t !== normalized);
        if (next.length === 0) delete tagsMap[fileName];
        else tagsMap[fileName] = next;
        assetsUpdated += 1;
    }
    await saveAssetTags(libraryPath, tagsMap);

    const nextConfig = normalizeTagGroupsConfig({
        ...cachedConfig,
        groups: cachedConfig.groups.map((g) => ({
            ...g,
            tags: g.tags.filter((t) => t !== normalized),
        })),
    });
    await saveCustomAssetTagGroups(libraryPath, nextConfig);
    return assetsUpdated;
};

/** 默认兜底分组的固定 ID */
export const DEFAULT_GROUP_ID = '_default_other';

/**
 * 合并历史上可能出现的多个「其他标签」兜底分组，避免筛选栏出现两行同名分组。
 */
export const consolidateDefaultTagGroups = (config: AssetTagGroupsConfig): AssetTagGroupsConfig => {
    const defaultLike = config.groups.filter(
        g => g.id === DEFAULT_GROUP_ID || g.id === 'other' || g.name === '其他标签' || g.name === '其他',
    );
    if (defaultLike.length === 0) return config;

    const mergedTags = normalizeTagList(defaultLike.flatMap(g => g.tags));
    const rest = config.groups.filter(g => !defaultLike.includes(g));
    return {
        ...config,
        groups: [
            ...rest,
            { id: DEFAULT_GROUP_ID, name: '其他标签', tags: mergedTags },
        ],
    };
};

/**
 * 将新标签自动归入系统的默认兜底分组。按固定 ID 查找，不存在则创建。
 * 供 DataSourcePanel / FileManager / SaveAssetModal 等入口统一调用。
 * @returns 是否写入了分组配置（调用方应据此 bump assetTagGroupsVersion 刷新筛选栏）
 */
const needsDefaultGroupConsolidation = (config: AssetTagGroupsConfig): boolean =>
    config.groups.filter(
        g => g.id === DEFAULT_GROUP_ID || g.id === 'other' || g.name === '其他标签' || g.name === '其他',
    ).length > 1;

export const ensureTagsInDefaultGroup = async (libraryPath: string, newTags: string[]): Promise<boolean> => {
    const shouldConsolidate = needsDefaultGroupConsolidation(cachedConfig);
    const config = shouldConsolidate ? consolidateDefaultTagGroups(cachedConfig) : cachedConfig;
    const existing = new Set(config.groups.flatMap(g => g.tags));
    const toAdd = newTags.map(t => t.trim()).filter(t => t.length > 0 && !existing.has(t));
    if (toAdd.length === 0) {
        if (shouldConsolidate) {
            await saveCustomAssetTagGroups(libraryPath, config);
            return true;
        }
        return false;
    }

    let otherGroup = config.groups.find(g => g.id === DEFAULT_GROUP_ID);
    if (!otherGroup) {
        otherGroup = { id: DEFAULT_GROUP_ID, name: '其他标签', tags: [] };
        config.groups.push(otherGroup);
    }
    otherGroup.tags = normalizeTagList([...otherGroup.tags, ...toAdd]);
    await saveCustomAssetTagGroups(libraryPath, config);
    return true;
};
