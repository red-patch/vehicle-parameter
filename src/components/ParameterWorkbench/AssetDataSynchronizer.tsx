import React, { useEffect } from 'react';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
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
                const loadedFiles = await Promise.all(
                    activeAssets.map(async fileName => {
                        // 检查是否已经加载过 (轻量优化)
                        const existing = assetFiles.find(f => f.fileName === fileName);
                        if (existing) return existing;

                        // 没加载过，从磁盘读取
                        const fullPath = await join(assetLibraryPath, fileName);
                        const content = await readTextFile(fullPath);
                        const parsed = JSON.parse(content);
                        
                        // 转换为标准 SheetData 格式
                        const sheetData: SheetData = {
                            fileName: fileName,
                            data: parsed.parameters || [],
                            rawHeaders: [] // JSON 资产不需要列头信息
                        };
                        return sheetData;
                    })
                );

                // 过滤掉 activeAssets 之外的过时数据
                const finalFiles = loadedFiles.filter(f => activeAssets.includes(f.fileName));
                
                // 仅在数据真实变化时更新 store，避免无限循环
                if (JSON.stringify(finalFiles.map(f => f.fileName)) !== JSON.stringify(assetFiles.map(f => f.fileName))) {
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
