import React, { useState, useEffect, useMemo } from 'react';
import { Spin, Button, Tooltip, Collapse, Tag, Drawer, Empty, Progress } from 'antd';
import { LoadingOutlined, PlusOutlined, MinusOutlined, DatabaseOutlined, ArrowRightOutlined, InboxOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getAssetFilesWithInfo } from '../../utils/assetManager';
import { getProductData } from '../../store/vehicleSelectors';
import { isFieldRequired } from '../../assets/requiredFields';
import type { VehicleParameter } from '../../types';
import { buildVehicleInstanceKey, getVehicleInstanceMetaFromParam } from '../../utils/vehicleInstance';

interface VehicleSummary {
    key: string;
    name: string;
    totalParams: number;
    filledParams: number;
    source: 'excel' | 'asset';
    originalFile: string;
}

interface VehicleDetail extends VehicleSummary {
    emptyParams: number;
    fillRate: number;
    requiredMissing: VehicleParameter[];
    groups: { name: string; total: number; filled: number; pct: number }[];
}

interface VehicleListPanelProps {
    focusedProduct: string | null;
    onFocusProduct: (productName: string | null) => void;
    onGoCompare?: () => void;
}

const VehicleListPanel: React.FC<VehicleListPanelProps> = ({ focusedProduct, onFocusProduct, onGoCompare }) => {
    const {
        uploadedFiles,
        assetFiles,
        selectedProductNames,
        setSelectedProductNames,
        setCompareProducts,
        assetLibraryPath,
        activeAssets,
        ignoredProductNames
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetFiles: state.assetFiles,
        selectedProductNames: state.selectedProductNames,
        setSelectedProductNames: state.setSelectedProductNames,
        setCompareProducts: state.setCompareProducts,
        assetLibraryPath: state.assetLibraryPath,
        activeAssets: state.activeAssets,
        ignoredProductNames: state.ignoredProductNames
    })));

    const [loading, setLoading] = useState(false);
    const [assetData, setAssetData] = useState<VehicleSummary[]>([]);
    const [detailOpen, setDetailOpen] = useState(false);

    useEffect(() => {
        const fetchAsset = async () => {
            if (!assetLibraryPath) return;

            setLoading(true);
            try {
                const infos = await getAssetFilesWithInfo(assetLibraryPath);
                const activeInfos = infos.filter(info => activeAssets.includes(info.fileName));
                const summaries = activeInfos.map(info => ({
                    key: buildVehicleInstanceKey('asset', info.fileName, info.productName),
                    name: info.productName,
                    totalParams: info.totalParams,
                    filledParams: info.filledParams,
                    source: 'asset' as const,
                    originalFile: info.fileName
                }));
                setAssetData(summaries);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchAsset();
    }, [assetLibraryPath, activeAssets, selectedProductNames]);

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
                        originalFile: fileData.fileName
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

    useEffect(() => {
        if (vehicles.length > 0 && !focusedProduct) {
            onFocusProduct(vehicles[0].key);
        } else if (vehicles.length > 0 && focusedProduct) {
            const exists = vehicles.some(vehicle => vehicle.key === focusedProduct);
            if (!exists) onFocusProduct(vehicles[0].key);
        }
    }, [vehicles, focusedProduct, onFocusProduct]);

    const activeVehicles = vehicles.filter(vehicle =>
        selectedProductNames.includes(vehicle.key) && !ignoredProductNames.includes(vehicle.key)
    );
    const inactiveVehicles = vehicles.filter(vehicle =>
        !selectedProductNames.includes(vehicle.key) || ignoredProductNames.includes(vehicle.key)
    );

    const activeVehicleDetails = useMemo(() => {
        return activeVehicles.map(vehicle => {
            const params = getProductData(uploadedFiles, vehicle.key, assetFiles);
            const total = params.length || vehicle.totalParams;
            const filled = params.length > 0
                ? params.filter(param => param.value !== undefined && param.value !== null && String(param.value).trim() !== '').length
                : vehicle.filledParams;
            const empty = Math.max(0, total - filled);
            const fillRate = total > 0 ? Math.round((filled / total) * 100) : 0;
            const requiredMissing = params.filter(param => {
                const value = String(param.value ?? '').trim();
                return isFieldRequired(param.name) && value === '';
            });

            const groupMap = new Map<string, { total: number; filled: number }>();
            params.forEach(param => {
                const groupName = param.group || '未分组';
                const current = groupMap.get(groupName) || { total: 0, filled: 0 };
                current.total += 1;
                if (param.value !== undefined && param.value !== null && String(param.value).trim() !== '') {
                    current.filled += 1;
                }
                groupMap.set(groupName, current);
            });

            const groups = Array.from(groupMap.entries())
                .map(([name, group]) => ({
                    name,
                    total: group.total,
                    filled: group.filled,
                    pct: group.total > 0 ? Math.round((group.filled / group.total) * 100) : 0
                }))
                .sort((left, right) => right.total - left.total);

            return {
                ...vehicle,
                totalParams: total,
                filledParams: filled,
                emptyParams: empty,
                fillRate,
                requiredMissing,
                groups,
            } satisfies VehicleDetail;
        });
    }, [activeVehicles, uploadedFiles, assetFiles]);

    const focusedDetail = useMemo(
        () => activeVehicleDetails.find(vehicle => vehicle.key === focusedProduct) || null,
        [activeVehicleDetails, focusedProduct]
    );

    useEffect(() => {
        if (!focusedDetail) {
            setDetailOpen(false);
        }
    }, [focusedDetail]);

    const handleToggle = (instanceKey: string, checked: boolean) => {
        if (checked) {
            setSelectedProductNames([...selectedProductNames, instanceKey]);
        } else {
            setSelectedProductNames(selectedProductNames.filter(productName => productName !== instanceKey));
        }
    };

    const handleQuickCompare = (instanceKey: string) => {
        setCompareProducts([instanceKey]);
        onGoCompare?.();
    };

    const openDetail = (instanceKey: string) => {
        onFocusProduct(instanceKey);
        setDetailOpen(true);
    };

    const closeDetail = () => {
        setDetailOpen(false);
        onFocusProduct(null);
    };

    const handleClearWorkspace = () => {
        setSelectedProductNames([]);
        closeDetail();
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-none p-4 border-b border-slate-200/60 bg-white/70 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                            <h3 className="text-[15px] font-bold text-slate-800 m-0 tracking-tight">待分析车型工作区</h3>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider m-0">
                            Gathered {activeVehicles.length} effective datasets
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {activeVehicles.length > 0 && (
                            <Button size="small" onClick={handleClearWorkspace}>
                                清空工作区车型
                            </Button>
                        )}
                        <div className="text-right">
                            <div className="text-[24px] leading-none font-black text-slate-800">{activeVehicles.length}</div>
                            <div className="text-[10px] uppercase tracking-widest text-slate-400">Active</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar flex flex-col bg-slate-50/20">
                {loading ? (
                    <div className="py-12 flex justify-center">
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    </div>
                ) : activeVehicleDetails.length > 0 ? (
                    <div className="space-y-2.5 flex-1">
                        {activeVehicleDetails.map(vehicle => {
                            const isFocused = focusedProduct === vehicle.key;
                            const isSelected = selectedProductNames.includes(vehicle.key);
                            const fillTone = vehicle.requiredMissing.length > 0
                                ? 'text-red-500'
                                : vehicle.fillRate >= 95
                                    ? 'text-emerald-500'
                                    : 'text-amber-500';

                            return (
                                <div
                                    key={vehicle.key}
                                    onClick={() => openDetail(vehicle.key)}
                                    className={`group rounded-xl border cursor-pointer transition-all duration-200 px-4 py-3 ${
                                        isFocused
                                            ? 'bg-blue-50 border-blue-300 shadow-sm'
                                            : 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className={`font-bold text-[16px] truncate ${isFocused ? 'text-blue-700' : 'text-slate-800'}`} title={vehicle.name}>
                                                    {vehicle.name}
                                                </div>
                                                <Tag color={vehicle.source === 'asset' ? 'green' : 'blue'} className="m-0 text-[10px] leading-4">
                                                    {vehicle.source === 'asset' ? 'ASSET' : 'LOCAL'}
                                                </Tag>
                                                {vehicle.requiredMissing.length > 0 && (
                                                    <Tag color="error" className="m-0 text-[10px] leading-4">缺必填 {vehicle.requiredMissing.length}</Tag>
                                                )}
                                            </div>
                                            <div className="mt-1 text-[11px] text-slate-400 truncate" title={vehicle.originalFile}>
                                                @{vehicle.originalFile}
                                            </div>
                                        </div>

                                        <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-500">
                                            <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 min-w-[76px] text-center">
                                                <div className="text-[10px] uppercase tracking-widest text-slate-400">完成率</div>
                                                <div className={`text-[18px] font-black ${fillTone}`}>{vehicle.fillRate}%</div>
                                            </div>
                                            <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 min-w-[68px] text-center">
                                                <div className="text-[10px] uppercase tracking-widest text-slate-400">参数</div>
                                                <div className="text-[18px] font-black text-slate-800">{vehicle.totalParams}</div>
                                            </div>
                                            <div className="rounded-lg bg-slate-50 border border-slate-100 px-2.5 py-1.5 min-w-[68px] text-center">
                                                <div className="text-[10px] uppercase tracking-widest text-slate-400">空值</div>
                                                <div className="text-[18px] font-black text-slate-500">{vehicle.emptyParams}</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <Button
                                                size="small"
                                                type={isFocused ? 'primary' : 'default'}
                                                icon={<ArrowRightOutlined />}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    handleQuickCompare(vehicle.key);
                                                }}
                                            >
                                                对比
                                            </Button>
                                            <Tooltip title={isSelected ? '移出工作集' : '恢复至工作集'}>
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    icon={isSelected ? <MinusOutlined className="text-slate-500" /> : <PlusOutlined className="text-blue-500" />}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleToggle(vehicle.key, !isSelected);
                                                    }}
                                                    className="w-8 h-8 p-0 min-w-0 flex items-center justify-center rounded-lg border border-slate-200 hover:border-blue-300 hover:bg-blue-50"
                                                />
                                            </Tooltip>
                                        </div>
                                    </div>

                                    <div className="mt-2 flex xl:hidden items-center gap-2 flex-wrap text-[11px] text-slate-500">
                                        <Tag className="m-0">完成率 {vehicle.fillRate}%</Tag>
                                        <Tag className="m-0">参数 {vehicle.totalParams}</Tag>
                                        <Tag className="m-0">空值 {vehicle.emptyParams}</Tag>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-10 text-center border-2 border-dashed border-slate-100 rounded-2xl m-2 bg-slate-50/50 flex-1 flex flex-col items-center justify-center min-h-[220px]">
                        <InboxOutlined className="text-3xl text-slate-300 mb-3" />
                        <span className="text-slate-400 text-[13px]">当前没有激活的车型工作集</span>
                    </div>
                )}

                {inactiveVehicles.length > 0 && (
                    <div className="mt-auto pt-4 border-t border-slate-100">
                        <Collapse
                            ghost
                            expandIconPosition="end"
                            size="small"
                            items={[
                                {
                                    key: '1',
                                    label: (
                                        <div className="flex items-center gap-2 text-slate-400 font-medium text-[12px]">
                                            <DatabaseOutlined /> 备选/已过滤车型 ({inactiveVehicles.length})
                                        </div>
                                    ),
                                    children: (
                                        <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                                            {inactiveVehicles.map(vehicle => (
                                                <div
                                                    key={vehicle.key}
                                                    onClick={() => handleToggle(vehicle.key, true)}
                                                    className="flex items-center justify-between py-2 px-3 rounded-lg border border-dashed border-slate-200 bg-white/50 hover:bg-white hover:border-blue-200 cursor-pointer group/item transition-all"
                                                >
                                                    <div className="flex flex-col min-w-0">
                                                        <span className={`text-[12px] truncate ${ignoredProductNames.includes(vehicle.key) ? 'text-slate-300 line-through' : 'text-slate-500 font-medium'}`}>
                                                            {vehicle.name}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400">@{vehicle.originalFile}</span>
                                                    </div>
                                                    <Tooltip title="恢复至工作进行分析">
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<PlusOutlined className="text-blue-400 group-hover/item:text-blue-600" />}
                                                            className="w-6 h-6 p-0 flex items-center justify-center rounded-md bg-white border border-slate-100 shadow-sm"
                                                        />
                                                    </Tooltip>
                                                </div>
                                            ))}
                                        </div>
                                    ),
                                }
                            ]}
                        />
                    </div>
                )}
            </div>

            <Drawer
                title={focusedDetail ? `车型详情 · ${focusedDetail.name}` : '车型详情'}
                placement="right"
                width={520}
                open={detailOpen && !!focusedDetail}
                onClose={closeDetail}
            >
                {focusedDetail ? (
                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <Tag color={focusedDetail.source === 'asset' ? 'green' : 'blue'} className="m-0">
                                    {focusedDetail.source === 'asset' ? '资产库' : '工作区 Excel'}
                                </Tag>
                                <Tag color={focusedDetail.requiredMissing.length > 0 ? 'error' : 'success'} className="m-0">
                                    {focusedDetail.requiredMissing.length > 0 ? `必填缺失 ${focusedDetail.requiredMissing.length}` : '必填完整'}
                                </Tag>
                            </div>
                            <div className="text-[28px] font-extrabold text-slate-900 leading-tight">{focusedDetail.name}</div>
                            <div className="mt-2 text-[12px] text-slate-400">来源文件：@{focusedDetail.originalFile}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">完成率</div>
                                <div className="text-[30px] font-black text-blue-600">{focusedDetail.fillRate}%</div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">参数总数</div>
                                <div className="text-[30px] font-black text-slate-900">{focusedDetail.totalParams}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">有效值</div>
                                <div className="text-[30px] font-black text-emerald-600">{focusedDetail.filledParams}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4">
                                <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">空值</div>
                                <div className="text-[30px] font-black text-slate-500">{focusedDetail.emptyParams}</div>
                            </div>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3 text-[14px] font-bold text-slate-800">
                                <CheckCircleOutlined className="text-blue-500" /> 分组完成度
                            </div>
                            {focusedDetail.groups.length > 0 ? (
                                <div className="space-y-3">
                                    {focusedDetail.groups.slice(0, 8).map(group => (
                                        <div key={group.name} className="rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm">
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <div className="min-w-0 text-[13px] font-semibold text-slate-700 truncate" title={group.name}>{group.name}</div>
                                                <div className="text-[12px] font-black text-slate-500 whitespace-nowrap">
                                                    {group.pct}%
                                                    <span className="ml-1 font-medium text-slate-300">{group.filled}/{group.total}</span>
                                                </div>
                                            </div>
                                            <Progress percent={group.pct} showInfo={false} strokeColor={group.pct >= 95 ? '#10b981' : group.pct >= 70 ? '#3b82f6' : '#f59e0b'} />
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <Empty description="暂无分组统计" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                            )}
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3 text-[14px] font-bold text-slate-800">
                                <WarningOutlined className="text-red-500" /> 必填缺失
                            </div>
                            {focusedDetail.requiredMissing.length > 0 ? (
                                <div className="flex gap-2 flex-wrap">
                                    {focusedDetail.requiredMissing.slice(0, 16).map(param => (
                                        <Tag key={param.id} color="error" className="m-0">{param.name}</Tag>
                                    ))}
                                </div>
                            ) : (
                                <Tag color="success" className="m-0">当前车型未发现必填缺失</Tag>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => handleQuickCompare(focusedDetail.name)}>
                                送去对比
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Drawer>
        </div>
    );
};

export default VehicleListPanel;
