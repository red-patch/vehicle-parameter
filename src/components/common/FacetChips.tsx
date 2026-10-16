import React from 'react';
import { Tag } from 'antd';

/**
 * 维度筛选 / 快捷筛选的 chip 组（设计：docs/plans/2026-10-15-ui-构件规范-design.md §4.2）。
 *
 * 为什么要有它：同一个「从一组值里选」的意图，本仓库曾有 4 种编码——
 * 主按钮变色（数据体检/智能填报）、Tag.CheckableTag（公告归档）、
 * Checkbox.Group（法规标准）、facet chip + Popover（资产池）。
 * 统一为 chip 一种，尺寸走 index.css 的 .chip-md（aux 档 12px）。
 *
 * 颜色不开放给调用方：tone 只收语义档，其余一律走 .tag-checked 的控制态样式。
 */

/** 语义档（不是调色自由度）：默认 / 警示 / 危险 */
export type ChipTone = 'default' | 'warning' | 'danger';

export interface FacetOption {
    value: string;
    label: string;
    /** 该项的计数；有值时显示在标签后 */
    count?: number;
    /** 语义档，只影响「未选中」时的提示色 */
    tone?: ChipTone;
    /**
     * 单项禁用（如「仅看差异」在没有差异字段时不可点）。
     * 与整组 disabled 不同：其余项照常可用。已选中的禁用项仍显示选中态但不响应点击。
     */
    disabled?: boolean;
}

/** 单选与多选的 value/onChange 类型由 `multiple` 判定，写错编译期即拦下 */
interface FacetChipsBaseProps {
    /** 分组标签；不带冒号（外层 FilterItem 负责） */
    label?: string;
    options: readonly FacetOption[];
    disabled?: boolean;
}

export interface FacetChipsSingleProps extends FacetChipsBaseProps {
    multiple?: false;
    value: string;
    onChange: (value: string) => void;
}

export interface FacetChipsMultipleProps extends FacetChipsBaseProps {
    multiple: true;
    value: string[];
    onChange: (value: string[]) => void;
}

export type FacetChipsProps = FacetChipsSingleProps | FacetChipsMultipleProps;

const TONE_CLASS: Record<ChipTone, string> = {
    default: '',
    warning: 'text-warning',
    danger: 'text-danger',
};

const FacetChips: React.FC<FacetChipsProps> = props => {
    const { options, disabled } = props;
    const multiple = props.multiple === true;
    const selected = multiple ? props.value : [props.value];

    const toggle = (v: string) => {
        if (props.multiple) {
            const next = selected.includes(v)
                ? props.value.filter(x => x !== v)
                : [...props.value, v];
            props.onChange(next);
        } else {
            props.onChange(v);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {options.map(opt => {
                const active = selected.includes(opt.value);
                const itemDisabled = disabled || opt.disabled;
                return (
                    <Tag
                        key={opt.value}
                        className={`chip-md m-0 border ${
                            itemDisabled && !active
                                ? 'surface-inset border-default text-3 opacity-50 cursor-not-allowed'
                                : active
                                  ? 'tag-checked font-medium cursor-pointer'
                                  : `surface-inset border-default text-2 hover:border-brand cursor-pointer ${
                                        opt.tone ? TONE_CLASS[opt.tone] : ''
                                    }`
                        }`}
                        onClick={() => !itemDisabled && toggle(opt.value)}
                        aria-pressed={active}
                        aria-disabled={itemDisabled}
                    >
                        {opt.label}
                        {opt.count !== undefined && (
                            <span className="opacity-60 tabular-nums ml-1">{opt.count}</span>
                        )}
                    </Tag>
                );
            })}
        </div>
    );
};

export default FacetChips;
