import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 与 SettingsModal 测试同理：必须在 import store 之前补上可用的 localStorage
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

// themeStore：记录调用，断言「跟随系统」走 setFollowSystem(true) 而非 setDarkMode。
// 状态可变——Radio 点在已选中项上不会触发 onChange，用例需先把初值设成别的档位。
const themeCalls = {
    setFollowSystem: vi.fn(),
    setDarkMode: vi.fn(),
};
const themeState = { isDarkMode: false, followSystem: false };
vi.mock('../../../store/themeStore', () => ({
    useThemeStore: () => ({
        isDarkMode: themeState.isDarkMode,
        followSystem: themeState.followSystem,
        setDarkMode: themeCalls.setDarkMode,
        setFollowSystem: themeCalls.setFollowSystem,
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

const { default: AppearanceSection } = await import('../sections/AppearanceSection');
const { default: PathsSection } = await import('../sections/PathsSection');
const { default: MobileSection } = await import('../sections/MobileSection');
const { default: DataSection } = await import('../sections/DataSection');
const { useSettingsStore } = await import('../../../store/settingsStore');

describe('设置各分类', () => {
    afterEach(() => {
        cleanup();
        themeCalls.setFollowSystem.mockClear();
        themeCalls.setDarkMode.mockClear();
        useSettingsStore.setState({ fontSize: 'medium' });
    });

    it('外观：选「跟随系统」调 setFollowSystem(true)，不改 darkMode', () => {
        themeState.followSystem = false; // 从显式亮色出发，「跟随系统」才是未选中项
        render(<AppearanceSection />);
        fireEvent.click(screen.getByRole('radio', { name: '跟随系统' }));
        expect(themeCalls.setFollowSystem).toHaveBeenCalledWith(true);
        expect(themeCalls.setDarkMode).not.toHaveBeenCalled();
    });

    it('外观：选「暗色」先关跟随系统再定色', () => {
        themeState.followSystem = false; // 从亮色出发，暗色是未选中项
        render(<AppearanceSection />);
        fireEvent.click(screen.getByRole('radio', { name: '暗色' }));
        expect(themeCalls.setFollowSystem).toHaveBeenCalledWith(false);
        expect(themeCalls.setDarkMode).toHaveBeenCalledWith(true);
    });

    it('外观：切字号写 settingsStore', () => {
        render(<AppearanceSection />);
        fireEvent.click(screen.getByRole('radio', { name: '大' }));
        expect(useSettingsStore.getState().fontSize).toBe('large');
    });

    // 非 Tauri 环境（jsdom 无 __TAURI_INTERNALS__）：路径/手机分类降级为一句说明，不炸
    it('路径与位置：非桌面端降级不反弹', () => {
        render(<PathsSection />);
        expect(screen.getByText(/仅桌面端可用/)).toBeInTheDocument();
    });

    it('手机查看：非桌面端降级不反弹', () => {
        render(<MobileSection />);
        expect(screen.getByText(/仅桌面端可用/)).toBeInTheDocument();
    });

    it('数据：危险操作按钮存在且有确认', () => {
        render(<DataSection />);
        expect(screen.getByRole('button', { name: /重置本地数据/ })).toBeInTheDocument();
    });
});
