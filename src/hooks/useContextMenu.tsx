import { useState, useCallback, useEffect, useRef } from 'react';

export interface ContextMenuItem {
    key: string;
    label?: string;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    divider?: boolean;
    onClick: () => void;
}

interface ContextMenuState {
    x: number;
    y: number;
    // 点击点相对菜单左上角的偏移，作入场动画 transform-origin（视口边缘 clamp 后可能为负）
    originX: number;
    originY: number;
    items: ContextMenuItem[];
    visible: boolean;
}

/**
 * 右键上下文菜单 hook
 *
 * 用法：
 * const { onContextMenu, ContextMenuPortal } = useContextMenu();
 * <div onContextMenu={onContextMenu([{ key: 'edit', label: '编辑', onClick: () => {} }])}>
 *   {ContextMenuPortal}
 * </div>
 */
export function useContextMenu() {
    const [state, setState] = useState<ContextMenuState>({ x: 0, y: 0, originX: 0, originY: 0, items: [], visible: false });
    const menuRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        setState(prev => ({ ...prev, visible: false }));
    }, []);

    // 点击菜单外部关闭
    useEffect(() => {
        if (!state.visible) return;
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                close();
            }
        };
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') close();
        };
        // 延迟添加，避免触发右键本身的 click
        const timer = setTimeout(() => {
            window.addEventListener('click', handleClick);
            window.addEventListener('keydown', handleEsc);
        }, 0);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('click', handleClick);
            window.removeEventListener('keydown', handleEsc);
        };
    }, [state.visible, close]);

    const onContextMenu = useCallback((items: ContextMenuItem[]) => {
        return (e: React.MouseEvent) => {
            e.preventDefault();
            const x = e.clientX;
            const y = e.clientY;
            // 确保菜单不超出视口
            const left = Math.min(x, window.innerWidth - 200);
            const top = Math.min(y, window.innerHeight - items.length * 32);
            setState({
                x: left,
                y: top,
                originX: x - left,
                originY: y - top,
                items,
                visible: true,
            });
        };
    }, []);

    const ContextMenuPortal = state.visible ? (
        <div
            ref={menuRef}
            className="vp-context-menu"
            style={{
                left: state.x,
                top: state.y,
                transformOrigin: `${state.originX}px ${state.originY}px`,
            }}
        >
            {state.items.map((item, i) => (
                item.divider ? (
                    <div key={`div-${i}`} className="vp-context-menu__divider" />
                ) : (
                    <div
                        key={item.key}
                        className={`vp-context-menu__item${item.danger ? ' vp-context-menu__item--danger' : ''}${item.disabled ? ' vp-context-menu__item--disabled' : ''}`}
                        onClick={() => { item.onClick(); close(); }}
                    >
                        {item.icon && <span className="vp-context-menu__icon">{item.icon}</span>}
                        <span>{item.label}</span>
                    </div>
                )
            ))}
        </div>
    ) : null;

    return { onContextMenu, ContextMenuPortal, closeMenu: close };
}
