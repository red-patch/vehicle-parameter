export const ASSET_SOURCE_TAGS = {
    announcement: '公告数据',
    purify: '数据体检',
    workspace: '工作区导入',
    manual: '人工维护',
} as const;

export type AssetSourceFilter = 'all' | 'announcement' | 'purify' | 'workspace' | 'manual';

/** 来源标签色调（对应 index.css 的 --src-* 中性偏色 token，绝不占用语义色） */
export type AssetSourceTone = 'announcement' | 'asset' | 'excel';

export const ASSET_SOURCE_META = {
    announcement: {
        filter: 'announcement' as const,
        label: ASSET_SOURCE_TAGS.announcement,
        tone: 'announcement' as AssetSourceTone,
        icon: '🏛',
    },
    purify: {
        filter: 'purify' as const,
        label: ASSET_SOURCE_TAGS.purify,
        tone: 'asset' as AssetSourceTone,
        icon: '🩺',
    },
    workspace: {
        filter: 'workspace' as const,
        label: ASSET_SOURCE_TAGS.workspace,
        tone: 'excel' as AssetSourceTone,
        icon: '📄',
    },
    manual: {
        filter: 'manual' as const,
        label: ASSET_SOURCE_TAGS.manual,
        tone: 'excel' as AssetSourceTone,
        icon: '✏️',
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
