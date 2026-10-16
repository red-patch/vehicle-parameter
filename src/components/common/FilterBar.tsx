import React, { type ReactNode } from 'react';

/**
 * 筛选条容器（设计：docs/plans/2026-10-15-ui-构件规范-design.md §4.3）。
 *
 * 注意：本组件只封「装控件的行」，**不封控件**——控件形态由 SearchInput / FacetChips
 * 负责。历史上正因为只封容器，各页面才各写各的输入框（3 种搜索写法）。
 */

export interface FilterItemProps {
    /** 标签文字；**不要自带冒号**（组件统一补，见下） */
    label?: ReactNode;
    children: ReactNode;
    className?: string;
}

/** 统一补冒号；已有冒号的旧写法按原样渲染（幂等，避免出现「::」） */
const withColon = (label: ReactNode): ReactNode => {
    if (typeof label !== 'string') return label;
    return /[:：]\s*$/.test(label) ? label : `${label}：`;
};

export const FilterItem: React.FC<FilterItemProps> = ({ label, children, className = '' }) => {
    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {label && (
                <span
                    className="font-semibold text-2 whitespace-nowrap"
                    // 跟随「界面字号」设置（此前是固定 text-sm 14px，脱离 --fs-* 阶梯）
                    style={{ fontSize: 'var(--fs-body)' }}
                >
                    {withColon(label)}
                </span>
            )}
            {children}
        </div>
    );
};

export interface FilterBarProps {
    children?: ReactNode;
    extra?: ReactNode;
    className?: string;
    style?: React.CSSProperties;
}

export const FilterBar: React.FC<FilterBarProps> = ({ children, extra, className = '', style }) => {
    return (
        <div 
            className={`surface-container p-3 rounded border border-default flex items-center justify-between flex-wrap gap-4 mb-4 ${className}`}
            style={style}
        >
            <div className="flex items-center gap-4 flex-wrap flex-1">
                {children}
            </div>
            {extra && (
                <div className="flex items-center gap-2 flex-shrink-0">
                    {extra}
                </div>
            )}
        </div>
    );
};
