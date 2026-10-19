/**
 * 资产池空状态种类判定（纯函数，供 AssetPoolEmptyState 与单测共用）。
 *
 * 顺序有意义：没目录时谈不上「加载中」或「筛选无结果」；加载中不能误报「资产库为空」。
 */
export type AssetPoolEmptyKind = 'noLibrary' | 'loading' | 'noMatch' | 'emptyLibrary';

export function resolveAssetPoolEmptyKind(input: {
    libraryPath: string | null | undefined;
    loading: boolean;
    hasActiveFilters: boolean;
}): AssetPoolEmptyKind {
    if (!input.libraryPath) return 'noLibrary';
    if (input.loading) return 'loading';
    if (input.hasActiveFilters) return 'noMatch';
    return 'emptyLibrary';
}
