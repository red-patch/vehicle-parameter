import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MainLayout from '../MainLayout';

vi.mock('../../../store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false, toggleDarkMode: vi.fn() }),
}));

vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: () => ({ assetLibraryPath: '/tmp/assets', setAssetLibraryPath: vi.fn() }),
}));

vi.mock('../../../utils/fieldLists', () => ({
  reloadCustomFields: vi.fn(),
}));

vi.mock('../../../utils/attributeEnums', () => ({
  preloadEnumData: vi.fn(),
}));

vi.mock('../../../utils/assetTagGroups', () => ({
  reloadCustomAssetTagGroups: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe('MainLayout navigation', () => {
  it('shows flattened workbench modules in the top nav', () => {
    render(
      <MainLayout activeTab="pool">
        <div>content</div>
      </MainLayout>
    );

    expect(screen.getByRole('menuitem', { name: /数据池/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /版本对比/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /智能填报/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /多车型管理/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /数据体检与修复/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /公告号查询/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /系统配置/ })).toBeInTheDocument();
    expect(screen.queryByText('参数工作台')).not.toBeInTheDocument();
    expect(screen.queryByText('属性去重')).not.toBeInTheDocument();
  });

  it('keeps the app title shrinkable and the top nav horizontally scrollable', () => {
    render(
      <MainLayout activeTab="pool">
        <div>content</div>
      </MainLayout>
    );

    const title = screen.getByTestId('app-title');
    const navScroll = screen.getByTestId('top-nav-scroll');

    expect(title.className).toContain('truncate');
    expect(title.className).toContain('max-w-');
    expect(navScroll.className).toContain('overflow-x-auto');
    expect(navScroll.className).toContain('min-w-0');
  });
});
