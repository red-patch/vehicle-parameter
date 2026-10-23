import React, { useMemo, useCallback } from 'react';
import { Button } from 'antd';
import { ArrowRightOutlined, InboxOutlined, CloseOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../../store/vehicleStore';
import { useAssetLibrarySnapshot } from '../../../hooks/useAssetLibrarySnapshot';
import { buildVehicleInstanceKey, getVehicleInstanceMetaFromParam } from '../../../utils/vehicleInstance';
import { isFieldRequired } from '../../../assets/requiredFields';
import { getProductData } from '../../../store/vehicleSelectors';
import { buildAliasSource, resolveAssetDisplayName } from '../../../utils/assetAlias';
import AssetCartCard from './AssetCartCard';
import { useClearWorkspace } from './useClearWorkspace';

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
    /** 收起浮层（浮动购物车模式） */
    onClose?: () => void;
}

const AssetCart: React.FC<AssetCartProps> = ({ onFocusFile, onLocateAsset, onGoCompare, onClose }) => {
    const {
        removeActiveAsset,
        setCompareProducts,
        setSelectedProductNames,
        selectedProductNames,
        uploadedFiles,
        assetFiles,
    } = useVehicleStore(useShallow(state => ({
        removeActiveAsset: state.removeActiveAsset,
        setCompareProducts: state.setCompareProducts,
        setSelectedProductNames: state.setSelectedProductNames,
        selectedProductNames: state.selectedProductNames,
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
    })));
    const snapshot = useAssetLibrarySnapshot();
    const clearWorkspace = useClearWorkspace();

    // 工作集 = 本地 Excel 车 + 资产车，再按 selectedProductNames 过滤
    // （与胶囊计数同口径；原 VehicleListPanel 语义）
    const aliasSource = useMemo(
        () => buildAliasSource(snapshot.infos, snapshot.meta, snapshot.latestSet),
        [snapshot.infos, snapshot.meta, snapshot.latestSet],
    );
    const activeVehicles = useMemo(() => {
        type Row = {
            key: string; fileName: string; productName: string; displayName: string;
            totalParams: number; filledParams: number; requiredMissing: number;
            source: 'asset' | 'excel';
        };
        const byKey = new Map<string, Row>();

        // 1) 本地 Excel 车
        uploadedFiles.forEach(fileData => {
            fileData.data.forEach(param => {
                const identity = getVehicleInstanceMetaFromParam('excel', fileData, param);
                let row = byKey.get(identity.key);
                if (!row) {
                    row = {
                        key: identity.key, fileName: fileData.fileName, productName: identity.productName,
                        displayName: identity.productName, totalParams: 0, filledParams: 0,
                        requiredMissing: 0, source: 'excel',
                    };
                    byKey.set(identity.key, row);
                }
                row.totalParams += 1;
                if (param.value !== undefined && param.value !== null && String(param.value).trim() !== '') {
                    row.filledParams += 1;
                }
                if (isFieldRequired(param.name) && String(param.value ?? '').trim() === '') {
                    row.requiredMissing += 1;
                }
            });
        });

        // 2) 资产车（资产版优先，不进同键覆盖本地车）
        snapshot.infos.forEach(info => {
            const instanceKey = buildVehicleInstanceKey('asset', info.fileName, info.productName);
            if (!byKey.has(instanceKey)) {
                const params = getProductData(uploadedFiles, instanceKey, assetFiles);
                byKey.set(instanceKey, {
                    key: instanceKey, fileName: info.fileName, productName: info.productName,
                    displayName: resolveAssetDisplayName(info, aliasSource),
                    totalParams: info.totalParams, filledParams: info.filledParams,
                    requiredMissing: params.filter(p => isFieldRequired(p.name) && String(p.value ?? '').trim() === '').length,
                    source: 'asset',
                });
            }
        });

        // 3) 只保留在工作集（selectedProductNames）中的
        return Array.from(byKey.values()).filter(v => selectedProductNames.includes(v.key));
    }, [snapshot.infos, aliasSource, uploadedFiles, assetFiles, selectedProductNames]);

    // 点车卡：资产车反向定位；本地 Excel 车无左栏目标，仅选中
    const handleCardClick = useCallback((source: 'asset' | 'excel', fileName: string) => {
        if (source === 'asset') {
            onFocusFile(fileName);
            onLocateAsset?.(fileName);
        }
    }, [onFocusFile, onLocateAsset]);

    // 移出工作集：资产车双删（activeAssets + 工作集），本地车只移出工作集
    const handleRemove = useCallback((source: 'asset' | 'excel', fileName: string, productName: string) => {
        if (source === 'asset') {
            removeActiveAsset(fileName, productName);
        } else {
            const key = buildVehicleInstanceKey('excel', fileName, productName);
            setSelectedProductNames(selectedProductNames.filter(k => k !== key));
        }
    }, [removeActiveAsset, setSelectedProductNames, selectedProductNames]);

    // 去对比
    const handleGoCompare = useCallback(() => {
        const keys = activeVehicles.map(v => v.key);
        if (keys.length > 0) {
            setCompareProducts(keys);
            onGoCompare?.();
        }
    }, [activeVehicles, setCompareProducts, onGoCompare]);

    // 清空工作区（资产车 + 本地车一起清）——与胶囊上的清空键同一动作，
    // 一次性清空 + toast 可撤销（逐个 removeActiveAsset 会触发 N 次磁盘同步）
    const handleClearAll = clearWorkspace;

    return (
        <div className="h-full flex flex-col surface-container">
            {/* 头部 */}
            <div className="flex-none px-4 py-3 border-b border-default flex items-center justify-between">
                <span className="text-title text-1">已选工作集</span>
                <div className="flex items-center gap-2">
                    {activeVehicles.length > 0 && (
                        <Button size="small" onClick={handleClearAll}>
                            清空
                        </Button>
                    )}
                    <span className="text-caption text-3 tabular-nums">
                        {activeVehicles.length} 台车
                    </span>
                    {onClose && (
                        <button
                            className="w-5 h-5 rounded flex items-center justify-center text-3 hover:text-1 hover:surface-inset transition-colors duration-150"
                            style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                            onClick={onClose}
                            title="收起"
                        >
                            <CloseOutlined className="text-[11px]" />
                        </button>
                    )}
                </div>
            </div>

            {/* 车卡列表 */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3">
                {activeVehicles.length > 0 ? (
                    <div className="space-y-2">
                        {activeVehicles.map(vehicle => (
                            <AssetCartCard
                                key={vehicle.key}
                                vehicle={vehicle}
                                onRemove={() => handleRemove(vehicle.source, vehicle.fileName, vehicle.productName)}
                                onClick={() => handleCardClick(vehicle.source, vehicle.fileName)}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center border border-dashed border-default rounded-lg surface-inset flex flex-col items-center justify-center min-h-[200px]">
                        <InboxOutlined className="text-3xl text-4 mb-3" />
                        <span className="text-2 text-body">当前没有激活的车型工作集</span>
                        <span className="text-3 text-caption mt-1.5">在左侧资产卡上点 ＋，把车型加入工作集</span>
                    </div>
                )}
            </div>

            {/* 底部 CTA */}
            {activeVehicles.length > 0 && (
                <div className="flex-none px-3 py-3 border-t border-default">
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
