import React from 'react';
import { Tooltip } from 'antd';

interface AssetStatsBadgeProps {
    /** 参数总行数（该资产解析出的全部参数） */
    totalParams: number;
    /** 值非空的参数行数 */
    filledParams: number;
}

const fillRateTone = (rate: number) =>
    rate >= 95 ? 'text-success-text' : rate >= 60 ? 'text-warning-text' : 'text-danger-text';

/**
 * 资产卡片统计块：参数总数 / 完成率 / 空值，合并在一个方框内。
 * 口径与待分析列表（VehicleListPanel）一致：分母为该资产自身的参数行数，
 * 用于同一车型多条资产时快速对比哪份参数更全，无需先加入待分析。
 * 置于卡片头右侧，与用户标签行视觉分离，且各卡片间数值垂直对齐。
 */
const AssetStatsBadge: React.FC<AssetStatsBadgeProps> = ({ totalParams, filledParams }) => {
    const emptyParams = totalParams - filledParams;
    const fillRate = totalParams > 0 ? Math.round((filledParams / totalParams) * 100) : 0;

    return (
        <Tooltip title="完成率 = 非空值参数 ÷ 参数总数（与待分析列表口径一致）">
            <div className="flex items-stretch rounded-lg surface-inset border border-default flex-shrink-0 cursor-help tabular-nums">
                <span className="px-2.5 py-1 text-[12px] leading-[16px] text-3 whitespace-nowrap">
                    参数 <span className="font-semibold text-1">{totalParams}</span>
                </span>
                <span className="px-2.5 py-1 text-[12px] leading-[16px] text-3 whitespace-nowrap border-l border-default">
                    完成率 <span className={`font-semibold ${fillRateTone(fillRate)}`}>{fillRate}%</span>
                </span>
                <span className="px-2.5 py-1 text-[12px] leading-[16px] text-3 whitespace-nowrap border-l border-default">
                    空值 <span className="font-semibold text-2">{emptyParams}</span>
                </span>
            </div>
        </Tooltip>
    );
};

export default AssetStatsBadge;
