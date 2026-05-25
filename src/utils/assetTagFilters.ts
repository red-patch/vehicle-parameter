import type { AssetTagGroupsConfig } from './assetTagGroups';

/** 按标签分组归类的结果：groupId → tags 列表 */
export type GroupedTags = Record<string, string[]>;

function buildGroupSets(config: AssetTagGroupsConfig): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const g of config.groups) {
        map.set(g.id, new Set(g.tags));
    }
    return map;
}

export interface FilterAssetInfosParams<T> {
    assets: T[];
    assetTags: Record<string, string[]>;
    /** 按分组 id 选中的标签 */
    selectedGroupTags?: Record<string, string | null>;
    /** 其他标签（不分组时选中的） */
    selectedOtherFilterTags?: string[];
}

export function filterAssetInfos<T extends { fileName: string }>({
    assets,
    assetTags,
    selectedGroupTags = {},
    selectedOtherFilterTags = [],
}: FilterAssetInfosParams<T>) {
    return assets.filter((asset) => {
        const tags = assetTags[asset.fileName] || [];
        // 按分组过滤
        for (const [, selectedTag] of Object.entries(selectedGroupTags)) {
            if (selectedTag && !tags.includes(selectedTag)) return false;
        }
        // 其他标签过滤（交集）
        if (selectedOtherFilterTags.length > 0 && !selectedOtherFilterTags.every((tag) => tags.includes(tag))) return false;
        return true;
    });
}

/**
 * 将标签按系统分组归类。不再硬编码"车型族群""厂商"。
 * 返回 { groupId: [tags], ... }，外加一个 "_other" 键表示不在任何分组的标签。
 */
export const classifyAvailableTagsWithConfig = (
    allTags: string[],
    config: AssetTagGroupsConfig
): GroupedTags => {
    const groupSets = buildGroupSets(config);
    const result: GroupedTags = {};
    const seen = new Set<string>();

    for (const g of config.groups) {
        const set = groupSets.get(g.id)!;
        const matched = allTags.filter(t => set.has(t));
        if (matched.length > 0) {
            result[g.id] = matched;
            matched.forEach(t => seen.add(t));
        }
    }

    // 不在任何分组的标签归入 "_other"
    const other = allTags.filter(t => !seen.has(t));
    if (other.length > 0) result._other = other;

    return result;
};

export const classifyAvailableTags = (allTags: string[]): GroupedTags => {
    return classifyAvailableTagsWithConfig(allTags, { groups: [], exclusiveGroups: [] });
};
