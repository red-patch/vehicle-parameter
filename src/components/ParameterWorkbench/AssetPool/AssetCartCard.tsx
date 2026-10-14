import React from 'react';
import { CloseOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Tag } from 'antd';

/**
 * 购物车里的车卡（设计文档 2026-10-13-asset-panel-redesign-v2 §4.3）：
 * 车型名（+ 来源标签）+ 元信息（完成率/缺必填）+ 移除按钮。曜蓝 v4.1 视觉。
 */
export interface AssetCartCardProps {
    vehicle: {
        key: string;
        fileName: string;
        productName: string;
        /** 生效显示名（别名 → 组名 → 派生名）；省略时回落 productName */
        displayName?: string;
        totalParams: number;
        filledParams: number;
        requiredMissing: number;
        /** 来源：资产库 / 本地 Excel */
        source: 'asset' | 'excel';
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
                surface-inset border border-default rounded-lg px-3 py-2
                cursor-pointer transition-colors duration-150
                hover:border-line-strong
            "
            style={{ transitionTimingFunction: 'var(--ease-ui)' }}
            onClick={onClick}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-body text-1 truncate flex items-center gap-1.5" title={vehicle.productName}>
                    <span className="truncate">{vehicle.displayName || vehicle.productName}</span>
                    <Tag className={`m-0 text-caption leading-[14px] px-1 border-0 flex-shrink-0 ${vehicle.source === 'asset' ? 'src-asset' : 'src-excel'}`}>
                        {vehicle.source === 'asset' ? '资产库' : '本地'}
                    </Tag>
                </span>
                <span
                    className="
                        w-5 h-5 rounded flex items-center justify-center flex-shrink-0
                        text-3 cursor-pointer transition-colors duration-150
                        hover:text-danger-text hover:bg-danger-weak
                    "
                    onClick={e => {
                        e.stopPropagation();
                        onRemove();
                    }}
                >
                    <CloseOutlined className="text-[10px]" />
                </span>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5 text-caption text-3">
                <span className="tabular-nums">
                    完成率 <span className="text-2 font-medium">{fillRate}%</span>
                </span>
                {vehicle.requiredMissing > 0 && (
                    <span className="flex items-center gap-1 text-danger-text">
                        <ExclamationCircleOutlined className="text-[10px]" />
                        缺必填 <span className="font-medium">{vehicle.requiredMissing}</span>
                    </span>
                )}
            </div>
        </div>
    );
};

export default AssetCartCard;
