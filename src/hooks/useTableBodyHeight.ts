import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';
import { useModuleActive } from './useModuleActive';

/**
 * 表体高度（设计：docs/plans/2026-10-23-列表页表头固定-design.md §2）。
 *
 * 为什么需要它：要「表头固定、只有表体滚动」，唯一的办法是把表体的纵向滚动容器
 * 钉成一个确定的高度——antd 的 `scroll.y` 会渲染成固定表头 + `max-height` 表体。
 *
 * 高度只能**从外向内**取：包裹层的高度由 flex 链（页面钉视口 → ListToolbar `fill`
 * → 包裹层 `flex-1 min-h-0`）决定，与表格内容无关，所以不会出现 CompareView 注释里
 * 那种「表体高度 → 卡片高度 → 包裹层高度」的环形测量。
 *
 * 包裹层必须带 `flex-1 min-h-0 overflow-hidden`：否则表格内容会把包裹层撑高，
 * 量到的「可用高度」跟着涨，表体永远滚不起来。
 *
 * 返回值未就绪时为 `undefined`（此时不传 scroll.y，表格按内容自然高），
 * 量到后一次重渲染即生效。
 *
 * **不要在每次渲染后都量**：量到的新值会改 `scroll.y`、改布局、又触发渲染，
 * React 会以「Maximum update depth exceeded」炸掉（首版就是这么写的，实测踩到）。
 * 只在挂载、容器尺寸变化、窗口缩放时量。
 */

/** 表体最小高度：再小就只剩一两行，不如让外层继续滚 */
const MIN_BODY_HEIGHT = 160;
/** 分页条与表体之间的间距（antd `.ant-pagination` 的上下 margin 合计） */
const PAGINATION_GAP = 16;

export function useTableBodyHeight(ref: RefObject<HTMLElement | null>): number | undefined {
    const active = useModuleActive();
    const [height, setHeight] = useState<number | undefined>(undefined);

    const measure = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        // display:none 的保活页签没有布局盒，量到的是 0，跳过（重新显示时 ResizeObserver 会再触发）
        if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;

        const head = el.querySelector<HTMLElement>('.ant-table-header');
        const pagination = el.querySelector<HTMLElement>('.ant-pagination');
        const reserved =
            (head?.offsetHeight ?? 0) +
            (pagination ? pagination.offsetHeight + PAGINATION_GAP : 0);
        const next = Math.max(MIN_BODY_HEIGHT, Math.floor(el.clientHeight - reserved));
        setHeight(prev => (prev === next ? prev : next));
    }, [ref]);

    useLayoutEffect(() => {
        if (!active) return;
        const el = ref.current;
        if (!el) return;

        // 直接量，不排 rAF：页签在后台时 rAF 可能完全不触发（实测浏览器里整页静默不更新，
        // 只剩挂载时那一次旧值）。measure 只读布局 + setState 同值即 bail out，
        // 而它改的是 scroll.y（包裹层高度由 flex 链决定，量它不会变），不会成环。
        const afterPaint = window.setTimeout(measure, 0);

        window.addEventListener('resize', measure);
        // display:none → visible 时 ResizeObserver 不一定补报（实测没报），
        // 所以可见性显式参与依赖：切到该页就重量一次。观察器仍保留，管「容器尺寸变了」。
        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
        observer?.observe(el);
        return () => {
            window.clearTimeout(afterPaint);
            window.removeEventListener('resize', measure);
            observer?.disconnect();
        };
    }, [active, measure, ref]);

    return active ? height : undefined;
}

export default useTableBodyHeight;
