import React from 'react';
import { Tag } from 'antd';
import { CheckOutlined } from '@ant-design/icons';

/**
 * 维度筛选 / 快捷筛选的 chip 组（设计：docs/plans/2026-10-15-ui-构件规范-design.md §4.2）。
 *
 * 为什么要有它：同一个「从一组值里选」的意图，本仓库曾有 4 种编码——
 * 主按钮变色（数据体检/智能填报）、Tag.CheckableTag（公告归档）、
 * Checkbox.Group（法规标准）、facet chip + Popover（资产池）。
 * 统一为 chip 一种，尺寸走 index.css 的 .chip-md（aux 档 12px）。
 *
 * 颜色不开放给调用方：tone 只收语义档，其余一律走 .tag-checked 的控制态样式。
 *
 * 可取消：单选传 `clearable` 后，再点已选中项即回到「不筛」。此前几处「快捷」筛选
 * 只能进不能出——选中「枚举异常」后，唯一的恢复办法是清空搜索*或刷新页面*。
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
    /**
     * 单选时再次点击已选项 = 取消（回到「不筛」）。传 false 则点击无反应。
     * 多选天然支持点掉，不需要这个开关。
     */
    clearable?: boolean;
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

/**
 * 语义档用 `--warning-text` / `--danger-text`，不用图形层的 `--warning` / `--danger`：
 * 后者是给圆点、色条、图标用的，落在白底文字上只有约 2:1（E8930C on #FFF），
 * 12px 小字读不清、也像是禁用态。`-text` 变体才是为文字调过对比度的（亮/暗各自达标）。
 */
const TONE_CLASS: Record<ChipTone, string> = {
    default: '',
    warning: 'text-warning-text',
    danger: 'text-danger-text',
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
            return;
        }
        // 单选：点已选项 = 取消（回调空串，由调用方映射回「不筛」）。
        // 没有这一步时，chip 一旦选中就没有任何可见的退路——用户只能刷新页面。
        if (props.clearable && props.value === v) {
            props.onChange('');
            return;
        }
        props.onChange(v);
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
                                  // 有语义档时不带 text-2：两个文字色类同时挂上，
                                  // 哪个生效取决于样式表顺序——碰巧对的事不该靠碰巧
                                  : `surface-inset border-default hover:border-brand cursor-pointer ${
                                        opt.tone ? TONE_CLASS[opt.tone] : 'text-2'
                                    }`
                        }`}
                        onClick={() => !itemDisabled && toggle(opt.value)}
                        aria-pressed={active}
                        aria-disabled={itemDisabled}
                    >
                        {/* 选中态左侧对勾：未选中的 chip 与普通标签长得一样，
                            不靠图标就没有「这是可切换的筛选项」的可供性 */}
                        {active && <CheckOutlined className="mr-1" aria-hidden />}
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
