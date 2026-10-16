import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 设置面板状态（设计文档 §3.1）。
 *
 * 只掌管「面板开合 + 当前分类 + 界面字号」这三件事：
 * - 主题仍归 `themeStore`，路径仍归 `vehicleStore` / `regulationStore`——
 *   设置面板是这些状态的**视图**，不复制、不代理，避免两处真相。
 * - 三个入口（⌘, 快捷键 / macOS 菜单事件 / header 齿轮按钮）都只调 `open()`，
 *   开合有单一源。
 */

export type SettingsSection = 'appearance' | 'paths' | 'mobile' | 'shortcuts' | 'data';

/** 界面字号三档。`medium` 是不设置属性时的默认值（与 index.css 的 --fs-* 同源）。 */
export type FontScale = 'small' | 'medium' | 'large';

/**
 * 各档位的基础字号（px），喂给 antd 的 `token.fontSize`。
 * 与 `index.css` 的 `[data-font-scale]` 覆盖**同源**——改一处须改另一处。
 */
export const FONT_SCALE_PX: Record<FontScale, number> = {
    small: 12,
    medium: 13,
    large: 15,
};

interface SettingsState {
    isOpen: boolean;
    activeSection: SettingsSection;
    fontSize: FontScale;
    open: (section?: SettingsSection) => void;
    close: () => void;
    setActiveSection: (section: SettingsSection) => void;
    setFontSize: (size: FontScale) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            isOpen: false,
            activeSection: 'appearance',
            fontSize: 'medium',
            open: (section) =>
                set((s) => ({
                    isOpen: true,
                    activeSection: section ?? s.activeSection,
                })),
            close: () => set({ isOpen: false }),
            setActiveSection: (activeSection) => set({ activeSection }),
            setFontSize: (fontSize) => set({ fontSize }),
        }),
        {
            name: 'settings-storage',
            // isOpen / activeSection 是会话态，不该跨启动恢复——重开应用时不应该
            // 弹着一个设置面板。只持久化字号。
            partialize: (s) => ({ fontSize: s.fontSize }),
        }
    )
);
