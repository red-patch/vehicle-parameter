import { useEffect, useLayoutEffect, useRef } from 'react';
import { getTopmostOverlay } from '../../utils/hotkeyScope';

export type DesignerView = 'side' | 'front' | '3d';

export interface UseDesignerHotkeysOptions {
    /**
     * 设计器是否为当前可见页面。顶层模块常驻挂载（display:none 切换），
     * 不加这道守卫时，在**别的页面**按 ⌘Z 会悄悄撤销设计器参数、按 1/2/3 会切它的视图。
     */
    enabled: boolean;
    onSelectView: (view: DesignerView) => void;
    onUndo: () => void;
    onRedo: () => void;
}

const VIEW_KEYS: Record<string, DesignerView> = { '1': 'side', '2': 'front', '3': '3d' };

const isEditableTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el || typeof el.tagName !== 'string') return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
};

/**
 * 整车设计快捷键（注册表：constants/shortcuts.ts 的 designer.*）。
 *
 * 作用域守卫：
 * - 仅设计器可见时绑定（enabled）；
 * - 输入态（输入框 / 文本域 / contentEditable）不拦截；
 * - 有弹层（设置、⌘K 搜索、保存配置…）时不拦截——按键属于弹层；
 * - 1/2/3 只认**裸键**：带 ⌘/Ctrl/Alt 的组合（如资产池的 ⌘1）不是这里的键。
 */
export function useDesignerHotkeys({ enabled, onSelectView, onUndo, onRedo }: UseDesignerHotkeysOptions): void {
    // 回调走 ref：调用方每次渲染传新函数也不必重绑监听（提交后同步，不在 render 期写 ref）
    const handlers = useRef({ onSelectView, onUndo, onRedo });
    useLayoutEffect(() => {
        handlers.current = { onSelectView, onUndo, onRedo };
    });

    useEffect(() => {
        if (!enabled) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (isEditableTarget(e.target)) return;
            if (getTopmostOverlay()) return;

            const isMod = e.metaKey || e.ctrlKey;
            const view = VIEW_KEYS[e.key];
            if (view && !isMod && !e.altKey && !e.shiftKey) {
                e.preventDefault();
                handlers.current.onSelectView(view);
                return;
            }
            if (isMod && !e.altKey && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) handlers.current.onRedo();
                else handlers.current.onUndo();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [enabled]);
}
