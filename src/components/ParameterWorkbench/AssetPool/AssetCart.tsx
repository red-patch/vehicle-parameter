import React, { useMemo, useCallback } from 'react';
import { Button } from 'antd';
import { ArrowRightOutlined, InboxOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../../store/vehicleStore';
import { useAssetLibrarySnapshot } from '../../../hooks/useAssetLibrarySnapshot';
import { buildVehicleInstanceKey } from '../../../utils/vehicleInstance';
import { isFieldRequired } from '../../../assets/requiredFields';
import { getProductData } from '../../../store/vehicleSelectors';
import AssetCartCard from './AssetCartCard';

/**
 * 右栏购物车（设计文档 2026-10-13-asset-panel-redesign-v2 §4.3）：
 * 已选工作集列表 + 去对比 CTA
 *
 * M3：接入交互 — 点车卡反向定位、移出工作集、去对比跳转。
 */
export interface AssetCartProps {
    focusedFile: string | null;
    onFocusFile: (fileName: string | null) => void;
    onLocateAsset?: (fileName: string) => void;
    onGoCompare?: () => void;
}

const AssetCart: React.FC<AssetCartProps> = ({ onFocusFile, onLocateAsset, onGoCompare }) => {
    const {
        activeAssets,
        removeActiveAsset,
        setCompareProducts,
        uploadedFiles,
        assetFiles,
    } = useVehicleStore(useShallow(state => ({
        activeAssets: state.activeAssets,
        removeActiveAsset: state.removeActiveAsset,
        setCompareProducts: state.setCompareProducts,
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
    })));
    const snapshot = useAssetLibrarySnapshot();

    // 已激活的资产（含完成率/缺必填）
    const activeVehicles = useMemo(() => {
        return snapshot.infos
            .filter(info => activeAssets.includes(info.fileName))
            .map(info => {
                const instanceKey = buildVehicleInstanceKey('asset', info.fileName, info.productName);
                const params = getProductData(uploadedFiles, instanceKey, assetFiles);
                const requiredMissing = params.filter(p => {
                    const value = String(p.value ?? '').trim();
                    return isFieldRequired(p.name) && value === '';
                }).length;

                return {
                    key: instanceKey,
                    fileName: info.fileName,
                    productName: info.productName,
                    totalParams: info.totalParams,
                    filledParams: info.filledParams,
                    requiredMissing,
                };
            });
    }, [snapshot.infos, activeAssets, uploadedFiles, assetFiles]);

    // 点车卡：反向定位 + 选中
    const handleCardClick = useCallback((fileName: string) => {
        onFocusFile(fileName);
        onLocateAsset?.(fileName);
    }, [onFocusFile, onLocateAsset]);

    // 移出工作集
    const handleRemove = useCallback((fileName: string, productName: string) => {
        removeActiveAsset(fileName, productName);
    }, [removeActiveAsset]);

    // 去对比
    const handleGoCompare = useCallback(() => {
        const keys = activeVehicles.map(v => v.key);
        if (keys.length > 0) {
            setCompareProducts(keys);
            onGoCompare?.();
        }
    }, [activeVehicles, setCompareProducts, onGoCompare]);

    // 清空工作区
    const handleClearAll = useCallback(() => {
        activeVehicles.forEach(v => removeActiveAsset(v.fileName, v.productName));
    }, [activeVehicles, removeActiveAsset]);

    return (
        <div className="h-full flex flex-col bg-[var(--surface)]">
            {/* 头部 */}
            <div className="flex-none px-5 py-4 border-b border-[var(--border)] bg-[var(--bg)] flex items-center justify-between">
                <span className="text-[14px] font-semibold text-1">已选工作集</span>
                <div className="flex items-center gap-2">
                    {activeVehicles.length > 0 && (
                        <Button size="small" onClick={handleClearAll}>
                            清空
                        </Button>
                    )}
                    <span className="text-[11px] text-2 bg-[var(--surface)] px-2 py-1 rounded-[10px] border border-[var(--border)]">
                        {activeVehicles.length} 台车
                    </span>
                </div>
            </div>

            {/* 车卡列表 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
                {activeVehicles.length > 0 ? (
                    <div className="space-y-2">
                        {activeVehicles.map(vehicle => (
                            <AssetCartCard
                                key={vehicle.key}
                                vehicle={vehicle}
                                onRemove={() => handleRemove(vehicle.fileName, vehicle.productName)}
                                onClick={() => handleCardClick(vehicle.fileName)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center border-2 border-dashed border-[var(--border)] rounded-xl bg-[var(--surface-inset)] flex flex-col items-center justify-center min-h-[220px]">
                        <InboxOutlined className="text-3xl text-4 mb-3" />
                        <span className="text-2 text-[13px]">当前没有激活的车型工作集</span>
                        <span className="text-3 text-xs mt-1.5">在左侧资产卡上点 ＋，把车型加入工作集</span>
                    </div>
                )}
            </div>

            {/* 底部 CTA */}
            {activeVehicles.length > 0 && (
                <div className="flex-none px-5 py-4 border-t border-[var(--border)] bg-[var(--bg)]">
                    <Button
                        type="primary"
                        icon={<ArrowRightOutlined />}
                        block
                        onClick={handleGoCompare}
                    >
                        去对比
                    </Button>
                </div>
            )}
        </div>
    );
};

export default AssetCart;
