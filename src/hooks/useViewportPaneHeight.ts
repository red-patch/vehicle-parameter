import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { useModuleActive } from './useModuleActive';

/**
 * 把面板高度钉在视口内（设计文档 2026-10-01-asset-panel-layout-redesign §3.1）。
 *
 * 外壳 MainLayout 是 min-h-screen + 整页滚动，高度链在 Content 处断开，
 * 这里按实测计算可用高度：视口高 − 面板顶部距离 − Footer 高 − 两层 p-4 下内边距。
 */
const DEFAULT_BOTTOM_PADDING = 32; // Content p-4 下 16 + ParameterWorkbench 根 p-4 下 16
const MIN_HEIGHT = 240;

/**
 * @param bottomPadding 面板下方还要留出的像素（页内 p-4 与 Content p-4 的合计）。
 *   两层内边距都在这页里时是 32；页面自己不带 p-4（由 App 的外层包装提供）时是 16。
 *
 * 可见性取自 `ModuleActiveContext`：模块页签是 `display:none` 保活的，隐藏期间量不到
 * 高度，切回来时浏览器也不发 resize（ResizeObserver 在 display:none → visible 上
 * 实测同样不补报）——所以靠这个信号在切页时重跑一次。
 */
export function useViewportPaneHeight(
    ref: RefObject<HTMLElement | null>,
    bottomPadding: number = DEFAULT_BOTTOM_PADDING,
): number | undefined {
    const active = useModuleActive();
    const [height, setHeight] = useState<number | undefined>(undefined);

    useLayoutEffect(() => {
        if (!active) return;
        const update = () => {
            const el = ref.current;
            if (!el) return;
            // display:none 的保活 tab 没有布局盒，跳过（重新显示时由 ResizeObserver 触发）
            if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
            // 注：此时 active 必为 true（effect 已按它重跑），量不到只可能是别的遮挡
            const top = el.getBoundingClientRect().top;
            const footer = document.querySelector('.ant-layout-footer');
            const footerHeight = footer ? footer.getBoundingClientRect().height : 0;
            const next = Math.max(MIN_HEIGHT, window.innerHeight - top - footerHeight - bottomPadding);
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
    }, [active, bottomPadding, ref]);

    // 资产库加载完成后内容高度变化不影响钉高；此 effect 仅兜底首帧字体/布局后的一次校准
    useEffect(() => {
        const timer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
        return () => window.clearTimeout(timer);
    }, []);

    return height;
}
