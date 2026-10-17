import React, { type ReactNode } from 'react';

/**
 * 状态 = 圆点 + 文字（设计：docs/plans/2026-10-17-列表区统一设计语言-design.md §9）。
 *
 * 为什么不用彩色 Tag：表格里一列「现行 / 现行 / 现行…」全是绿底绿字的 Tag，
 * 整列被涂满——颜色成了填充而不是信号。圆点只占 6px，颜色仍可分辨，
 * 文字保持正文色可读；真正需要注意的那一行（废止 / 缺失）才显眼。
 *
 * 语义档只开放 5 个，颜色不开放给调用方（与 FacetChips 的 tone 白名单同理）。
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const DOT_COLOR: Record<StatusTone, string> = {
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    info: 'var(--info)',
    neutral: 'var(--text-4)',
};

export interface StatusDotProps {
    tone: StatusTone;
    children: ReactNode;
    /** 悬停说明（如「已被 GB xxx 替代」） */
    title?: string;
    className?: string;
}

const StatusDot: React.FC<StatusDotProps> = ({ tone, children, title, className = '' }) => (
    <span
        className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
            tone === 'neutral' ? 'text-3' : 'text-1'
        } ${className}`}
        title={title}
        data-tone={tone}
    >
        <span
            aria-hidden
            className="inline-block rounded-full flex-shrink-0"
            style={{ width: 6, height: 6, backgroundColor: DOT_COLOR[tone] }}
        />
        {children}
    </span>
);

export default StatusDot;
