import React from 'react';
import { useGlobalSearchStore } from '../../store/globalSearchStore';

/**
 * 全局搜索面板的键盘入口（设计文档 docs/plans/2026-10-15-全局搜索面板-design.md §3.2）。
 *
 * 单通道：window keydown 监听 ⌘K / Ctrl+K（照 useSettingsHotkey 体例）。
 * ⌘K 在资产池的原绑定（聚焦池内搜索框）已随本设计移除，全局面板独占该键。
 * 面板内 Esc 关闭由 AntD Modal 自带；此处输入框聚焦时不拦截（面板自身处理导航键）。
 */
export function useGlobalSearchHotkey(): void {
    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isCmd = e.metaKey || e.ctrlKey;
            if (isCmd && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                useGlobalSearchStore.getState().toggle();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);
}
