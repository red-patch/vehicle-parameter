import React from 'react';

const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * ⌘S = 保存当前视图 的原生通道（设计：macOS 系统保留键由菜单消费再转发）。
 *
 * macOS 上 ⌘S 无菜单绑定时 WKWebView 会弹"保存页面"对话框，故 Rust 侧在「文件」
 * 菜单加了「保存视图」项（`lib.rs SAVE_VIEW_MENU_ID`，加速键 CmdOrCtrl+S），
 * 点击/按键触发 `on_menu_event` 发 `save-view` 事件，这里监听并回调。
 *
 * 非 macOS 或非 Tauri：不注册（Windows 无应用菜单，⌘⇧S 的 JS 绑定兜底）。
 */
export function useSaveViewMenuEvent(onSaveView: () => void): void {
    React.useEffect(() => {
        if (!isTauri()) return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        import('@tauri-apps/api/event')
            .then(({ listen }) => listen('save-view', () => onSaveView()))
            .then(fn => {
                if (disposed) fn();
                else unlisten = fn;
            })
            .catch(() => { /* 非 Tauri 或无事件权限：静默降级 */ });
        return () => {
            disposed = true;
            unlisten?.();
        };
    }, [onSaveView]);
}
