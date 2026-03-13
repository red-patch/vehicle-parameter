export const ASSET_SOURCE_TAGS = {
    announcement: '公告数据',
    purify: '数据体检',
} as const;

export type AssetSourceFilter = 'all' | 'announcement' | 'purify';

export const getAssetSourceMeta = (tags: string[]) => {
    if (tags.includes(ASSET_SOURCE_TAGS.announcement)) {
        return {
            filter: 'announcement' as const,
            label: ASSET_SOURCE_TAGS.announcement,
            color: 'blue' as const,
        };
    }

    if (tags.includes(ASSET_SOURCE_TAGS.purify)) {
        return {
            filter: 'purify' as const,
            label: ASSET_SOURCE_TAGS.purify,
            color: 'green' as const,
        };
    }

    return null;
};
