import { useEffect, useState, type RefObject } from 'react';
import { shouldCollapse } from '../utils/scrollCollapse';

/**
 * 滚动收起（设计文档 2026-10-15-announcement-regulation-layout-consistency-design.md §2 Q1）。
 *
 * 挂在「被收起那块内容」的容器上，页面滚过 COLLAPSE_THRESHOLD 后返回 true。
 *
 * 为什么用 window.scrollY 而不是元素位置：外壳 MainLayout 是 `min-h-screen` +
 * **整页滚动**（高度链在 Content 处断开，见 useViewportPaneHeight 的说明），
 * 这些页面没有内部滚动容器，窗口就是唯一滚动源。监听 window 拿到的是精确
 * 像素值，迟滞带（阈值 / 半阈值）才能如实生效。
 *
 * 保活 tab（display:none）没有布局盒，此时跳过——否则在别的 tab 里滚动会把
 * 它误判成已滚过，切回来时内容凭空是收起的。
 */
export function useScrollCollapse(ref: RefObject<HTMLElement | null>): boolean {
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => {
        let frame = 0;
        const update = () => {
            frame = 0;
            const el = ref.current;
            if (!el) return;
            // 保活/隐藏 tab：没有布局盒，不参与滚动判定
            if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return;
            const top = window.scrollY || document.documentElement.scrollTop || 0;
            setCollapsed(prev => shouldCollapse(top, prev));
        };
        const onScroll = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(update);
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        update();
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (frame) window.cancelAnimationFrame(frame);
        };
    }, [ref]);

    return collapsed;
}
