import React, { useState, useEffect, useMemo } from 'react';
import { Spin, Button, Tooltip, Collapse } from 'antd';
import { LoadingOutlined, PlusOutlined, MinusOutlined, DatabaseOutlined } from '@ant-design/icons';
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
        ignoredProductNames
    } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        selectedProductNames: state.selectedProductNames,
        setSelectedProductNames: state.setSelectedProductNames,
        assetLibraryPath: state.assetLibraryPath,
        activeAssets: state.activeAssets,
        ignoredProductNames: state.ignoredProductNames
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
    }, [assetLibraryPath, activeAssets, selectedProductNames]);

    // 计算当前要渲染的车型列表
    const vehicles: VehicleSummary[] = useMemo(() => {
        const products = new Map<string, VehicleSummary>();
        
        // Excel
        uploadedFiles.forEach(fileData => {
            fileData.data.forEach(p => {
                const pName = p.productName || fileData.fileName;
                const existing = products.get(pName);
                if (!existing) {
                    products.set(pName, {
                        name: pName,
                        totalParams: 0,
                        filledParams: 0,
                        source: 'excel',
                        originalFile: fileData.fileName
                    });
                }

                const current = products.get(pName)!;
                current.totalParams += 1;
                if (p.value !== undefined && p.value !== null && String(p.value).trim() !== '') {
                    current.filledParams += 1;
                }
            });
        });

        // Assets
        assetData.forEach(ad => {
            if (!products.has(ad.name)) products.set(ad.name, ad);
        });

        return Array.from(products.values());
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

    // 主列表仅显示【正在分析的工作集】内的车型
    const activeVehicles = vehicles.filter(v => selectedProductNames.includes(v.name) && !ignoredProductNames.includes(v.name));
    // 待分析列表显示【已加载但未勾选】或【已忽略】的车型
    const inactiveVehicles = vehicles.filter(v => !selectedProductNames.includes(v.name) || ignoredProductNames.includes(v.name));

    // 焦点自动流转逻辑：如果当前聚焦的车型被移出了，自动跳到下一个
    useEffect(() => {
        if (focusedProduct && activeVehicles.length > 0) {
            const stillActive = activeVehicles.some(v => v.name === focusedProduct);
            if (!stillActive) {
                onFocusProduct(activeVehicles[0].name);
            }
        }
    }, [activeVehicles, focusedProduct, onFocusProduct]);

    const handleToggle = (name: string, checked: boolean) => {
        if (checked) {
            setSelectedProductNames([...selectedProductNames, name]);
        } else {
            setSelectedProductNames(selectedProductNames.filter(n => n !== name));
        }
    };

    return (
        <div className="flex flex-col h-full bg-white">
            <div className="flex-none p-5 border-b border-slate-200/60 bg-white/50 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                    <h3 className="text-[15px] font-bold text-slate-800 m-0 tracking-tight">
                        待分析车型大纲
                    </h3>
                </div>
                <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider">Gathered {activeVehicles.length} effective datasets</p>
            </div>

            <div className="flex-1 p-3 overflow-y-auto custom-scrollbar flex flex-col bg-slate-50/20">
                {loading ? (
                    <div className="py-12 flex justify-center">
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
                    </div>
                ) : activeVehicles.length > 0 ? (
                    <div className="space-y-2 flex-1">
                        {activeVehicles.map(v => {
                            const isFocused = focusedProduct === v.name;
                            const isSelected = selectedProductNames.includes(v.name);
                            const fillRate = v.totalParams > 0 ? Math.round((v.filledParams / v.totalParams) * 100) : 0;
                            
                            return (
                                <div 
                                    key={v.name}
                                    onClick={() => onFocusProduct(v.name)}
                                    className={`group flex items-center justify-between py-3.5 px-4 rounded-xl border cursor-pointer transition-all duration-300 ${
                                        !isSelected
                                            ? 'bg-white border-slate-100 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 hover:border-blue-200'
                                            : isFocused 
                                                ? 'bg-blue-600 border-blue-600 shadow-lg shadow-blue-500/20 -translate-y-0.5' 
                                                : 'bg-white border-slate-200/80 hover:border-blue-300 hover:shadow-md hover:-translate-y-0.5'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex flex-col min-w-0">
                                            <span className={`text-[14px] truncate tracking-tight transition-colors ${isFocused ? 'font-bold text-white' : 'font-semibold text-slate-800'}`}>
                                                {v.name}
                                            </span>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                {v.source === 'asset' ? (
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase transition-colors ${isFocused ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-600'}`}>Asset</span>
                                                ) : (
                                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase transition-colors ${isFocused ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-600'}`}>Local</span>
                                                )}
                                                <span className={`text-[10px] truncate opacity-60 transition-colors ${isFocused ? 'text-white/80' : 'text-slate-400 font-medium'}`}>@{v.originalFile}</span>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                                        <div className={`flex flex-col items-end gap-0.5 transition-colors ${isFocused ? 'text-white' : ''}`}>
                                            <div className="flex items-center gap-1.5">
                                                <span className={`text-[13px] font-bold font-mono ${isFocused ? 'text-white' : fillRate === 100 ? 'text-emerald-500' : 'text-slate-700'}`}>
                                                    {fillRate}%
                                                </span>
                                            </div>
                                            <span className={`text-[10px] font-medium font-mono opacity-50 ${isFocused ? 'text-white' : 'text-slate-400'}`}>{v.totalParams} Items</span>
                                        </div>
                                        
                                        <div className="flex items-center gap-1 border-l border-white/20 pl-2 ml-2 transition-opacity duration-200 opacity-0 group-hover:opacity-100">
                                            <Tooltip title={isSelected ? "移出工作集" : "恢复至工作集"}>
                                                <Button 
                                                    type="text" 
                                                    size="small"
                                                    icon={isSelected 
                                                        ? <MinusOutlined className={isFocused ? "text-white" : "text-slate-400"} /> 
                                                        : <PlusOutlined className="text-blue-500" />
                                                    }
                                                    onClick={(e) => { e.stopPropagation(); handleToggle(v.name, !isSelected); }}
                                                    className={`w-7 h-7 p-0 min-w-0 flex items-center justify-center rounded-lg transition-colors ${
                                                        isFocused ? 'hover:bg-white/20' : isSelected ? 'hover:bg-slate-100' : 'bg-blue-50 border border-blue-100'
                                                    }`}
                                                />
                                            </Tooltip>
                                        </div>
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
                
                {/* 底部折叠区：备选车型与已过滤数据 */}
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
                                        <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                                            {inactiveVehicles.map(v => (
                                                <div 
                                                    key={v.name} 
                                                    onClick={() => handleToggle(v.name, true)}
                                                    className="flex items-center justify-between py-2 px-3 rounded-lg border border-dashed border-slate-200 bg-white/50 hover:bg-white hover:border-blue-200 cursor-pointer group/item transition-all"
                                                >
                                                    <div className="flex flex-col min-w-0">
                                                        <span className={`text-[12px] truncate ${ignoredProductNames.includes(v.name) ? 'text-slate-300 line-through' : 'text-slate-500 font-medium'}`}>
                                                            {v.name}
                                                        </span>
                                                        <span className="text-[9px] text-slate-400">@{v.originalFile}</span>
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
        </div>
    );
};

export default VehicleListPanel;
