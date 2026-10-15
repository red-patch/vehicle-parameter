import { useEffect } from 'react';

/**
 * 资产池快捷键（设计文档 2026-10-13-asset-pool-fluid-iter-design §3.6）。
 *
 * 作用域守卫：
 * - 仅在资产面板可见时生效（enabled=false 时不绑定，由调用方按 activeTab 传入）；
 * - 输入框 / 文本域 / contentEditable 聚焦时一律不拦截（唯一例外 Esc，用于退出焦点）；
 * - 命中即 preventDefault，避免浏览器默认行为（如 ⌘R 刷新页面）。
 */
export interface AssetPoolHotkeyHandlers {
    onToggleSidebar: () => void;
    onMoveFocus: (delta: { dx: number; dy: number }) => void;
    onOpenInspector: () => void;
    onToggleActive: () => void;
    onEnterBatch: () => void;
    onToggleCart: () => void;
    onGoCompare: () => void;
    onRefresh: () => void;
    onShowCheatsheet: () => void;
    onEscape: () => void;
    /** ⌘⇧S：保存当前视图 */
    onSaveView: () => void;
    /** ⌘1/2/3：切换到第 N 个视图（index 0 起） */
    onSwitchView: (index: number) => void;
}

export interface UseAssetPoolHotkeysOptions extends AssetPoolHotkeyHandlers {
    /** 面板是否可见（PoolPane 未挂载/隐藏时传 false → 不绑定） */
    enabled: boolean;
}

/** 焦点是否在可编辑元素内 */
const isEditableTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
};

export function useAssetPoolHotkeys(opts: UseAssetPoolHotkeysOptions): void {
    const {
        enabled,
        onToggleSidebar, onMoveFocus, onOpenInspector, onToggleActive,
        onEnterBatch, onToggleCart, onGoCompare, onRefresh, onShowCheatsheet, onEscape,
        onSaveView, onSwitchView,
    } = opts;

    useEffect(() => {
        if (!enabled) return;

        const handler = (e: KeyboardEvent) => {
            const mod = e.metaKey || e.ctrlKey;
            const editable = isEditableTarget(e.target);

            // Esc：可编辑元素内也允许（退出搜索框/输入态），但不阻止 antd 弹层自带 Esc
            if (e.key === 'Escape') {
                if (editable) {
                    (e.target as HTMLElement).blur();
                    return;
                }
                onEscape();
                return;
            }

            // 其余快捷键：输入态一律不拦截（不影响弹窗保存/表单输入）
            if (editable) return;

            // ⌘⇧S：保存当前视图（须在 ⌘S 前判断——同为 s 键）
            if (mod && e.shiftKey && (e.key === 's' || e.key === 'S')) {
                e.preventDefault();
                onSaveView();
                return;
            }
            // ⌘S / ⌘B：隐藏/显示左栏（⌘B 为惯用别名）
            if (mod && !e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === 'b' || e.key === 'B')) {
                e.preventDefault();
                onToggleSidebar();
                return;
            }
            // ⌘1/2/3：切换到第 N 个视图
            if (mod && !e.shiftKey && (e.key === '1' || e.key === '2' || e.key === '3')) {
                e.preventDefault();
                onSwitchView(Number(e.key) - 1);
                return;
            }
            // ⌘⇧A：批量选择
            if (mod && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                onEnterBatch();
                return;
            }
            // ⌘⇧C：已选浮层开关
            if (mod && e.shiftKey && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                onToggleCart();
                return;
            }
            // ⌘R：刷新资产库
            if (mod && !e.shiftKey && (e.key === 'r' || e.key === 'R')) {
                e.preventDefault();
                onRefresh();
                return;
            }
            // ⌘/：快捷键速查
            if (mod && e.key === '/') {
                e.preventDefault();
                onShowCheatsheet();
                return;
            }
            // ⌘Enter：去对比
            if (mod && e.key === 'Enter') {
                e.preventDefault();
                onGoCompare();
                return;
            }
            // 方向键：网格移动焦点
            if (!mod && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                e.preventDefault();
                const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
                const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
                onMoveFocus({ dx, dy });
                return;
            }
            // Enter：打开检查器
            if (!mod && e.key === 'Enter') {
                e.preventDefault();
                onOpenInspector();
                return;
            }
            // Space：激活/移出
            if (!mod && e.key === ' ') {
                e.preventDefault();
                onToggleActive();
                return;
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [
        enabled, onToggleSidebar, onMoveFocus, onOpenInspector, onToggleActive,
        onEnterBatch, onToggleCart, onGoCompare, onRefresh, onShowCheatsheet, onEscape,
        onSaveView, onSwitchView,
    ]);
}
