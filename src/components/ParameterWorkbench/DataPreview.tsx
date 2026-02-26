import React, { useMemo, useState, useEffect } from 'react';
import { Empty, Tag, Button } from 'antd';
import { BarChartOutlined, WarningOutlined, ArrowRightOutlined, FileTextOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import { isFieldRequired } from '../../assets/requiredFields';
import type { VehicleParameter } from '../../types';

interface DataPreviewProps {
    onGoCompare?: () => void;
}

const DataPreview: React.FC<DataPreviewProps> = ({ onGoCompare }) => {
    const { uploadedFiles, selectedProductNames } = useVehicleStore();
    const [previewProduct, setPreviewProduct] = useState<string | null>(null);

    useEffect(() => {
        if (selectedProductNames.length > 0) {
            if (!previewProduct || !selectedProductNames.includes(previewProduct)) {
                setPreviewProduct(selectedProductNames[0]);
            }
        } else {
            setPreviewProduct(null);
        }
    }, [selectedProductNames, previewProduct]);

    const productData = useMemo(() => {
        if (!previewProduct) return null;
        const allParams: VehicleParameter[] = [];
        for (const file of uploadedFiles) {
            for (const p of file.data) {
                const pName = p.productName || file.fileName;
                if (pName === previewProduct) allParams.push(p);
            }
        }
        return allParams.length > 0 ? allParams : null;
    }, [uploadedFiles, previewProduct]);

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

    if (!previewProduct) {
        return (
            <div className="h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                    <FileTextOutlined className="text-3xl mb-2 block" />
                    <p className="text-sm">请先选择车型</p>
                </div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="h-full flex items-center justify-center">
                <Empty description="未找到数据" />
            </div>
        );
    }

    const groupEntries = Array.from(stats.groups.entries()).sort((a, b) => b[1].total - a[1].total);

    return (
        <div className="h-full flex flex-col p-4 overflow-auto">
            {/* 标题 + 车型选择 */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-semibold text-gray-800 m-0">数据概览</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{previewProduct}</p>
                </div>
                {selectedProductNames.length > 1 && (
                    <div className="flex gap-1 flex-wrap">
                        {selectedProductNames.map(name => (
                            <Tag
                                key={name}
                                className="cursor-pointer m-0"
                                color={name === previewProduct ? 'blue' : undefined}
                                onClick={() => setPreviewProduct(name)}
                            >
                                {name.length > 12 ? name.slice(0, 12) + '...' : name}
                            </Tag>
                        ))}
                    </div>
                )}
            </div>

            {/* 统计卡片 */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200">
                    <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                    <div className="text-xs text-gray-500 mt-1">参数总数</div>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center border border-green-200">
                    <div className="text-2xl font-bold text-green-600">{stats.withValue}</div>
                    <div className="text-xs text-gray-500 mt-1">已填写</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                    <div className="text-2xl font-bold text-gray-500">{stats.empty}</div>
                    <div className="text-xs text-gray-500 mt-1">未填写</div>
                </div>
                <div className={`rounded-lg p-3 text-center border ${stats.fillRate >= 80 ? 'bg-green-50 border-green-200' : stats.fillRate >= 50 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                    <div className={`text-2xl font-bold ${stats.fillRate >= 80 ? 'text-green-600' : stats.fillRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>{stats.fillRate}%</div>
                    <div className="text-xs text-gray-500 mt-1">填报率</div>
                </div>
            </div>

            {/* 必填缺失 */}
            {stats.requiredMissing.length > 0 && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-1.5 text-red-600 text-xs font-medium mb-1.5">
                        <WarningOutlined />
                        必填字段缺失 ({stats.requiredMissing.length})
                    </div>
                    <div className="flex gap-1 flex-wrap">
                        {stats.requiredMissing.slice(0, 8).map(p => (
                            <Tag key={p.name} color="red" className="text-xs m-0">{p.name}</Tag>
                        ))}
                        {stats.requiredMissing.length > 8 && (
                            <Tag className="text-xs m-0">+{stats.requiredMissing.length - 8}</Tag>
                        )}
                    </div>
                </div>
            )}

            {/* 分组分布 */}
            <div className="flex-1">
                <div className="flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-2">
                    <BarChartOutlined />
                    分组分布
                </div>
                <div className="space-y-1.5">
                    {groupEntries.map(([group, data]) => {
                        const pct = Math.round((data.filled / data.total) * 100);
                        return (
                            <div key={group} className="flex items-center gap-2 text-xs">
                                <Tag color="blue" className="m-0 min-w-[80px] text-center">{group}</Tag>
                                <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
                                        }}
                                    />
                                </div>
                                <span className="text-gray-500 w-20 text-right">{data.filled}/{data.total} ({pct}%)</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 跳转按钮 */}
            {onGoCompare && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                    <Button
                        type="link"
                        icon={<ArrowRightOutlined />}
                        onClick={onGoCompare}
                        className="p-0 text-xs"
                    >
                        前往版本对比查看完整数据
                    </Button>
                </div>
            )}
        </div>
    );
};

export default DataPreview;
