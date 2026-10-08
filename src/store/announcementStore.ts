import { create } from 'zustand';
import { scanAnnouncements, type AnnouncementInfo } from '../utils/announcementRecord';

/**
 * 公告中心状态（设计文档 §4.1）。
 * 不持久化——公告记录落盘在 {资产库}/公告PDF/，磁盘即事实源，这里只是扫描结果的缓存。
 */

interface AnnouncementState {
    infos: AnnouncementInfo[];
    loading: boolean;
    /** 当前扫描结果对应的资产库路径（换库后首次访问自动重扫） */
    loadedForPath: string | null;
    /** 确保已为该资产库路径加载过（已加载同路径则跳过） */
    loadFor: (libraryPath: string | null) => Promise<void>;
    /** 强制重扫当前路径 */
    refresh: () => Promise<void>;
}

export const useAnnouncementStore = create<AnnouncementState>((set, get) => ({
    infos: [],
    loading: false,
    loadedForPath: null,

    loadFor: async (libraryPath) => {
        if (!libraryPath) {
            set({ infos: [], loadedForPath: null, loading: false });
            return;
        }
        if (get().loadedForPath === libraryPath && !get().loading) {
            // 同路径已有扫描结果：直接复用（导入/删除后调用方负责 refresh）
            return;
        }
        set({ loading: true });
        try {
            const infos = await scanAnnouncements(libraryPath);
            set({ infos, loadedForPath: libraryPath, loading: false });
        } catch (e) {
            console.error('扫描公告归档失败', e);
            set({ loading: false });
        }
    },

    refresh: async () => {
        const path = get().loadedForPath;
        if (!path) return;
        set({ loading: true });
        try {
            const infos = await scanAnnouncements(path);
            set({ infos, loading: false });
        } catch (e) {
            console.error('刷新公告归档失败', e);
            set({ loading: false });
        }
    },
}));
