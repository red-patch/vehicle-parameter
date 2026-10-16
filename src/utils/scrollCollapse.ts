/**
 * 滚动收起（设计文档 2026-10-15-announcement-regulation-layout-consistency-design.md §2 Q1）。
 *
 * 纯函数，便于测试与复用（公告中心顶部区 / 法规筛选区）。
 * 带迟滞带：滚过 COLLAPSE_THRESHOLD 才收起，但收回 COLLAPSE_THRESHOLD/2 以内才展开——
 * 否则在阈值上下微抖会反复收放。
 */

/** 收起阈值（px）：滚过这么多即收起 */
export const COLLAPSE_THRESHOLD = 120;

/**
 * 展开阈值（px）：只有回到几乎顶部才展开。
 *
 * 刻意取得比收起阈值小得多——收起会让内容塌陷，页面总高变小，滚动量被浏览器
 * 就地夹紧（实测：collapse 掉 ~290px 的头部后，max scroll 从 400+ 掉到 62）。
 * 若展开阈值贴着收起阈值，就会在夹紧点附近反复「展开→内容变高→又收起」，表现为抖动。
 * 收到「回顶部才展开」这一条线上，抖动窗口不复存在。
 */
export const EXPAND_THRESHOLD = 16;

/**
 * 是否应处于收起态。
 * @param scrollTop 当前滚动量
 * @param collapsed 当前收起态（用于迟滞判定）
 */
export const shouldCollapse = (scrollTop: number, collapsed: boolean): boolean => {
    // 橡皮筋回弹可能给出负值，一律视为顶部
    const top = Math.max(0, scrollTop);
    if (collapsed) {
        // 已收起：要回到顶部附近才展开（迟滞带很宽，见 EXPAND_THRESHOLD 说明）
        return top > EXPAND_THRESHOLD;
    }
    return top >= COLLAPSE_THRESHOLD;
};
