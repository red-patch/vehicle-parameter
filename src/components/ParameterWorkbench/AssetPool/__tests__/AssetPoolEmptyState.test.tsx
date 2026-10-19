import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AssetPoolEmptyState from '../AssetPoolEmptyState';
import { resolveAssetPoolEmptyKind } from '../assetPoolEmptyKind';

const openSettings = vi.fn();
vi.mock('../../../../store/settingsStore', () => ({
    useSettingsStore: { getState: () => ({ open: openSettings }) },
}));

afterEach(() => {
    cleanup();
    openSettings.mockReset();
});

describe('资产池空状态：说清楚为什么是空的，并给下一步', () => {
    it('判定顺序：没目录 > 加载中 > 有筛选 > 库为空', () => {
        expect(resolveAssetPoolEmptyKind({ libraryPath: '', loading: true, hasActiveFilters: true })).toBe('noLibrary');
        expect(resolveAssetPoolEmptyKind({ libraryPath: '/lib', loading: true, hasActiveFilters: true })).toBe('loading');
        expect(resolveAssetPoolEmptyKind({ libraryPath: '/lib', loading: false, hasActiveFilters: true })).toBe('noMatch');
        expect(resolveAssetPoolEmptyKind({ libraryPath: '/lib', loading: false, hasActiveFilters: false })).toBe('emptyLibrary');
    });

    it('筛选无结果：不再误报「资产库空空如也」，并可一键清除筛选', () => {
        const onClear = vi.fn();
        render(<AssetPoolEmptyState kind="noMatch" onClearFilters={onClear} navOpen={false} onOpenNav={vi.fn()} />);
        expect(screen.getByText('没有匹配的资产')).toBeInTheDocument();
        expect(screen.queryByText(/空空如也/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));
        expect(onClear).toHaveBeenCalledTimes(1);
    });

    it('未设置目录：按钮直达设置面板的「路径与位置」', () => {
        render(<AssetPoolEmptyState kind="noLibrary" onClearFilters={vi.fn()} navOpen={false} onOpenNav={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: '设置资产库目录' }));
        expect(openSettings).toHaveBeenCalledWith('paths');
    });

    it('库为空：导航收起时给「打开导航」，已展开时不重复给', () => {
        const onOpenNav = vi.fn();
        const { rerender } = render(<AssetPoolEmptyState kind="emptyLibrary" onClearFilters={vi.fn()} navOpen={false} onOpenNav={onOpenNav} />);
        fireEvent.click(screen.getByRole('button', { name: '打开导航' }));
        expect(onOpenNav).toHaveBeenCalledTimes(1);
        rerender(<AssetPoolEmptyState kind="emptyLibrary" onClearFilters={vi.fn()} navOpen onOpenNav={onOpenNav} />);
        expect(screen.queryByRole('button', { name: '打开导航' })).toBeNull();
    });
});
