import { useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../store/vehicleStore';
import { getAssetFilesWithInfo, loadAssetMeta, type AssetFileInfo, type AssetMetaMap } from '../utils/assetManager';
import { buildAliasSource, resolveAssetAlias } from '../utils/assetAlias';
import { buildGovernanceReport, extractBrandNames } from '../utils/assetGovernance';
import { getAssetTagGroupsSync } from '../utils/assetTagGroups';

/**
 * 资产别名解析器（供工作台各显示入口共用：对比表头、车型下拉、对比报告导出）。
 *
 * 与 useAssetLibrarySnapshot 相互独立（各自拉取，零耦合）；刷新信号同为 store 的
 * assetVersion —— 设别名后 bumpAssetVersion()，本 hook 自动重取。
 *
 * 返回 `(fileName, productName) => alias | null`：命中别名/继承别名时给出显示名，否则 null
 * （调用方自行回落产品名）。**只供显示**，绝不参与实例键/身份/归组。
 */
const EMPTY_META: AssetMetaMap = {};
const NO_ALIAS_RESOLVER = (): string | null => null;

export function useAssetAliasResolver(): {
    resolver: (fileName: string) => string | null;
    metaMap: AssetMetaMap;
    loading: boolean;
} {
    const { assetLibraryPath, assetVersion } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        assetVersion: state.assetVersion,
    })));
    const [loaded, setLoaded] = useState<{ key: string; meta: AssetMetaMap; infos: AssetFileInfo[] } | null>(null);
    const key = assetLibraryPath ? `${assetLibraryPath}\u0000${assetVersion}` : '';

    useEffect(() => {
        if (!assetLibraryPath) return;
        let cancelled = false;
        (async () => {
            try {
                const [infos, meta] = await Promise.all([
                    getAssetFilesWithInfo(assetLibraryPath),
                    loadAssetMeta(assetLibraryPath),
                ]);
                if (!cancelled) setLoaded({ key, meta, infos });
            } catch (e) {
                console.error('加载别名解析数据失败', e);
                if (!cancelled) setLoaded({ key, meta: EMPTY_META, infos: [] });
            }
        })();
        return () => { cancelled = true; };
    }, [assetLibraryPath, assetVersion, key]);

    const ready = Boolean(assetLibraryPath) && loaded?.key === key;
    const metaMap = ready ? loaded!.meta : EMPTY_META;

    // 先算出可空的值（不早返回），保证 useMemo 结构稳定，供 React Compiler 保真
    const aliasSource = useMemo(() => {
        if (!ready || !loaded) return null;
        const brandNames = extractBrandNames(getAssetTagGroupsSync().groups);
        const latestSet = new Set(buildGovernanceReport(
            loaded.infos, loaded.meta, brandNames, info => info.announceNos || [],
        ).latestFileNames);
        return buildAliasSource(loaded.infos, loaded.meta, latestSet);
    }, [ready, loaded]);

    // 走完整解析（自身 → 同身份键继承），与资产页显示口径一致
    const resolver = useMemo(
        () => (aliasSource
            ? (fileName: string) => resolveAssetAlias(fileName, aliasSource)
            : NO_ALIAS_RESOLVER),
        [aliasSource],
    );

    return { resolver, metaMap, loading: Boolean(assetLibraryPath) && !ready };
}
