import React, { type ReactNode } from 'react';
import { Button, Dropdown, Popconfirm, Tooltip } from 'antd';
import { MoreOutlined } from '@ant-design/icons';

/**
 * 行内操作列（设计：docs/plans/2026-10-17-列表区统一设计语言-design.md §8）。
 *
 * 收敛此前四种写法：`type="link"` 图标、`type="text" danger` 红色图标、
 * 带字链接按钮、裸图标按钮——同一个「对这一行做点什么」的意图。
 *
 * 规格（不是自由度）：
 * - 一律 `type="text" size="small"` 图标按钮，必带 Tooltip + aria-label
 * - 最多露出 `maxVisible`（默认 2）个，其余收进「更多」下拉
 * - 破坏性动作常态中性色、悬停转红（`.row-action-danger`）——满屏红色垃圾桶是噪音
 * - 禁用态保留占位不隐藏，行与行之间按钮位置不跳
 * - 点击不冒泡到行（行点击常用于选中 / 展开）
 */
export interface RowAction {
    key: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    /** 禁用原因；有则替代 label 作为 Tooltip */
    disabledReason?: string;
    /**
     * 显示文字（图标 + 文字）。只给「这一行的主要去向」用（如孤儿记录的「认领建档」），
     * 一列里最多一个——全带字时列宽失控，且各行按钮位置不再对齐。
     */
    showLabel?: boolean;
    /** 需要二次确认时的提示（如「确定删除此参数？」）；仅对露出的按钮生效 */
    confirm?: string;
}

export interface RowActionsProps {
    actions: RowAction[];
    maxVisible?: number;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

const ActionButton: React.FC<{ action: RowAction }> = ({ action: a }) => {
    const button = (
        <Button
            type="text"
            size="small"
            aria-label={a.label}
            icon={a.icon}
            disabled={a.disabled}
            className={`row-action${a.danger ? ' row-action-danger' : ''}`}
            onClick={a.confirm ? undefined : a.onClick}
        >
            {a.showLabel ? a.label : null}
        </Button>
    );
    // 带字按钮不再用 Tooltip 重复同一句话；禁用原因仍要说
    const tip = a.disabled && a.disabledReason ? a.disabledReason : a.showLabel ? null : a.label;
    if (a.confirm && !a.disabled) {
        return (
            <Popconfirm title={a.confirm} onConfirm={a.onClick} okText="确定" cancelText="取消">
                <span>
                    <Tooltip title={tip}>{button}</Tooltip>
                </span>
            </Popconfirm>
        );
    }
    return <Tooltip title={tip}>{button}</Tooltip>;
};

const RowActions: React.FC<RowActionsProps> = ({ actions, maxVisible = 2 }) => {
    // 恰好多 1 个时不折叠：「更多」本身也占一个位，折叠省不下空间
    const fold = actions.length > maxVisible + 1;
    const visible = fold ? actions.slice(0, maxVisible) : actions;
    const rest = fold ? actions.slice(maxVisible) : [];

    return (
        <span className="inline-flex items-center gap-0.5" onClick={stop}>
            {visible.map(a => (
                <ActionButton key={a.key} action={a} />
            ))}
            {rest.length > 0 && (
                <Dropdown
                    trigger={['click']}
                    menu={{
                        items: rest.map(a => ({
                            key: a.key,
                            label: a.label,
                            icon: a.icon,
                            danger: a.danger,
                            disabled: a.disabled,
                        })),
                        onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            rest.find(a => a.key === key)?.onClick();
                        },
                    }}
                >
                    <Button
                        type="text"
                        size="small"
                        aria-label="更多操作"
                        icon={<MoreOutlined />}
                        className="row-action"
                    />
                </Dropdown>
            )}
        </span>
    );
};

export default RowActions;
