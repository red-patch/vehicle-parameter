import React, { useEffect } from 'react';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { loadAssetFile } from '../../utils/assetManager';
import { deriveCanonicalAssetProductNames } from '../../utils/assetKeyHeal';
import type { SheetData } from '../../types';

/**
 * 资产数据自动同步器 (Background Pump)
 * 职责：监听 activeAssets 与 assetVersion 变化，自动从文件系统读取 JSON 内容并注入 Store。
 *
 * assetVersion 是全局「资产已落盘」信号：对象级动作、批量字段维护等就地改写的资产
 * 会 bump 它。若只监听 activeAssets，就地改写不会改变 activeAssets，同步器不重跑，
 * Store 里的 assetFiles 会停留旧内容 → 版本对比/工作区车辆读到的是改前的值
 * （2026-10-14 报「批量改字段已保存，对比模块仍显空值」即此因）。
 */
const AssetDataSynchronizer: React.FC = () => {
    const {
        activeAssets,
        assetLibraryPath,
        assetVersion,
        setAssetFiles
    } = useVehicleStore(useShallow(state => ({
        activeAssets: state.activeAssets,
        assetLibraryPath: state.assetLibraryPath,
        assetVersion: state.assetVersion,
        setAssetFiles: state.setAssetFiles
    })));

    useEffect(() => {
        const syncData = async () => {
            if (!assetLibraryPath) {
                // 用 getState 读，避免把 assetFiles 放进依赖数组（setAssetFiles 会改它 → 死循环）
                if (useVehicleStore.getState().assetFiles.length > 0) setAssetFiles([]);
                return;
            }

            // 1. 识别需要加载的文件
            // 2. 识别需要移除的文件 (当前 assetFiles 中存在但 activeAssets 中没有的)
            
            try {
                const results = await Promise.all(
                    activeAssets.map(async fileName => {
                        try {
                            // 每次都从磁盘重读：assetVersion 变化意味着资产可能被就地改写
                            // （批量字段维护/数据体检），复用缓存会读到改前的内容
                            return await loadAssetFile(assetLibraryPath, fileName);
                        } catch (e) {
                            console.warn(`Failed to sync individual asset: ${fileName}`, e);
                            return null;
                        }
                    })
                );

                // 仅保留成功读取的文件，且必须在 activeAssets 名单内
                const finalFiles = results.filter((f): f is SheetData => f !== null && activeAssets.includes(f.fileName));

                setAssetFiles(finalFiles);

                // 数据行的 productName 可能与会话里持久化的选择 key 漂移
                // （资产被重新导入/改写过），按当前数据把旧 key 修正回规范产品名
                const canonical = deriveCanonicalAssetProductNames(finalFiles);
                if (Object.keys(canonical).length > 0) {
                    useVehicleStore.getState().healAssetSelectionKeys(canonical);
                }
            } catch (err) {
                console.error("AssetDataSynchronizer failed to sync", err);
            }
        };

        syncData();
    }, [activeAssets, assetLibraryPath, assetVersion, setAssetFiles]);

    return null; // 背景组件，不渲染 UI
};

export default AssetDataSynchronizer;
