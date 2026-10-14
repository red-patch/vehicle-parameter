import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// localStorage 在测试环境是无 setItem 的空壳，settingsStore 的 persist 会抛错；
// 必须在 import 之前替换（zustand 在 store 创建时就解析并存下该对象）。
vi.hoisted(() => {
  if (typeof (globalThis.localStorage as Storage | undefined)?.setItem !== 'function') {
    const memory = new Map<string, string>();
    const fakeStorage: Storage = {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, String(v)),
      removeItem: (k) => void memory.delete(k),
      clear: () => memory.clear(),
      key: (i) => Array.from(memory.keys())[i] ?? null,
      get length() {
        return memory.size;
      },
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: fakeStorage });
    Object.defineProperty(window, 'localStorage', { configurable: true, writable: true, value: fakeStorage });
  }
});

const { default: MainLayout } = await import('../MainLayout');
const { useSettingsStore } = await import('../../../store/settingsStore');

vi.mock('../../../store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false, toggleDarkMode: vi.fn() }),
}));

vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: () => ({ assetLibraryPath: '/tmp/assets', setAssetLibraryPath: vi.fn() }),
}));

vi.mock('../../../store/regulationStore', () => ({
  useRegulationStore: () => ({ rootPath: '', setRootPath: vi.fn(), load: vi.fn() }),
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
  useSettingsStore.setState({ isOpen: false, activeSection: 'appearance' });
});

describe('MainLayout navigation', () => {
  it('shows flattened workbench modules in the top nav', () => {
    render(
      <MainLayout activeTab="pool">
        <div>content</div>
      </MainLayout>
    );

    expect(screen.getByRole('menuitem', { name: /车型资产/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /版本对比/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /智能填报/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /数据体检与修复/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /公告中心/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /字段与词表/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /整车设计/ })).toBeInTheDocument();
    expect(screen.queryByText('参数工作台')).not.toBeInTheDocument();
    expect(screen.queryByText('属性去重')).not.toBeInTheDocument();
    // 多车型管理已并入「智能填报」的自由多车整理模式，不再是顶级入口
    expect(screen.queryByRole('menuitem', { name: /多车型管理/ })).not.toBeInTheDocument();
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

  it('header 的齿轮按钮打开设置面板', () => {
    render(
      <MainLayout activeTab="pool">
        <div>content</div>
      </MainLayout>
    );

    expect(useSettingsStore.getState().isOpen).toBe(false);
    fireEvent.click(screen.getByTestId('open-settings'));

    expect(useSettingsStore.getState().isOpen).toBe(true);
    // 设置面板的分类导航出现
    expect(screen.getByRole('tab', { name: /外观/ })).toBeInTheDocument();
  });
});
