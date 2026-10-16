import { create } from 'zustand';

/**
 * 全局搜索面板状态（设计文档 docs/plans/2026-10-15-全局搜索面板-design.md §3.5）。
 *
 * 与 settingsStore 同体例：只掌管「面板开合」，不复制任何领域数据——
 * 三域数据仍是各自 store 的（资产快照 / announcementStore / regulationStore），
 * 打开面板时由面板自己拉取。不持久化（会话态，重开应用不该弹着搜索面板）。
 */

interface GlobalSearchState {
    isOpen: boolean;
    open: () => void;
    close: () => void;
    /** ⌘K 再按：已开则关（toggle 语义，避免重复叠加） */
    toggle: () => void;
}

export const useGlobalSearchStore = create<GlobalSearchState>((set, get) => ({
    isOpen: false,
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set({ isOpen: !get().isOpen }),
}));
