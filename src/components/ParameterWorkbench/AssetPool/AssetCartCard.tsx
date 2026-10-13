import React from 'react';
import { CloseOutlined, BarChartOutlined, ExclamationCircleOutlined } from '@ant-design/icons';

/**
 * 购物车里的车卡（设计文档 2026-10-13-asset-panel-redesign-v2 §4.3）：
 * 车型名 + 元信息（完成率/缺必填）+ 移除按钮
 */
export interface AssetCartCardProps {
    vehicle: {
        key: string;
        fileName: string;
        productName: string;
        totalParams: number;
        filledParams: number;
        requiredMissing: number;
    };
    onRemove: () => void;
    onClick: () => void;
}

const AssetCartCard: React.FC<AssetCartCardProps> = ({ vehicle, onRemove, onClick }) => {
    const fillRate = vehicle.totalParams > 0
        ? Math.round((vehicle.filledParams / vehicle.totalParams) * 100)
        : 0;

    return (
        <div
            className="
                bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3.5 py-3
                cursor-pointer transition-all
                hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-sm)]
            "
            onClick={onClick}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-[13px] text-1">{vehicle.productName}</span>
                <span
                    className="
                        w-5 h-5 rounded-full flex items-center justify-center
                        text-3 cursor-pointer transition-all text-[16px]
                        hover:text-[var(--danger)] hover:bg-[#fee2e2]
                    "
                    onClick={e => {
                        e.stopPropagation();
                        onRemove();
                    }}
                >
                    <CloseOutlined className="text-[10px]" />
                </span>
            </div>
            <div className="flex items-center gap-2.5 text-[11px] text-3">
                <span className="flex items-center gap-1">
                    <BarChartOutlined className="text-[11px]" />
                    <span className="text-2 font-semibold">{fillRate}%</span>
                </span>
                {vehicle.requiredMissing > 0 && (
                    <span className="flex items-center gap-1 text-[var(--danger)]">
                        <ExclamationCircleOutlined className="text-[11px]" />
                        缺必填 <span className="font-semibold">{vehicle.requiredMissing}</span>
                    </span>
                )}
            </div>
        </div>
    );
};

export default AssetCartCard;
