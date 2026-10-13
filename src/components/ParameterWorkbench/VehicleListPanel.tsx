import React, { useMemo } from 'react';
import { Spin, Button, Tag } from 'antd';
import { LoadingOutlined, MinusOutlined, ArrowRightOutlined, InboxOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getProductData } from '../../store/vehicleSelectors';
import { isFieldRequired } from '../../assets/requiredFields';
import { buildVehicleDisplayLabels, buildVehicleInstanceKey, getVehicleInstanceMetaFromParam } from '../../utils/vehicleInstance';
import AssetStatsBadge from './AssetStatsBadge';
import type { AssetLibrarySnapshot } from '../../hooks/useAssetLibrarySnapshot';
import { useAssetAliasResolver } from '../../hooks/useAssetAliasResolver';

interface VehicleSummary {
    key: string;
    name: string;
    totalParams: number;
    filledParams: number;
    source: 'excel' | 'asset';
    originalFile: string;
}

interface VehicleListPanelProps {
    /** 点车卡反向定位：资产车滚动到左栏对应行并切换摘要卡（设计文档 §3.2/§3.5） */
    onLocateAsset: (fileName: string) => void;
    /** 打开资产检查器（instanceKey） */
    onOpenInspector: (instanceKey: string) => void;
    onGoCompare: () => void;
    snapshot: AssetLibrarySnapshot;
}

/**
 * 「待分析车型」购物车（设计文档 §3.2 下段）。
 * 只做工作集展示与移出；「备选/已过滤车型」区块与只读详情抽屉已退役
 * （前者一半是死概念、与左栏重复；后者被资产检查器取代）。
 */
const VehicleListPanel: React.FC<VehicleListPanelProps> = ({ onLocateAsset, onOpenInspector, onGoCompare, snapshot }) => {
    const {
        uploadedFiles,
        assetFiles,
        selectedProductNames,
        setSelectedProductNames,
        setCompareProducts,
        activeAssets,
        removeActiveAsset,
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        selectedProductNames: state.selectedProductNames,
        setSelectedProductNames: state.setSelectedProductNames,
        setCompareProducts: state.setCompareProducts,
        activeAssets: state.activeAssets,
        removeActiveAsset: state.removeActiveAsset,
    })));

    const loading = snapshot.loading;
    // 资产来源的车辆摘要从快照派生（infos 扫描由 useAssetLibrarySnapshot 统一提供）
    const assetData = useMemo<VehicleSummary[]>(() => snapshot.infos
        .filter(info => activeAssets.includes(info.fileName))
        .map(info => ({
            key: buildVehicleInstanceKey('asset', info.fileName, info.productName),
            name: info.productName,
            totalParams: info.totalParams,
            filledParams: info.filledParams,
            source: 'asset' as const,
            originalFile: info.fileName,
        })), [snapshot.infos, activeAssets]);

    const vehicles: VehicleSummary[] = useMemo(() => {
        const products = new Map<string, VehicleSummary>();

        uploadedFiles.forEach(fileData => {
            fileData.data.forEach(param => {
                const identity = getVehicleInstanceMetaFromParam('excel', fileData, param);
                const existing = products.get(identity.key);
                if (!existing) {
                    products.set(identity.key, {
                        key: identity.key,
                        name: identity.productName,
                        totalParams: 0,
                        filledParams: 0,
                        source: 'excel',
                        originalFile: fileData.fileName,
                    });
                }

                const current = products.get(identity.key)!;
                current.totalParams += 1;
                if (param.value !== undefined && param.value !== null && String(param.value).trim() !== '') {
                    current.filledParams += 1;
                }
            });
        });

        assetData.forEach(asset => {
            if (!products.has(asset.key)) products.set(asset.key, asset);
        });

        return Array.from(products.values());
    }, [uploadedFiles, assetData]);

    // memo 化：否则每次 render 生成新数组，导致下游计算 useMemo 全失效
    const activeVehicles = useMemo(() => vehicles.filter(vehicle =>
        selectedProductNames.includes(vehicle.key)
    ), [vehicles, selectedProductNames]);
    const { resolver: aliasResolver } = useAssetAliasResolver();
    const vehicleDisplayLabels = useMemo(
        () => buildVehicleDisplayLabels(vehicles.map((vehicle) => vehicle.key), aliasResolver),
        [vehicles, aliasResolver]
    );

    const vehicleDetails = useMemo(() => {
        return activeVehicles.map(vehicle => {
            const params = getProductData(uploadedFiles, vehicle.key, assetFiles);
            const total = params.length || vehicle.totalParams;
            const filled = params.length > 0
                ? params.filter(param => param.value !== undefined && param.value !== null && String(param.value).trim() !== '').length
                : vehicle.filledParams;
            const requiredMissing = params.filter(param => {
                const value = String(param.value ?? '').trim();
                return isFieldRequired(param.name) && value === '';
            });
            return { ...vehicle, totalParams: total, filledParams: filled, requiredMissing };
        });
    }, [activeVehicles, uploadedFiles, assetFiles]);

    const handleQuickCompare = (instanceKey: string) => {
        setCompareProducts([instanceKey]);
        onGoCompare();
    };

    // 移出工作集：资产车双删（activeAssets + 工作集），本地车只移出工作集
    const handleRemove = (vehicle: VehicleSummary) => {
        if (vehicle.source === 'asset') {
            removeActiveAsset(vehicle.originalFile, vehicle.name);
        } else {
            setSelectedProductNames(selectedProductNames.filter(key => key !== vehicle.key));
        }
    };

    const handleClearWorkspace = () => {
        snapshot.infos
            .filter(info => activeAssets.includes(info.fileName))
            .forEach(info => removeActiveAsset(info.fileName, info.productName));
        setSelectedProductNames([]);
    };

    // 点车卡：资产车 → 左栏定位 + 摘要卡切换；本地车（无左栏目标）→ 直接开检查器
    const handleCardClick = (vehicle: VehicleSummary) => {
        if (vehicle.source === 'asset') {
            onLocateAsset(vehicle.originalFile);
        } else {
            onOpenInspector(vehicle.key);
        }
    };

    return (
        <div className="flex flex-col h-full surface-container">
                <div className="flex-none p-4 border-b border-default surface-inset">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-[16px] font-bold text-1 m-0">待分析车型</h3>
                        <div className="flex items-center gap-3">
                            {vehicleDetails.length > 0 && (
                                <Button size="small" onClick={handleClearWorkspace}>
                                    清空工作区车型
                                </Button>
                            )}
                            <div className="text-right">
                                <div className="text-stat text-1 tabular-nums">{vehicleDetails.length}</div>
                                <div className="text-[12px] text-3">已激活</div>
                            </div>
                        </div>
                    </div>
                </div>

            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar flex flex-col surface-layout">
                {loading ? (
                    <div className="py-12 flex justify-center">
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    </div>
                ) : vehicleDetails.length > 0 ? (
                    <div className="space-y-2.5 flex-1">
                        {vehicleDetails.map(vehicle => (
                            <div
                                key={vehicle.key}
                                onClick={() => handleCardClick(vehicle)}
                                className="@container rounded-lg border px-4 py-3 cursor-pointer active:scale-[0.98] transition-transform surface-container border-default hover:border-line-strong"
                            >
                                <div className="flex items-center justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div
                                                className="font-semibold text-sm truncate text-1"
                                                title={vehicleDisplayLabels.get(vehicle.key)?.fullLabel || vehicle.name}
                                            >
                                                {vehicleDisplayLabels.get(vehicle.key)?.shortLabel || vehicle.name}
                                            </div>
                                            <Tag className={`m-0 text-[12px] leading-4 border-0 ${vehicle.source === 'asset' ? 'src-asset' : 'src-excel'}`}>
                                                {vehicle.source === 'asset' ? '资产库' : '本地'}
                                            </Tag>
                                            {vehicle.requiredMissing.length > 0 && (
                                                <Tag color="error" className="m-0 text-[12px] leading-4">缺必填 {vehicle.requiredMissing.length}</Tag>
                                            )}
                                        </div>
                                        <div className="mt-1 text-[12px] text-3 truncate" title={vehicle.originalFile}>
                                            @{vehicle.originalFile}
                                        </div>
                                    </div>

                                    <AssetStatsBadge totalParams={vehicle.totalParams} filledParams={vehicle.filledParams} />

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <Button
                                            size="small"
                                            type="primary"
                                            icon={<ArrowRightOutlined />}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleQuickCompare(vehicle.key);
                                            }}
                                        >
                                            对比
                                        </Button>
                                        <Button
                                            type="text"
                                            size="small"
                                            title="查看详情"
                                            icon={<InfoCircleOutlined className="text-2" />}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onOpenInspector(vehicle.key);
                                            }}
                                            className="w-8 h-8 p-0 min-w-0 flex items-center justify-center rounded-lg border border-default hover:border-brand"
                                        />
                                        <Button
                                            type="text"
                                            size="small"
                                            title="移出工作集"
                                            icon={<MinusOutlined className="text-2" />}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                handleRemove(vehicle);
                                            }}
                                            className="w-8 h-8 p-0 min-w-0 flex items-center justify-center rounded-lg border border-default hover:border-brand"
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="py-10 text-center border-2 border-dashed border-default rounded-xl m-2 surface-inset flex-1 flex flex-col items-center justify-center min-h-[220px]">
                        <InboxOutlined className="text-3xl text-4 mb-3" />
                        <span className="text-2 text-[13px]">当前没有激活的车型工作集</span>
                        <span className="text-3 text-xs mt-1.5">在左侧资产卡上点 ＋，把车型加入工作集</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VehicleListPanel;
