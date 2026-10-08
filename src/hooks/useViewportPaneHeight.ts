import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * 把面板高度钉在视口内（设计文档 2026-10-01-asset-panel-layout-redesign §3.1）。
 *
 * 外壳 MainLayout 是 min-h-screen + 整页滚动，高度链在 Content 处断开，
 * 这里按实测计算可用高度：视口高 − 面板顶部距离 − Footer 高 − 两层 p-4 下内边距。
 * 只锁资产管理两栏（PoolPane），其余 tab 的滚动行为不动。
 */
const BOTTOM_PADDING = 32; // Content p-4 下 16 + ParameterWorkbench 根 p-4 下 16
const MIN_HEIGHT = 240;

export function useViewportPaneHeight(ref: RefObject<HTMLElement | null>): number | undefined {
    const [height, setHeight] = useState<number | undefined>(undefined);

    useLayoutEffect(() => {
        const update = () => {
            const el = ref.current;
            if (!el) return;
            // display:none 的保活 tab 没有布局盒，跳过（重新显示时由 ResizeObserver 触发）
            if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
            const top = el.getBoundingClientRect().top;
            const footer = document.querySelector('.ant-layout-footer');
            const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
            const next = Math.max(MIN_HEIGHT, window.innerHeight - top - footerHeight - BOTTOM_PADDING);
            setHeight(prev => (prev === next ? prev : next));
        };
        update();
        window.addEventListener('resize', update);
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
        if (observer && ref.current) observer.observe(ref.current);
        return () => {
            window.removeEventListener('resize', update);
            observer?.disconnect();
        };
    }, [ref]);

    // 资产库加载完成后内容高度变化不影响钉高；此 effect 仅兜底首帧字体/布局后的一次校准
    useEffect(() => {
        const timer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
        return () => window.clearTimeout(timer);
    }, []);

    return height;
}
