import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 本环境里 Node 的 --localstorage-file 留了个没有 setItem 的空壳 localStorage，
// settingsStore 的 persist 写盘会抛错。zustand 的 createJSONStorage(() => localStorage)
// 在 store 创建时就解析并存下该对象，所以必须在 import 之前替换——用 vi.hoisted。
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

const { useSettingsStore } = await import('../../../store/settingsStore');

// 各 section 依赖的 store：给最小可用的 mock，避免把真实 persist / Tauri 逻辑拉进 jsdom。
vi.mock('../../../store/themeStore', () => ({
    useThemeStore: () => ({
        isDarkMode: false,
        followSystem: true,
        setDarkMode: vi.fn(),
        setFollowSystem: vi.fn(),
        toggleDarkMode: vi.fn(),
    }),
}));

const vehicleState = { assetLibraryPath: null as string | null, setAssetLibraryPath: vi.fn() };
vi.mock('../../../store/vehicleStore', () => ({
    useVehicleStore: (selector: (s: typeof vehicleState) => unknown) => selector(vehicleState),
}));

const regulationState = { rootPath: '', setRootPath: vi.fn(), load: vi.fn() };
vi.mock('../../../store/regulationStore', () => ({
    useRegulationStore: (selector: (s: typeof regulationState) => unknown) => selector(regulationState),
}));

import SettingsModal from '../SettingsModal';

/** 每个用例前把 store 复位——SettingsModal 直接读它，不通过 props */
function resetStore() {
    useSettingsStore.setState({
        isOpen: false,
        activeSection: 'appearance',
        fontSize: 'medium',
    });
}

describe('SettingsModal', () => {
    beforeEach(resetStore);
    afterEach(cleanup);

    it('isOpen 为 false 时不渲染内容', () => {
        render(<SettingsModal />);
        expect(screen.queryByText('路径与位置')).not.toBeInTheDocument();
    });

    it('打开后默认展示外观分类，可切到其他分类', () => {
        useSettingsStore.setState({ isOpen: true, activeSection: 'appearance' });
        render(<SettingsModal />);

        // 左导航五个分类都在
        expect(screen.getByRole('tab', { name: /外观/ })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /路径与位置/ })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /快捷键/ })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /手机查看/ })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: /数据与危险操作/ })).toBeInTheDocument();

        // 默认在外观：主题单选可见
        expect(screen.getByText('主题')).toBeInTheDocument();

        // 切到快捷键分类：注册表渲染出「全局」分组
        fireEvent.click(screen.getByRole('tab', { name: /快捷键/ }));
        expect(useSettingsStore.getState().activeSection).toBe('shortcuts');
        expect(screen.getByText('全局')).toBeInTheDocument();

        // 切到数据分类：危险操作按钮出现
        fireEvent.click(screen.getByRole('tab', { name: /数据与危险操作/ }));
        expect(useSettingsStore.getState().activeSection).toBe('data');
        expect(screen.getByRole('button', { name: /重置本地数据/ })).toBeInTheDocument();
    });

    it('Cmd/Ctrl + , 打开面板', () => {
        render(<SettingsModal />);
        expect(useSettingsStore.getState().isOpen).toBe(false);

        fireEvent.keyDown(window, { key: ',', metaKey: true });
        expect(useSettingsStore.getState().isOpen).toBe(true);
    });

    it('macOS 菜单事件 open-settings 打开面板', async () => {
        // 模拟 Tauri：__TAURI_INTERNALS__ 存在时 useSettingsHotkey 才去订阅事件
        (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};

        let handler: (() => void) | undefined;
        vi.doMock('@tauri-apps/api/event', () => ({
            listen: vi.fn(async (_event: string, cb: () => void) => {
                handler = cb;
                return () => {};
            }),
        }));

        const { default: Modal } = await import('../SettingsModal');
        render(<Modal />);

        // 等 useEffect 中的动态 import 完成订阅
        await vi.waitFor(() => expect(handler).toBeTypeOf('function'));
        handler?.();
        expect(useSettingsStore.getState().isOpen).toBe(true);

        delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
        vi.doUnmock('@tauri-apps/api/event');
    });
});
