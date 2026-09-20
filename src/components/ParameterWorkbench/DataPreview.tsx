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
            <div className="h-full flex items-center justify-center surface-layout">
                <div className="text-center">
                    <FileTextOutlined className="text-4xl text-3 mb-3 block" />
                    <p className="text-[13px] text-2">请选择一个焦点车型以展示详细大纲</p>
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
            <div className="h-full flex items-center justify-center surface-layout">
                <div className="text-center text-2 text-[13px] p-6 border-2 border-dashed border-default rounded-xl surface-container">
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
        <div className="h-full flex flex-col p-8 overflow-auto custom-scrollbar surface-container">
            {/* 标题 */}
            <div className="flex items-start justify-between mb-8 pb-6 border-b border-default">
                <div className="min-w-0 pr-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Tag color="default" className="m-0 text-[12px] px-2">参数洞察</Tag>
                        <span className="text-[12px] text-3 font-medium">#{displaySource}</span>
                    </div>
                    <h2 className="text-page text-1 m-0 truncate" title={focusedProduct!}>
                        {getVehicleProductName(focusedProduct)}
                    </h2>
                </div>
                {onGoCompare && (
                    <Button
                        type="primary"
                        icon={<ArrowRightOutlined />}
                        onClick={handleQuickCompare}
                    >
                        送去对比
                    </Button>
                )}
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
                <div className="surface-inset rounded-xl p-4 border border-default">
                    <div className="text-[12px] text-3 mb-2 flex items-center gap-2">
                        <DatabaseOutlined className="text-brand" /> 参数总数
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-stat text-1 tabular-nums">{stats.total}</span>
                        <span className="text-[12px] text-3 font-medium">项</span>
                    </div>
                </div>

                <div className="surface-inset rounded-xl p-4 border border-default">
                    <div className="text-[12px] text-3 mb-2 flex items-center gap-2">
                        <CheckOutlined className="text-success" /> 有效值
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-stat text-success-text tabular-nums">{stats.withValue}</span>
                        <span className="text-[12px] text-3 font-medium">项</span>
                    </div>
                </div>

                <div className="surface-inset rounded-xl p-4 border border-default">
                    <div className="text-[12px] text-3 mb-2 flex items-center gap-2">
                        <FileTextOutlined className="text-3" /> 空值
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-stat text-2 tabular-nums">{stats.empty}</span>
                        <span className="text-[12px] text-3 font-medium">项</span>
                    </div>
                </div>

                <div className="surface-inset rounded-xl p-4 border border-default">
                    <div className="text-[12px] text-3 mb-2">完成率</div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-stat text-brand tabular-nums">{stats.fillRate}</span>
                        <span className="text-[12px] font-bold text-2">%</span>
                    </div>
                </div>
            </div>

            {/* 必填缺失警告 */}
            {stats.requiredMissing.length > 0 && (
                <div className="mb-6 p-4 rounded-xl border border-[color:var(--req-missing-border)] surface-inset">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-danger text-[14px] font-bold">
                            <WarningOutlined />
                            高危：必填项数据缺失 ({stats.requiredMissing.length})
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {stats.requiredMissing.slice(0, 12).map(p => (
                            <Tag key={p.name} color="error" className="m-0">{p.name}</Tag>
                        ))}
                        {stats.requiredMissing.length > 12 && (
                            <Tag className="m-0 surface-inset border-default text-2">+{stats.requiredMissing.length - 12} 项</Tag>
                        )}
                    </div>
                </div>
            )}

            {/* 分组分布条状图 */}
            <div className="flex-1">
                <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-2 text-[16px] font-bold text-1">
                        <BarChartOutlined className="text-brand" />
                        各子分组完成度详情
                    </div>
                    <span className="text-[12px] text-3 font-medium">{groupEntries.length} 个分组</span>
                </div>

                <div className="grid gap-3 surface-inset rounded-xl p-6 border border-default">
                    {groupEntries.map(([group, data]) => {
                        const pct = Math.round((data.filled / data.total) * 100);
                        return (
                            <div key={group} className="flex flex-col gap-2 surface-container p-4 rounded-xl border border-default">
                                <div className="flex justify-between items-center mb-1">
                                    <div className="font-bold text-2 text-[13px] truncate max-w-[200px]" title={group}>
                                        {group}
                                    </div>
                                    <div className="text-right text-[13px] font-bold tabular-nums">
                                        <span className={pct >= 80 ? 'text-success' : pct >= 50 ? 'text-[color:var(--warning-text)]' : 'text-danger'}>{pct}%</span>
                                        <span className="text-3 font-medium ml-1.5">{data.filled} / {data.total}</span>
                                    </div>
                                </div>
                                <div className="w-full surface-inset overflow-hidden rounded-full h-2.5 border border-default">
                                    <div
                                        className="h-full rounded-full"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: pct >= 80 ? 'var(--success)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)',
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
