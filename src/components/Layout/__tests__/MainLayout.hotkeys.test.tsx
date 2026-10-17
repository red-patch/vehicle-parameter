import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 同 MainLayout.navigation.test：settingsStore 的 persist 需要可写 localStorage，必须在 import 前替换
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
const { useGlobalSearchStore } = await import('../../../store/globalSearchStore');

vi.mock('../../../store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false, toggleDarkMode: vi.fn() }),
}));
vi.mock('../../../store/vehicleStore', () => ({
  useVehicleStore: () => ({ assetLibraryPath: '/tmp/assets', setAssetLibraryPath: vi.fn() }),
}));
vi.mock('../../../store/regulationStore', () => ({
  useRegulationStore: () => ({ rootPath: '', setRootPath: vi.fn(), load: vi.fn() }),
}));
vi.mock('../../../utils/fieldLists', () => ({ reloadCustomFields: vi.fn() }));
vi.mock('../../../utils/attributeEnums', () => ({ preloadEnumData: vi.fn() }));
vi.mock('../../../utils/assetTagGroups', () => ({ reloadCustomAssetTagGroups: vi.fn() }));
// 本文件只验证入口按钮改了 store 状态；搜索面板本身的渲染由 GlobalSearch 自己的测试覆盖
vi.mock('../../GlobalSearch/GlobalSearchModal', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  useGlobalSearchStore.setState({ isOpen: false });
});

/** 模拟 App 的常驻挂载：隐藏模块排在 DOM 前面，当前模块在后 */
const renderWithModules = (onHiddenPrimary = vi.fn(), onVisibleSave = vi.fn()) =>
  render(
    <MainLayout activeTab="pool" onTabChange={vi.fn()}>
      <div style={{ display: 'none' }}>
        <input placeholder="搜索字段名" data-testid="hidden-search" />
        <button className="ant-btn ant-btn-primary" onClick={onHiddenPrimary}>新增业务字典</button>
      </div>
      <div>
        <input placeholder="搜名字、公告号、标签" data-hotkey="search" data-testid="visible-search" />
        <button className="ant-btn ant-btn-primary" data-hotkey="save" onClick={onVisibleSave}>保存至资产库</button>
      </div>
    </MainLayout>,
  );

describe('MainLayout 全局快捷键只作用于当前可见页面', () => {
  it('⌘F 聚焦当前页的搜索框，而不是隐藏模块里的', () => {
    renderWithModules();
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(document.activeElement).toBe(screen.getByTestId('visible-search'));
  });

  it('⌘S 点当前页的保存按钮，不误点隐藏模块的主按钮', () => {
    const hidden = vi.fn();
    const save = vi.fn();
    renderWithModules(hidden, save);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(hidden).not.toHaveBeenCalled();
  });

  it('叠两层弹层时 Esc 只关最顶层一层', () => {
    const closeBottom = vi.fn();
    const closeTop = vi.fn();
    render(
      <MainLayout activeTab="pool" onTabChange={vi.fn()}>
        <div className="ant-modal-wrap"><button className="ant-modal-close" onClick={closeBottom} /></div>
        <div className="ant-modal-wrap"><button className="ant-modal-close" onClick={closeTop} /></div>
      </MainLayout>,
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(closeTop).toHaveBeenCalledTimes(1);
    expect(closeBottom).not.toHaveBeenCalled();
  });

  it('焦点在弹层内时 Esc 交给弹层自己处理，外层不再补关一次', () => {
    const close = vi.fn();
    render(
      <MainLayout activeTab="pool" onTabChange={vi.fn()}>
        <div className="ant-modal-wrap">
          <input data-testid="in-modal" />
          <button className="ant-modal-close" onClick={close} />
        </div>
      </MainLayout>,
    );
    fireEvent.keyDown(screen.getByTestId('in-modal'), { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
  });

  it('header 有可见的全局搜索入口（此前只有 ⌘K 快捷键）', () => {
    renderWithModules();
    fireEvent.click(screen.getByRole('button', { name: '全局搜索' }));
    expect(useGlobalSearchStore.getState().isOpen).toBe(true);
  });
});
