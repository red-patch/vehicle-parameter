import React from 'react';

/**
 * 「标签 + 计数」的唯一写法（设计：2026-10-17-列表区统一设计语言 §5.2）。
 *
 * 用在 Segmented 选项、Checkbox 文案等需要带数量的短标签上，与 FacetChips 的计数同形：
 * 数字跟在文字后、降一级不透明度、等宽。取代「全部 (26)」「隐藏无值字段 (3)」这类
 * 半角括号拼接——括号在中文界面里既是标点混用，也把数字抬到与文字同一权重。
 */
export interface CountLabelProps {
    label: React.ReactNode;
    count?: number;
}

const CountLabel: React.FC<CountLabelProps> = ({ label, count }) => (
    <span className="whitespace-nowrap">
        {label}
        {count !== undefined && <span className="opacity-60 tabular-nums ml-1">{count}</span>}
    </span>
);

export default CountLabel;
