export const ASSET_SOURCE_TAGS = {
    announcement: '公告数据',
    purify: '数据体检',
    workspace: '工作区导入',
    manual: '人工维护',
} as const;

export type AssetSourceFilter = 'all' | 'announcement' | 'purify' | 'workspace' | 'manual';

export const ASSET_SOURCE_META = {
    announcement: {
        filter: 'announcement' as const,
        label: ASSET_SOURCE_TAGS.announcement,
        color: 'blue' as const,
    },
    purify: {
        filter: 'purify' as const,
        label: ASSET_SOURCE_TAGS.purify,
        color: 'green' as const,
    },
    workspace: {
        filter: 'workspace' as const,
        label: ASSET_SOURCE_TAGS.workspace,
        color: 'cyan' as const,
    },
    manual: {
        filter: 'manual' as const,
        label: ASSET_SOURCE_TAGS.manual,
        color: 'purple' as const,
    },
} as const;

export const getAssetSourceMeta = (tags: string[]) => {
    if (tags.includes(ASSET_SOURCE_TAGS.announcement)) {
        return ASSET_SOURCE_META.announcement;
    }

    if (tags.includes(ASSET_SOURCE_TAGS.purify)) {
        return ASSET_SOURCE_META.purify;
    }

    if (tags.includes(ASSET_SOURCE_TAGS.workspace)) {
        return ASSET_SOURCE_META.workspace;
    }

    if (tags.includes(ASSET_SOURCE_TAGS.manual)) {
        return ASSET_SOURCE_META.manual;
    }

    return null;
};
