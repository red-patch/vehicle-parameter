import React from 'react';
import { Modal } from 'antd';

/**
 * 快捷键速查弹层（⌘/）。可发现性：一表列全，避免快捷键"藏起来没人知道"。
 */
export interface AssetHotkeyCheatsheetProps {
    open: boolean;
    onClose: () => void;
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const MOD = MAC ? '⌘' : 'Ctrl';

const ROWS: { keys: string; label: string }[] = [
    { keys: `${MOD} S`, label: '隐藏 / 显示左侧导航' },
    { keys: `${MOD} K`, label: '聚焦搜索框' },
    { keys: '↑ ↓ ← →', label: '在卡片间移动焦点' },
    { keys: 'Enter', label: '打开资产检查器' },
    { keys: 'Space', label: '激活 / 移出工作集' },
    { keys: `${MOD} ⇧ A`, label: '进入批量选择' },
    { keys: `${MOD} ⇧ C`, label: '已选工作集 开 / 关' },
    { keys: `${MOD} Enter`, label: '去对比' },
    { keys: `${MOD} R`, label: '刷新资产库' },
    { keys: `${MOD} ⇧ S`, label: '保存当前视图' },
    { keys: `${MOD} 1 / 2 / 3`, label: '切换到第 1/2/3 个视图' },
    { keys: `${MOD} /`, label: '快捷键速查' },
    { keys: 'Esc', label: '退出当前态（浮层 → 批量 → 焦点）' },
];

const AssetHotkeyCheatsheet: React.FC<AssetHotkeyCheatsheetProps> = ({ open, onClose }) => (
    <Modal title="快捷键" open={open} onCancel={onClose} footer={null} width={420} destroyOnClose>
        <div className="space-y-1.5 py-1">
            {ROWS.map(row => (
                <div key={row.keys} className="flex items-center justify-between gap-4 text-body">
                    <span className="text-2">{row.label}</span>
                    <kbd className="px-2 py-0.5 rounded surface-inset border border-default text-caption text-1 tabular-nums whitespace-nowrap">
                        {row.keys}
                    </kbd>
                </div>
            ))}
        </div>
    </Modal>
);

export default AssetHotkeyCheatsheet;
