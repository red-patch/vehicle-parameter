import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
    isDarkMode: boolean;
    /** true = 跟随系统外观；手动切换后变 false */
    followSystem: boolean;
    toggleDarkMode: () => void;
    setDarkMode: (isDark: boolean) => void;
    setFollowSystem: (follow: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
    persist(
        (set) => ({
            isDarkMode: false,
            followSystem: true,
            toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode, followSystem: false })),
            setDarkMode: (isDark: boolean) => set({ isDarkMode: isDark }),
            setFollowSystem: (follow: boolean) => set({ followSystem: follow }),
        }),
        {
            name: 'theme-storage',
        }
    )
);

// 跟随系统暗色模式：未手动覆盖时同步 prefers-color-scheme（含系统切换时实时跟随）
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const syncWithSystem = () => {
        const s = useThemeStore.getState();
        if (s.followSystem && s.isDarkMode !== mq.matches) {
            s.setDarkMode(mq.matches);
        }
    };
    // persist 异步 rehydrate 完成后校正一次
    setTimeout(syncWithSystem, 0);
    mq.addEventListener?.('change', syncWithSystem);
}
