import React, { type ReactNode } from 'react';
import { Input } from 'antd';

/**
 * 单元格文本 / 就地编辑（设计：docs/plans/2026-10-16-表格行规范-design.md §3.2）。
 *
 * 把数据体检那个「舒服」的范式固化为构件：**只读态是文本，点开才变输入框**。
 * 这样一格只占一行，行高恒定；相比之下「输入框常驻 + 旁挂开关/标签」会让行高
 * 随内容浮动，各模块行距就此失齐——用户反馈的「智能填报太丑」正是后者。
 *
 * 用法（受控编辑态由调用方持有，与 DataPurifyView 的 editingCell 同构）：
 * ```tsx
 * const [editing, setEditing] = useState(false);
 * <CellText
 *   value={v}
 *   editing={editing}
 *   onChange={setV}
 *   onStartEdit={() => setEditing(true)}
 *   onEndEdit={() => setEditing(false)}
 *   placeholder="未分组"
 *   empty="未分组"
 * />
 * ```
 */

export interface CellTextProps {
    value: string;
    /** 是否处于编辑态（由调用方控制，便于行级/表级互斥） */
    editing: boolean;
    onChange: (next: string) => void;
    onStartEdit: () => void;
    onEndEdit: () => void;
    /** 空值时的占位（只读态显示） */
    empty?: string;
    placeholder?: string;
    /** 只读态文本颜色类；默认 text-2 */
    className?: string;
    /** 编辑态校验失败等附加内容（显示在只读态文本右侧） */
    adornment?: ReactNode;
    disabled?: boolean;
}

const CellText: React.FC<CellTextProps> = ({
    value,
    editing,
    onChange,
    onStartEdit,
    onEndEdit,
    empty = '—',
    placeholder,
    className = 'text-2',
    adornment,
    disabled,
}) => {
    if (editing) {
        return (
            <Input
                autoFocus
                size="small"
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                onChange={e => onChange(e.target.value)}
                onBlur={onEndEdit}
                onPressEnter={onEndEdit}
            />
        );
    }

    const isEmpty = !value;
    return (
        <span
            className={`cell-edit-text ${isEmpty ? 'text-3' : className}`}
            title={value || undefined}
            onClick={() => !disabled && onStartEdit()}
            role={disabled ? undefined : 'button'}
            tabIndex={disabled ? undefined : 0}
            onKeyDown={e => {
                if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onStartEdit();
                }
            }}
        >
            {isEmpty ? empty : value}
            {adornment}
        </span>
    );
};

export default CellText;
