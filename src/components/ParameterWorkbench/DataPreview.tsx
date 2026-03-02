import React, { useMemo, useState, useEffect } from 'react';
import { Spin, Tag, Button } from 'antd';
import { BarChartOutlined, WarningOutlined, ArrowRightOutlined, FileTextOutlined, LoadingOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { loadAssetFile } from '../../utils/assetManager';
import { isFieldRequired } from '../../assets/requiredFields';
import type { VehicleParameter } from '../../types';

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
            const excelFile = uploadedFiles.find(f => f.data.some(p => (p.productName || f.fileName) === focusedProduct));
            if (excelFile) {
                targetSource = excelFile.fileName;
            } else {
                targetSource = `${focusedProduct}.json`;
            }

            setDisplaySource(targetSource);

            // 1. 本地工作区 Excel
            const localExcelFile = uploadedFiles.find(f => f.fileName === targetSource);
            if (localExcelFile) {
                const params = localExcelFile.data.filter(p => (p.productName || localExcelFile.fileName) === focusedProduct);
                setProductData(params);
                return;
            }

            // 2. 资产库
            if (assetLibraryPath) {
                setLoading(true);
                try {
                    const data = await loadAssetFile(assetLibraryPath, targetSource);
                    if (data) {
                        const params = data.data.filter(p => (p.productName || targetSource!.replace('.json', '')) === focusedProduct);
                        setProductData(params);
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
        <div className="h-full flex flex-col p-6 overflow-auto bg-white custom-scrollbar">
            {/* 标题 */}
            <div className="flex items-start justify-between mb-6 pb-4 border-b border-slate-100">
                <div>
                    <h2 className="text-[20px] font-bold text-slate-800 m-0 tracking-tight leading-tight mb-1">
                        {focusedProduct}
                    </h2>
                    <p className="text-[13px] text-slate-500 m-0 flex items-center gap-1.5">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-400"></span>
                        所属文件: {displaySource}
                    </p>
                </div>
                {onGoCompare && (
                    <Button 
                        type="primary" 
                        icon={<ArrowRightOutlined />} 
                        onClick={handleQuickCompare}
                        className="shadow-sm rounded-md bg-blue-600 hover:bg-blue-500"
                    >
                        送去对比
                    </Button>
                )}
            </div>

            {/* 统计卡片 (Minimal Data-Dense Style) */}
            <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 shadow-sm relative overflow-hidden group hover:border-blue-300 transition-colors">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-blue-100 rounded-bl-full -mr-8 -mt-8 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div className="text-3xl font-bold text-slate-800 mb-1 relative z-10">{stats.total}</div>
                    <div className="text-[12px] font-medium text-slate-500 relative z-10">参数总数</div>
                </div>
                <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100 shadow-sm relative overflow-hidden group hover:border-emerald-300 transition-colors">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-100 rounded-bl-full -mr-8 -mt-8 opacity-50 group-hover:opacity-100 transition-opacity" />
                    <div className="text-3xl font-bold text-emerald-600 mb-1 relative z-10">{stats.withValue}</div>
                    <div className="text-[12px] font-medium text-emerald-700/80 relative z-10">已填写</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60 shadow-sm">
                    <div className="text-3xl font-bold text-slate-400 mb-1">{stats.empty}</div>
                    <div className="text-[12px] font-medium text-slate-500">未填写空值</div>
                </div>
                <div className={`rounded-xl p-4 border shadow-sm relative overflow-hidden ${
                    stats.fillRate >= 80 ? 'bg-emerald-50/50 border-emerald-100' : 
                    stats.fillRate >= 50 ? 'bg-amber-50/50 border-amber-100' : 'bg-red-50/50 border-red-100'
                }`}>
                    <div className={`text-3xl font-bold mb-1 ${
                        stats.fillRate >= 80 ? 'text-emerald-600' : 
                        stats.fillRate >= 50 ? 'text-amber-500' : 'text-red-500'
                    }`}>{stats.fillRate}%</div>
                    <div className={`text-[12px] font-medium ${
                        stats.fillRate >= 80 ? 'text-emerald-700/80' : 
                        stats.fillRate >= 50 ? 'text-amber-700/80' : 'text-red-700/80'
                    }`}>整体填写率</div>
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

            {/* 分组分布条状图 */}
            <div className="flex-1">
                <div className="flex items-center gap-2 text-[14px] font-bold text-slate-700 mb-4">
                    <BarChartOutlined className="text-blue-500" />
                    各子分组完成度详情
                </div>
                <div className="space-y-3 bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                    {groupEntries.map(([group, data]) => {
                        const pct = Math.round((data.filled / data.total) * 100);
                        return (
                            <div key={group} className="flex items-center gap-3 text-[13px]">
                                <div className="min-w-[90px] font-medium text-slate-700 truncate" title={group}>
                                    {group}
                                </div>
                                <div className="flex-1 bg-slate-200 overflow-hidden rounded-full h-2">
                                    <div
                                        className="h-full rounded-full transition-all duration-500 ease-out"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
                                        }}
                                    />
                                </div>
                                <div className="w-[100px] text-right text-slate-500 font-mono text-[12px]">
                                    <span className="font-semibold text-slate-700">{data.filled}</span> / {data.total} <span className="text-slate-400 ml-1">({pct}%)</span>
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
