import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../store/vehicleStore';
import { getProductData } from '../store/vehicleSelectors';
import { loadAssetFile } from '../utils/assetManager';
import { parseVehicleInstanceKey } from '../utils/vehicleInstance';
import type { VehicleParameter } from '../types';

/**
 * 取某辆车的参数明细：store 已加载（工作区车辆）直接读；否则对资产按需读盘。
 * 摘要卡与资产检查器共用（设计文档 §3.3 参数预览按需加载）。
 * 懒加载结果按加载键存；键不匹配返回空数组，不在 effect 里同步写状态。
 */
export function useVehicleParams(instanceKey: string | null): VehicleParameter[] {
    const { uploadedFiles, assetFiles, assetLibraryPath, assetVersion } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        assetLibraryPath: state.assetLibraryPath,
        assetVersion: state.assetVersion,
    })));
    const fromStore = instanceKey ? getProductData(uploadedFiles, instanceKey, assetFiles) : [];
    const [lazy, setLazy] = useState<{ key: string; params: VehicleParameter[] } | null>(null);
    const loadKey = instanceKey ? `${assetLibraryPath ?? ''}\u0000${assetVersion}\u0000${instanceKey}` : '';

    useEffect(() => {
        const parsed = instanceKey ? parseVehicleInstanceKey(instanceKey) : null;
        if (!instanceKey || fromStore.length > 0 || parsed?.source !== 'asset' || !assetLibraryPath) return;
        let cancelled = false;
        (async () => {
            const loaded = await loadAssetFile(assetLibraryPath, parsed.fileName);
            if (!cancelled) setLazy({ key: loadKey, params: loaded?.data ?? [] });
        })();
        return () => { cancelled = true; };
    }, [instanceKey, assetLibraryPath, assetVersion, loadKey, fromStore.length]);

    if (fromStore.length > 0) return fromStore;
    return lazy?.key === loadKey ? lazy.params : [];
}
