import React from 'react';
import { useSettingsStore } from '../../store/settingsStore';

const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * 设置面板的键盘入口（设计文档 §3.3）。
 *
 * 两条通道并存，因为平台能力不同：
 * - **macOS**：Rust 侧 App 菜单项「设置…」带 `CmdOrCtrl+,` 加速键，`on_menu_event`
 *   发 `open-settings` 事件。走原生菜单 = 菜单栏里能看见，且 webview 无焦点也生效。
 * - **Windows**：无应用菜单栏，直接监听窗口 `keydown` 的 `Ctrl+,`。
 *
 * macOS 上仍保留 JS 监听作为兜底（菜单项若被移除仍可用），两路都只调 `open()`，
 * 重复触发只是把已开的面板再 `open` 一次，无副作用。
 */
export function useSettingsHotkey(): void {
    React.useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const isCmd = e.metaKey || e.ctrlKey;
            if (isCmd && e.key === ',') {
                e.preventDefault();
                useSettingsStore.getState().open();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    React.useEffect(() => {
        if (!isTauri()) return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        import('@tauri-apps/api/event')
            .then(({ listen }) => listen('open-settings', () => useSettingsStore.getState().open()))
            .then(fn => {
                if (disposed) fn();
                else unlisten = fn;
            })
            .catch(() => { /* 非 Tauri 或无事件权限：静默降级到键盘通道 */ });
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, []);
}
