import { describe, it, expect } from 'vitest';
import {
    BUILTIN_VIEWS, EMPTY_VIEW_STATE, newViewId,
    type AssetView,
} from '../assetViews';

describe('assetViews', () => {
    it('内置视图：3 个，均为 builtin，id 稳定', () => {
        expect(BUILTIN_VIEWS).toHaveLength(3);
        expect(BUILTIN_VIEWS.every(v => v.builtin)).toBe(true);
        expect(BUILTIN_VIEWS.map(v => v.id)).toEqual(['builtin:all', 'builtin:key', 'builtin:governance']);
    });

    it('内置「全部资产」：无筛选、不分组', () => {
        const all = BUILTIN_VIEWS.find(v => v.id === 'builtin:all')!;
        expect(all.state.groupDims).toEqual([]);
        expect(all.state.selectedTags).toEqual([]);
        expect(all.state.governanceView).toBeNull();
    });

    it('内置「关键车型」：筛关键标签 + 主机厂›族群分组 + 完成率降序', () => {
        const key = BUILTIN_VIEWS.find(v => v.id === 'builtin:key')!;
        expect(key.state.selectedTags).toEqual(['关键车型']);
        expect(key.state.groupDims).toEqual(['manufacturer', 'vehicleFamily']);
        expect(key.state.sortSpec).toEqual({ dim: 'fillRate', dir: 'desc' });
    });

    it('EMPTY_VIEW_STATE：字段完整，可用作新视图基底', () => {
        expect(EMPTY_VIEW_STATE.searchKeyword).toBe('');
        expect(EMPTY_VIEW_STATE.groupDims).toEqual(['vehicle']);
        expect(EMPTY_VIEW_STATE.columnMode).toBe('auto');
    });

    it('newViewId：唯一且带 view: 前缀', () => {
        const a = newViewId();
        const b = newViewId();
        expect(a).toMatch(/^view:/);
        expect(a).not.toBe(b);
    });

    it('视图可 JSON 往返（持久化形状）', () => {
        const v: AssetView = {
            id: newViewId(),
            name: '吉利大面待办',
            state: {
                ...EMPTY_VIEW_STATE,
                searchKeyword: '吉利',
                groupDims: ['vehicleFamily', 'admissionLevel'],
                sortSpec: { dim: 'updatedAt', dir: 'asc' },
                columnMode: 3,
            },
        };
        const round = JSON.parse(JSON.stringify(v)) as AssetView;
        expect(round).toEqual(v);
    });
});
