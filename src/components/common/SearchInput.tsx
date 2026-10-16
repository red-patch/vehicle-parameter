import React from 'react';
import { Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

/**
 * 全应用唯一的搜索框（设计：docs/plans/2026-10-15-ui-构件规范-design.md §4.1）。
 *
 * 为什么要有它：本仓库曾有 3 种「搜索框」写法（裸 Input + prefix / Input.Search /
 * TextArea），宽度散落 200~360 的魔法数。规范靠记忆必然被击穿，所以把自由度收进组件——
 * **调用方只能决定取值和语义，不能决定长相**。
 *
 * 刻意不暴露 children / size / prefix / allowClear：这些是规范的一部分，不是自由度。
 * 宽度只收 'sm' | 'md' | 'lg' 三档，不接受任意像素。
 */

/** 宽度三档（取代散落的 240 / 320 / 200 魔法数） */
const WIDTHS = {
    sm: 200,
    md: 240,
    lg: 320,
} as const;

export type SearchWidth = keyof typeof WIDTHS;

export interface SearchInputProps {
    value: string;
    onChange: (value: string) => void;
    /** 占位文案：写清搜什么，不是「请输入关键词」 */
    placeholder: string;
    /** 宽度档位；默认 md */
    width?: SearchWidth;
    /** 附加提示（如「支持换行搜索多个」）；不另起一行 */
    hint?: string;
    /**
     * 多值/换行搜索（如智能填报那种一次贴多个关键词）。
     * 语义由它决定形态，而不是让调用方自选 TextArea——搜索框还是搜索框。
     */
    multiline?: boolean;
    disabled?: boolean;
    onPressEnter?: () => void;
    /** 额外的布局类（如 margin）；不用于改字号/颜色——那些是规范的一部分 */
    className?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onChange,
    placeholder,
    width = 'md',
    hint,
    multiline = false,
    disabled,
    onPressEnter,
    className = '',
}) => {
    const fullPlaceholder = hint ? `${placeholder}（${hint}）` : placeholder;
    // 宽度必须落在外层：带 prefix 时 antd 把 style 给 .ant-input-affix-wrapper，
    // 内层 .ant-input 恒 width:100%。只给 Input 传 style 会得到 100% 宽（实测过）。
    const style: React.CSSProperties = { width: WIDTHS[width] };

    if (multiline) {
        return (
            <Input.TextArea
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={fullPlaceholder}
                allowClear
                disabled={disabled}
                onPressEnter={onPressEnter}
                autoSize={{ minRows: 1, maxRows: 4 }}
                style={style}
                className={className}
            />
        );
    }

    return (
        <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={fullPlaceholder}
            allowClear
            disabled={disabled}
            prefix={<SearchOutlined className="text-3" />}
            onPressEnter={onPressEnter}
            style={style}
            className={className}
        />
    );
};

export default SearchInput;
