import { describe, expect, it } from 'vitest';
import { COLLAPSE_THRESHOLD, EXPAND_THRESHOLD, shouldCollapse } from '../scrollCollapse';

describe('shouldCollapse', () => {
    it('顶部不动时保持展开', () => {
        expect(shouldCollapse(0, false)).toBe(false);
        expect(shouldCollapse(COLLAPSE_THRESHOLD - 1, false)).toBe(false);
    });

    it('滚过阈值后收起', () => {
        expect(shouldCollapse(COLLAPSE_THRESHOLD, false)).toBe(true);
        expect(shouldCollapse(COLLAPSE_THRESHOLD + 500, false)).toBe(true);
    });

    it('回到顶部附近才展开', () => {
        expect(shouldCollapse(0, true)).toBe(false);
        expect(shouldCollapse(EXPAND_THRESHOLD, true)).toBe(false);
        expect(shouldCollapse(EXPAND_THRESHOLD + 1, true)).toBe(true);
    });

    it('已收起时不会在「收起阈值之下」误展开——避开夹紧点抖动', () => {
        // 收起让内容塌陷，滚动量被夹紧到 max scroll；若展开阈值贴着收起阈值，
        // 此处会展开→变高→再收起，形成抖动。两侧阈值必须拉开。
        expect(shouldCollapse(COLLAPSE_THRESHOLD - 1, true)).toBe(true);
        expect(EXPAND_THRESHOLD).toBeLessThan(COLLAPSE_THRESHOLD / 4);
    });

    it('阈值与复位阈值之间维持原状，避免边界抖动', () => {
        const mid = COLLAPSE_THRESHOLD / 2;
        expect(shouldCollapse(mid, false)).toBe(false);
        expect(shouldCollapse(mid, true)).toBe(true);
    });

    it('负滚动量（橡皮筋回弹）视为顶部', () => {
        expect(shouldCollapse(-30, true)).toBe(false);
        expect(shouldCollapse(-30, false)).toBe(false);
    });
});
