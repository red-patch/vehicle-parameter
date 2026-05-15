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
    const [state, setState] = useState<ContextMenuState>({ x: 0, y: 0, items: [], visible: false });
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
            setState({
                x: Math.min(x, window.innerWidth - 200),
                y: Math.min(y, window.innerHeight - items.length * 32),
                items,
                visible: true,
            });
        };
    }, []);

    const ContextMenuPortal = state.visible ? (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                left: state.x,
                top: state.y,
                zIndex: 99999,
                minWidth: 160,
                padding: '4px 0',
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
                fontSize: 13,
                userSelect: 'none',
            }}
        >
            {state.items.map((item, i) => (
                item.divider ? (
                    <div key={`div-${i}`} style={{ height: 1, background: '#e8e8e8', margin: '4px 0' }} />
                ) : (
                    <div
                        key={item.key}
                        onClick={() => { item.onClick(); close(); }}
                        style={{
                            padding: '5px 12px',
                            cursor: 'default',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            color: item.danger ? '#ff4d4f' : item.disabled ? '#ccc' : '#333',
                            pointerEvents: item.disabled ? 'none' : 'auto',
                        }}
                        onMouseEnter={e => { (e.target as HTMLElement).style.background = '#f0f0f0'; }}
                        onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
                    >
                        {item.icon && <span style={{ fontSize: 14, width: 16, textAlign: 'center' }}>{item.icon}</span>}
                        <span>{item.label}</span>
                    </div>
                )
            ))}
        </div>
    ) : null;

    return { onContextMenu, ContextMenuPortal, closeMenu: close };
}
