import React, { useEffect } from 'react';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { loadAssetFile } from '../../utils/assetManager';
import { deriveCanonicalAssetProductNames } from '../../utils/assetKeyHeal';
import type { SheetData } from '../../types';

/**
 * 资产数据自动同步器 (Background Pump)
 * 职责：监听 activeAssets 变化，自动从文件系统读取 JSON 内容并注入 Store
 */
const AssetDataSynchronizer: React.FC = () => {
    const { 
        activeAssets, 
        assetLibraryPath, 
        assetFiles, 
        setAssetFiles 
    } = useVehicleStore(useShallow(state => ({
        activeAssets: state.activeAssets,
        assetLibraryPath: state.assetLibraryPath,
        assetFiles: state.assetFiles,
        setAssetFiles: state.setAssetFiles
    })));

    useEffect(() => {
        const syncData = async () => {
            if (!assetLibraryPath) {
                if (assetFiles.length > 0) setAssetFiles([]);
                return;
            }

            // 1. 识别需要加载的文件
            // 2. 识别需要移除的文件 (当前 assetFiles 中存在但 activeAssets 中没有的)
            
            try {
                const results = await Promise.all(
                    activeAssets.map(async fileName => {
                        try {
                            // 检查是否已经加载过 (轻量优化)
                            const existing = assetFiles.find(f => f.fileName === fileName);
                            if (existing) return existing;

                            // 没加载过，走统一资产加载逻辑，确保 productName 标准化
                            return await loadAssetFile(assetLibraryPath, fileName);
                        } catch (e) {
                            console.warn(`Failed to sync individual asset: ${fileName}`, e);
                            return null;
                        }
                    })
                );

                // 仅保留成功读取的文件，且必须在 activeAssets 名单内
                const finalFiles = results.filter((f): f is SheetData => f !== null && activeAssets.includes(f.fileName));
                
                // 检查内容或数量是否变化，决定是否更新 store
                const currentFileNames = assetFiles.map(f => f.fileName).sort().join(',');
                const nextFileNames = finalFiles.map(f => f.fileName).sort().join(',');

                if (currentFileNames !== nextFileNames) {
                    setAssetFiles(finalFiles);
                }

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
    }, [activeAssets, assetLibraryPath]);

    return null; // 背景组件，不渲染 UI
};

export default AssetDataSynchronizer;
