import React, { useEffect } from 'react';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { loadAssetFile } from '../../utils/assetManager';
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
            } catch (err) {
                console.error("AssetDataSynchronizer failed to sync", err);
            }
        };

        syncData();
    }, [activeAssets, assetLibraryPath]);

    return null; // 背景组件，不渲染 UI
};

export default AssetDataSynchronizer;
