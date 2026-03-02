import React, { useState, useEffect, useMemo } from 'react';
import { Spin, Tag, Button, Tooltip, Collapse } from 'antd';
import { LoadingOutlined, PlusOutlined, MinusOutlined, CloseOutlined, UndoOutlined, DeleteOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { getAssetFilesWithInfo } from '../../utils/assetManager';

interface VehicleSummary {
    name: string;
    totalParams: number;
    filledParams: number;
    source: 'excel' | 'asset';
    originalFile: string;
}

interface VehicleListPanelProps {
    focusedProduct: string | null;
    onFocusProduct: (productName: string | null) => void;
}

const VehicleListPanel: React.FC<VehicleListPanelProps> = ({ focusedProduct, onFocusProduct }) => {
    const { 
        uploadedFiles, 
        selectedProductNames, 
        setSelectedProductNames,
        assetLibraryPath,
        activeAssets,
        ignoredProductNames,
        toggleIgnoreProduct
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        selectedProductNames: state.selectedProductNames,
        setSelectedProductNames: state.setSelectedProductNames,
        assetLibraryPath: state.assetLibraryPath,
        activeAssets: state.activeAssets,
        ignoredProductNames: state.ignoredProductNames,
        toggleIgnoreProduct: state.toggleIgnoreProduct
    })));

    const [loading, setLoading] = useState(false);
    const [assetData, setAssetData] = useState<VehicleSummary[]>([]);

    useEffect(() => {
        const fetchAsset = async () => {
            if (!assetLibraryPath) return;

            setLoading(true);
            try {
                const infos = await getAssetFilesWithInfo(assetLibraryPath);
                const activeInfos = infos.filter(i => activeAssets.includes(i.fileName));
                const summaries = activeInfos.map(i => ({
                    name: i.productName,
                    totalParams: i.totalParams,
                    filledParams: i.filledParams,
                    source: 'asset' as const,
                    originalFile: i.fileName
                }));
                setAssetData(summaries);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        fetchAsset();
    }, [assetLibraryPath, activeAssets]);

    // 计算当前要渲染的车型列表
    const vehicles: VehicleSummary[] = useMemo(() => {
        const products: VehicleSummary[] = [];
        const seen = new Set<string>();
        
        // Excel
        uploadedFiles.forEach(fileData => {
            fileData.data.forEach(p => {
                const pName = p.productName || fileData.fileName;
                if (!seen.has(pName)) {
                    seen.add(pName);
                    const allParams = fileData.data.filter(item => (item.productName || fileData.fileName) === pName);
                    const total = allParams.length;
                    const filled = allParams.filter(item => item.value !== undefined && item.value !== null && String(item.value).trim() !== '').length;
                    products.push({ name: pName, totalParams: total, filledParams: filled, source: 'excel', originalFile: fileData.fileName });
                }
            });
        });
        // Assets
        assetData.forEach(ad => {
            if (!seen.has(ad.name)) {
                seen.add(ad.name);
                products.push(ad);
            }
        });
        return products;
    }, [uploadedFiles, assetData]);

    // 由于可能是初次点击源，自动默认高亮第一个车型
    useEffect(() => {
        if (vehicles.length > 0 && !focusedProduct) {
            onFocusProduct(vehicles[0].name);
        } else if (vehicles.length > 0 && focusedProduct) {
            // Check if focusedProduct still exists in this new source file
            const exists = vehicles.some(v => v.name === focusedProduct);
            if (!exists) {
                onFocusProduct(vehicles[0].name);
            }
        }
    }, [vehicles, focusedProduct, onFocusProduct]);

    const activeVehicles = vehicles.filter(v => !ignoredProductNames.includes(v.name));
    const ignoredVehicles = vehicles.filter(v => ignoredProductNames.includes(v.name));

    const handleToggle = (name: string, checked: boolean) => {
        if (checked) {
            setSelectedProductNames([...selectedProductNames, name]);
        } else {
            setSelectedProductNames(selectedProductNames.filter(n => n !== name));
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-none p-4 border-b border-slate-200">
                <h3 className="text-[14px] font-bold text-slate-800 m-0 truncate" title="待分析的车型列表">
                    待分析的车型列表
                </h3>
                <p className="text-[11px] text-slate-500 mt-1 mb-0">已集结 {activeVehicles.length} 款有效车型大纲</p>
            </div>

            <div className="flex-1 p-2 overflow-y-auto custom-scrollbar flex flex-col">
                {loading ? (
                    <div className="py-12 flex justify-center">
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    </div>
                ) : activeVehicles.length > 0 ? (
                    <div className="space-y-1.5 flex-1">
                        {activeVehicles.map(v => {
                            const isFocused = focusedProduct === v.name;
                            const isSelected = selectedProductNames.includes(v.name);
                            const fillRate = v.totalParams > 0 ? Math.round((v.filledParams / v.totalParams) * 100) : 0;
                            
                            return (
                                <div 
                                    key={v.name}
                                    onClick={() => onFocusProduct(v.name)}
                                    className={`group flex items-center justify-between py-2.5 px-3 rounded-lg border cursor-pointer transition-all ${
                                        !isSelected
                                            ? 'bg-slate-50/30 border-dashed border-slate-200 opacity-60 hover:opacity-100 hover:border-blue-200'
                                            : isFocused 
                                                ? 'bg-blue-50/60 border-blue-200 shadow-sm ring-1 ring-blue-500/20' 
                                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm'
                                    }`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="flex flex-col min-w-0 pl-1">
                                            <span className={`text-[13px] truncate ${isFocused ? 'font-semibold text-blue-900' : 'text-slate-700'}`}>
                                                {v.name}
                                            </span>
                                            <span className="text-[10px] mt-1 flex gap-1">
                                                {v.source === 'asset' ? (
                                                    <Tag color="green" className="m-0 border-0 text-white bg-emerald-500 rounded-sm leading-[14px] text-[9px] px-1 font-medium">资产</Tag>
                                                ) : (
                                                    <Tag color="blue" className="m-0 border-0 text-white bg-blue-500 rounded-sm leading-[14px] text-[9px] px-1 font-medium">本地</Tag>
                                                )}
                                                <span className="text-slate-300 text-[9px] leading-[14px]">来自: {v.originalFile}</span>
                                            </span>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                                        <div className={`flex items-center gap-1.5 text-[11px] font-mono mr-1 ${!isSelected && 'grayscale'}`}>
                                            <span className={fillRate === 100 ? 'text-emerald-600 font-semibold' : 'text-slate-500'}>
                                                {fillRate}%
                                            </span>
                                            <span className="text-slate-300">|</span>
                                            <span className="text-slate-400">{v.totalParams}</span>
                                        </div>
                                        
                                        <Tooltip title={isSelected ? "移出工作集" : "恢复至工作集"}>
                                            <Button 
                                                type="text" 
                                                size="small"
                                                icon={isSelected 
                                                    ? <MinusOutlined className="text-slate-300 hover:text-orange-400 transition-colors" /> 
                                                    : <PlusOutlined className="text-blue-400" />
                                                }
                                                onClick={(e) => { e.stopPropagation(); handleToggle(v.name, !isSelected); }}
                                                className={`w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md ${
                                                    isSelected ? 'opacity-0 group-hover:opacity-100' : 'bg-blue-50 border border-blue-100'
                                                }`}
                                            />
                                        </Tooltip>
                                        
                                        <Tooltip title="彻底销毁此噪音数据">
                                            <Button 
                                                type="text" 
                                                size="small"
                                                icon={<CloseOutlined className="text-slate-300 hover:text-red-500" />}
                                                onClick={(e) => { e.stopPropagation(); toggleIgnoreProduct(v.name, true); }}
                                                className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100"
                                            />
                                        </Tooltip>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-lg m-2 bg-slate-50/50 flex-1">
                        <span className="text-slate-400 text-[13px]">没有有效的模型大纲</span>
                    </div>
                )}
                
                {/* 底部回收站折叠区 */}
                {ignoredVehicles.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <Collapse 
                            ghost 
                            expandIconPosition="end"
                            items={[
                                {
                                    key: '1',
                                    label: (
                                        <div className="flex items-center gap-2 text-slate-400 font-medium text-[12px]">
                                            <DeleteOutlined /> 已过滤的噪音数据 ({ignoredVehicles.length})
                                        </div>
                                    ),
                                    children: (
                                        <div className="space-y-1.5 opacity-60">
                                            {ignoredVehicles.map(v => (
                                                <div key={v.name} className="flex items-center justify-between py-1.5 px-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/30">
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[12px] truncate text-slate-500 line-through">
                                                            {v.name}
                                                        </span>
                                                    </div>
                                                    <Tooltip title="从回收站还原至主视图">
                                                        <Button 
                                                            type="text" 
                                                            size="small"
                                                            icon={<UndoOutlined className="text-blue-400" />}
                                                            onClick={(e) => { e.stopPropagation(); toggleIgnoreProduct(v.name, false); }}
                                                            className="w-6 h-6 p-0 flex items-center justify-center rounded-md bg-white border border-slate-200 hover:border-blue-300"
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
        </div>
    );
};

export default VehicleListPanel;
