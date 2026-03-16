import React, { useMemo, useState, useEffect } from 'react';
import { Spin, Tag, Button } from 'antd';
import { BarChartOutlined, WarningOutlined, ArrowRightOutlined, FileTextOutlined, LoadingOutlined, DatabaseOutlined, CheckOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { loadAssetFile, getAssetFilesWithInfo } from '../../utils/assetManager';
import { isFieldRequired } from '../../assets/requiredFields';
import type { VehicleParameter } from '../../types';
import { getVehicleProductName, getVehicleSourceFileName } from '../../utils/vehicleInstance';

interface DataPreviewProps {
    focusedProduct: string | null;
    onGoCompare?: () => void;
}

const DataPreview: React.FC<DataPreviewProps> = ({ focusedProduct, onGoCompare }) => {
    const { uploadedFiles, assetLibraryPath, setCompareProducts } = useVehicleStore(useShallow(state => ({
        uploadedFiles: state.uploadedFiles,
        assetLibraryPath: state.assetLibraryPath,
        setCompareProducts: state.setCompareProducts
    })));

    const [loading, setLoading] = useState(false);
    const [productData, setProductData] = useState<VehicleParameter[] | null>(null);
    const [displaySource, setDisplaySource] = useState<string | null>(null);

    useEffect(() => {
        const fetchProductData = async () => {
            if (!focusedProduct) {
                setProductData(null);
                setDisplaySource(null);
                return;
            }

            // 全局聚合视图情况下的智能探针寻址
            let targetSource: string | null = null;
            const keyedSource = getVehicleSourceFileName(focusedProduct);
            const displayName = getVehicleProductName(focusedProduct);
            const excelFile = keyedSource
                ? uploadedFiles.find(f => f.fileName === keyedSource)
                : uploadedFiles.find(f => f.data.some(p => (p.productName || f.fileName) === focusedProduct));
            if (excelFile) {
                targetSource = excelFile.fileName;
            } else if (assetLibraryPath) {
                // 通过资产库元信息反查 productName → 真实 fileName
                const assetInfos = await getAssetFilesWithInfo(assetLibraryPath);
                const matchingAsset = assetInfos.find(a => a.productName === displayName);
                targetSource = matchingAsset ? matchingAsset.fileName : `${displayName}.json`;
            } else {
                targetSource = `${displayName}.json`;
            }

            setDisplaySource(targetSource);

            // 1. 本地工作区 Excel
            const localExcelFile = uploadedFiles.find(f => f.fileName === targetSource);
            if (localExcelFile) {
                const params = localExcelFile.data.filter(p => (p.productName || localExcelFile.fileName) === displayName);
                setProductData(params);
                return;
            }

            // 2. 资产库
            if (assetLibraryPath) {
                setLoading(true);
                try {
                    const data = await loadAssetFile(assetLibraryPath, targetSource);
                    if (data) {
                        // 资产文件整体归属于该 product，直接使用全部数据
                        setProductData(data.data);
                    } else {
                        setProductData(null);
                    }
                } catch (err) {
                    console.error("Failed to load asset for preview", err);
                    setProductData(null);
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchProductData();
    }, [focusedProduct, uploadedFiles, assetLibraryPath]);

    // 统计数据
    const stats = useMemo(() => {
        if (!productData) return null;
        const total = productData.length;
        const withValue = productData.filter(p => p.value !== undefined && p.value !== null && String(p.value).trim() !== '').length;
        const empty = total - withValue;
        const fillRate = total > 0 ? Math.round((withValue / total) * 100) : 0;

        // 分组统计
        const groups = new Map<string, { total: number; filled: number }>();
        productData.forEach(p => {
            const g = p.group || '未分组';
            if (!groups.has(g)) groups.set(g, { total: 0, filled: 0 });
            const entry = groups.get(g)!;
            entry.total++;
            if (p.value !== undefined && p.value !== null && String(p.value).trim() !== '') {
                entry.filled++;
            }
        });

        // 必填字段缺失
        const requiredMissing = productData.filter(p =>
            isFieldRequired(p.name) &&
            (p.value === undefined || p.value === null || String(p.value).trim() === '')
        );

        return { total, withValue, empty, fillRate, groups, requiredMissing };
    }, [productData]);

    if (!focusedProduct) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50/30">
                <div className="text-center">
                    <FileTextOutlined className="text-4xl text-slate-300 mb-3 block" />
                    <p className="text-[13px] text-slate-400">请选择一个焦点车型以展示详细大纲</p>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
            </div>
        );
    }

    if (!stats || stats.total === 0) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50/30">
                <div className="text-center text-slate-400 text-[13px] p-6 border-2 border-dashed border-slate-200 rounded-xl bg-white">
                    该车型的参数记录为空，或暂不支持预览
                </div>
            </div>
        );
    }

    const groupEntries = Array.from(stats.groups.entries()).sort((a, b) => b[1].total - a[1].total);

    const handleQuickCompare = () => {
        // 将当前预览产品加入对比名单，并切换页面
        setCompareProducts([focusedProduct]);
        if (onGoCompare) onGoCompare();
    };

    return (
        <div className="h-full flex flex-col p-8 overflow-auto bg-white custom-scrollbar">
            {/* 标题 - Dashboard Style */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-slate-100/60 relative">
                <div className="absolute -bottom-px left-0 w-24 h-1 bg-blue-600 rounded-full"></div>
                <div className="min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Tag color="blue" className="m-0 border-0 bg-blue-50 text-blue-600 font-bold uppercase text-[10px] tracking-widest px-2">Data Insight</Tag>
                        <span className="text-[12px] text-slate-400 font-medium">#{displaySource}</span>
                    </div>
                    <h2 className="text-[28px] font-extrabold text-slate-900 m-0 tracking-tight leading-tight truncate" title={focusedProduct!}>
                        {getVehicleProductName(focusedProduct)}
                    </h2>
                </div>
                {onGoCompare && (
                    <Button 
                        type="primary" 
                        size="large"
                        icon={<ArrowRightOutlined />} 
                        onClick={handleQuickCompare}
                        className="shadow-xl shadow-blue-500/30 rounded-xl bg-blue-600 hover:bg-blue-500 hover:-translate-y-0.5 transition-all border-0 h-12 px-6 font-bold"
                    >
                        送去对比
                    </Button>
                )}
            </div>

            {/* 统计卡片 (Modern Mesh Stats) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
                <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 shadow-sm transition-all hover:bg-white hover:shadow-md group">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <DatabaseOutlined className="text-blue-500" /> Total Items
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-slate-900">{stats.total}</span>
                        <span className="text-xs text-slate-400 font-medium font-mono">pcs</span>
                    </div>
                </div>

                <div className="bg-emerald-50/40 rounded-2xl p-5 border border-emerald-100/60 shadow-sm transition-all hover:bg-white hover:shadow-md group">
                    <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <CheckOutlined className="text-emerald-500" /> Completed
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-emerald-600">{stats.withValue}</span>
                        <span className="text-xs text-emerald-400 font-medium font-mono">valid</span>
                    </div>
                </div>

                <div className="bg-slate-50/50 rounded-2xl p-5 border border-slate-100 shadow-sm transition-all hover:bg-white hover:shadow-md group">
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <FileTextOutlined className="text-slate-400" /> Empty Fields
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-slate-400">{stats.empty}</span>
                        <span className="text-xs text-slate-300 font-medium font-mono">null</span>
                    </div>
                </div>

                <div className={`rounded-2xl p-5 border shadow-xl shadow-opacity-10 transition-all hover:-translate-y-1 ${
                    stats.fillRate >= 80 ? 'bg-blue-600 border-blue-600 text-white shadow-blue-500/20' : 
                    stats.fillRate >= 50 ? 'bg-amber-50/50 border-amber-200 text-amber-600 shadow-amber-500/10' : 
                    'bg-red-50 border-red-200 text-red-600 shadow-red-500/10'
                }`}>
                    <div className={`text-[11px] font-bold uppercase tracking-widest mb-2 opacity-80`}>
                        Confidence
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black">{stats.fillRate}</span>
                        <span className="text-lg font-bold">%</span>
                    </div>
                </div>
            </div>

            {/* 必填缺失警告 */}
            {stats.requiredMissing.length > 0 && (
                <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-red-600 text-[14px] font-bold">
                            <WarningOutlined />
                            高危：必填项数据缺失 ({stats.requiredMissing.length})
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {stats.requiredMissing.slice(0, 12).map(p => (
                            <Tag key={p.name} color="error" className="m-0 border-red-200 text-red-600 bg-white">
                                {p.name}
                            </Tag>
                        ))}
                        {stats.requiredMissing.length > 12 && (
                            <Tag className="m-0 bg-red-100/50 text-red-500 border-none">+{stats.requiredMissing.length - 12} 项</Tag>
                        )}
                    </div>
                </div>
            )}

            {/* 分组分布条状图 - Detail View */}
            <div className="flex-1">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 text-[15px] font-bold text-slate-800">
                        <BarChartOutlined className="text-blue-600" />
                        各子分组完成度详情
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{groupEntries.length} Sections</span>
                </div>
                
                <div className="grid gap-3 bg-slate-50/40 rounded-2xl p-6 border border-slate-100/60 shadow-inner">
                    {groupEntries.map(([group, data]) => {
                        const pct = Math.round((data.filled / data.total) * 100);
                        return (
                            <div key={group} className="flex flex-col gap-2 bg-white p-4 rounded-xl border border-slate-100 shadow-sm transition-all hover:border-blue-200">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="font-bold text-slate-700 text-[13px] tracking-tight truncate max-w-[200px]" title={group}>
                                        {group}
                                    </div>
                                    <div className="text-right text-[12px] font-black font-mono">
                                        <span className={pct >= 80 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}>{pct}%</span>
                                        <span className="text-slate-300 font-medium ml-1.5">{data.filled} / {data.total}</span>
                                    </div>
                                </div>
                                <div className="w-full bg-slate-100 overflow-hidden rounded-full h-2.5">
                                    <div
                                        className="h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444',
                                            boxShadow: pct >= 50 ? `0 0 10px ${pct >= 80 ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` : 'none'
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default DataPreview;
