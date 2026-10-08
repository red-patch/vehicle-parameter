import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../store/vehicleStore';
import { getAssetFilesWithInfo, loadAssetMeta, loadAssetTags, type AssetFileInfo, type AssetMetaMap } from '../utils/assetManager';
import { buildGovernanceReport, extractBrandNames } from '../utils/assetGovernance';
import { getAssetTagGroupsSync } from '../utils/assetTagGroups';

/**
 * 资产库快照（infos + 标签 + 治理元数据 + 每车链头集合）：右栏摘要卡与资产检查器共用。
 *
 * 与 DataSourcePanel 的扫描相互独立（各自 effect 各自拉取），换取零耦合；
 * 刷新信号同为 store 的 assetVersion —— 对象级动作（useAssetActions）落盘后自动刷新。
 */
export interface AssetLibrarySnapshot {
    infos: AssetFileInfo[];
    tags: Record<string, string[]>;
    meta: AssetMetaMap;
    /** 每车版本链链头（最新版）文件名集合 */
    latestSet: Set<string>;
    loading: boolean;
}

const EMPTY_SNAPSHOT: AssetLibrarySnapshot = {
    infos: [],
    tags: {},
    meta: {},
    latestSet: new Set(),
    loading: false,
};

export function useAssetLibrarySnapshot(): AssetLibrarySnapshot {
    const { assetLibraryPath, assetVersion } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        assetVersion: state.assetVersion,
    })));
    // 按加载键（路径+版本）存结果：键不匹配 = 还在加载（loading 由键派生，不在 effect 里同步写状态）
    const [loaded, setLoaded] = useState<{ key: string; snapshot: AssetLibrarySnapshot } | null>(null);
    const key = assetLibraryPath ? `${assetLibraryPath}\u0000${assetVersion}` : '';

    useEffect(() => {
        if (!assetLibraryPath) return;
        let cancelled = false;
        (async () => {
            try {
                const [infos, tags, meta] = await Promise.all([
                    getAssetFilesWithInfo(assetLibraryPath),
                    loadAssetTags(assetLibraryPath),
                    loadAssetMeta(assetLibraryPath),
                ]);
                if (cancelled) return;
                const brandNames = extractBrandNames(getAssetTagGroupsSync().groups);
                const latestSet = new Set(buildGovernanceReport(
                    infos, meta, brandNames, info => info.announceNos || [],
                ).latestFileNames);
                setLoaded({ key, snapshot: { infos, tags, meta, latestSet, loading: false } });
            } catch (e) {
                console.error('加载资产库快照失败', e);
                if (!cancelled) setLoaded({ key, snapshot: EMPTY_SNAPSHOT });
            }
        })();
        return () => { cancelled = true; };
    }, [assetLibraryPath, assetVersion, key]);

    if (!assetLibraryPath) return EMPTY_SNAPSHOT;
    return loaded?.key === key ? loaded.snapshot : { ...EMPTY_SNAPSHOT, loading: true };
}
