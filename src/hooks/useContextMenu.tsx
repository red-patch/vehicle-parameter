import { useState, useCallback, useEffect, useRef } from 'react';

export interface ContextMenuItem {
    key: string;
    label?: string;
    icon?: React.ReactNode;
    danger?: boolean;
    disabled?: boolean;
    divider?: boolean;
    /** 二级子菜单（hover 展开；向右展开，右缘空间不足时向左） */
    children?: ContextMenuItem[];
    onClick?: () => void;
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

const SUBMENU_WIDTH = 180;
/** 一级菜单估宽（用于视口 clamp） */
const MENU_WIDTH = 200;
const ITEM_HEIGHT = 32;

/**
 * 右键上下文菜单 hook（支持二级子菜单）
 *
 * 用法：
 * const { onContextMenu, ContextMenuPortal } = useContextMenu();
 * <div onContextMenu={onContextMenu([{ key: 'edit', label: '编辑', onClick }])}>
 *   {ContextMenuPortal}
 * </div>
 *
 * 子菜单：item.children 非空 → hover 展开；子菜单方向按右缘剩余空间自动翻转。
 */
export function useContextMenu() {
    const [state, setState] = useState<ContextMenuState>({ x: 0, y: 0, originX: 0, originY: 0, items: [], visible: false });
    // 当前展开的子菜单：父项 key + 定位信息 + 子项
    const [openSub, setOpenSub] = useState<{ parentKey: string; x: number; y: number; items: ContextMenuItem[] } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const subRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        setState(prev => ({ ...prev, visible: false }));
        setOpenSub(null);
    }, []);

    // 点击菜单外部关闭（子菜单区域也算内部）
    useEffect(() => {
        if (!state.visible) return;
        const handleClick = (e: MouseEvent) => {
            const t = e.target as Node;
            if (menuRef.current?.contains(t)) return;
            if (subRef.current?.contains(t)) return;
            close();
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
            const left = Math.min(x, window.innerWidth - MENU_WIDTH);
            const top = Math.min(y, window.innerHeight - items.length * ITEM_HEIGHT);
            setOpenSub(null);
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

    /** hover 有子菜单的项：定位子菜单（右缘翻转） */
    const handleSubEnter = useCallback((item: ContextMenuItem, el: HTMLElement) => {
        if (!item.children || item.children.length === 0) {
            setOpenSub(null);
            return;
        }
        const rect = el.getBoundingClientRect();
        const wantRight = rect.right + SUBMENU_WIDTH <= window.innerWidth;
        const x = wantRight ? rect.right : rect.left - SUBMENU_WIDTH;
        const subHeight = item.children.length * ITEM_HEIGHT;
        const y = Math.min(rect.top, window.innerHeight - subHeight - 8);
        setOpenSub({ parentKey: item.key, x, y, items: item.children });
    }, []);

    const renderItem = (item: ContextMenuItem, inSub = false) => {
        if (item.divider) return <div key={`div-${item.key}`} className="vp-context-menu__divider" />;
        const hasSub = Boolean(item.children && item.children.length > 0);
        return (
            <div
                key={item.key}
                className={`vp-context-menu__item${item.danger ? ' vp-context-menu__item--danger' : ''}${item.disabled ? ' vp-context-menu__item--disabled' : ''}${hasSub ? ' vp-context-menu__item--has-sub' : ''}`}
                onMouseEnter={e => { if (!inSub) handleSubEnter(item, e.currentTarget as HTMLElement); }}
                onClick={e => {
                    if (hasSub) { e.stopPropagation(); handleSubEnter(item, e.currentTarget as HTMLElement); return; }
                    if (item.disabled) return;
                    item.onClick?.();
                    close();
                }}
            >
                {item.icon && <span className="vp-context-menu__icon">{item.icon}</span>}
                <span className="vp-context-menu__label">{item.label}</span>
                {hasSub && <span className="vp-context-menu__caret">▸</span>}
            </div>
        );
    };

    const ContextMenuPortal = state.visible ? (
        <>
            <div
                ref={menuRef}
                className="vp-context-menu"
                style={{
                    left: state.x,
                    top: state.y,
                    transformOrigin: `${state.originX}px ${state.originY}px`,
                }}
                onMouseLeave={() => { /* 离开一级菜单不立即关子菜单（移到子菜单要时间） */ }}
            >
                {state.items.map(item => renderItem(item))}
            </div>
            {openSub && (
                <div
                    ref={subRef}
                    className="vp-context-menu vp-context-menu--sub"
                    style={{ left: openSub.x, top: openSub.y }}
                >
                    {openSub.items.map(item => renderItem(item, true))}
                </div>
            )}
        </>
    ) : null;

    return { onContextMenu, ContextMenuPortal, closeMenu: close };
}
