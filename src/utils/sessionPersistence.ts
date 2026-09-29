import type { SheetData } from '../types';
import { useVehicleStore } from '../store/vehicleStore';

/**
 * 会话级数据池持久化（重构方案A Phase 1）
 *
 * 背景：zustand persist 曾把 uploadedFiles 等大数组同步写 localStorage，
 * 导致每次 set() 都在主线程 JSON.stringify MB 级数据。现在这些字段改为：
 * - 启动时从 appDataDir/session.json 异步恢复（hydrateSessionFromDisk）
 * - 变更后 debounce 1s 异步写回（scheduleSessionPersist）
 *
 * 非 Tauri 环境（jsdom 测试 / 纯浏览器 dev）下所有操作 no-op。
 */

const SESSION_FILE_NAME = 'session.json';
const WRITE_DEBOUNCE_MS = 1000;
const LEGACY_STORAGE_KEY = 'vehicle-parameter-storage';

export interface SessionSnapshot {
    version: 1;
    uploadedFiles: SheetData[];
    selectedProductNames: string[];
    confirmedProducts: string[];
    excludedProducts: string[];
    ignoredProductNames: string[];
}

const isTauri = (): boolean =>
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const pickSnapshot = (): SessionSnapshot => {
    const s = useVehicleStore.getState();
    return {
        version: 1,
        uploadedFiles: s.uploadedFiles,
        selectedProductNames: s.selectedProductNames,
        confirmedProducts: s.confirmedProducts,
        excludedProducts: s.excludedProducts,
        ignoredProductNames: s.ignoredProductNames,
    };
};

const applySnapshot = (raw: unknown): boolean => {
    if (!raw || typeof raw !== 'object') return false;
    const s = raw as Partial<SessionSnapshot>;
    if (
        !Array.isArray(s.uploadedFiles) ||
        !Array.isArray(s.selectedProductNames) ||
        !Array.isArray(s.confirmedProducts) ||
        !Array.isArray(s.excludedProducts) ||
        !Array.isArray(s.ignoredProductNames)
    ) {
        return false;
    }
    useVehicleStore.getState().hydrateSession({
        uploadedFiles: s.uploadedFiles,
        selectedProductNames: s.selectedProductNames,
        confirmedProducts: s.confirmedProducts,
        excludedProducts: s.excludedProducts,
        ignoredProductNames: s.ignoredProductNames,
    });
    return true;
};

const resolveSessionPath = async (): Promise<string> => {
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    return join(await appDataDir(), SESSION_FILE_NAME);
};

/** 立即把当前会话快照写入磁盘（失败只告警，不打断应用） */
export const flushSessionToDisk = async (): Promise<void> => {
    if (!isTauri()) return;
    try {
        const serialized = JSON.stringify(pickSnapshot());
        lastSerialized = serialized;
        const path = await resolveSessionPath();
        const { writeTextFile } = await import('@tauri-apps/plugin-fs');
        await writeTextFile(path, serialized);
    } catch (err) {
        console.warn('[sessionPersistence] 写入会话失败:', err);
    }
};

let debounceTimer: number | null = null;
let lastSerialized: string | null = null;

/** store 变更后调用：debounce 1s 后在空闲期落盘（序列化只在落盘时做一次） */
export const scheduleSessionPersist = (): void => {
    if (!isTauri()) return;
    if (debounceTimer !== null) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        const serialized = JSON.stringify(pickSnapshot());
        if (serialized === lastSerialized) return;
        lastSerialized = serialized;
        void (async () => {
            try {
                const path = await resolveSessionPath();
                const { writeTextFile } = await import('@tauri-apps/plugin-fs');
                await writeTextFile(path, serialized);
            } catch (err) {
                console.warn('[sessionPersistence] 写入会话失败:', err);
            }
        })();
    }, WRITE_DEBOUNCE_MS);
};

/** 旧版 localStorage 一次性迁移：persist 曾把大数组留在 localStorage 里 */
const migrateLegacyLocalStorage = (): boolean => {
    try {
        const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!raw) return false;
        const parsed = JSON.parse(raw) as { state?: Record<string, unknown> };
        const migrated = applySnapshot(parsed.state);
        if (migrated) {
            // 立即落盘，之后 localStorage 中残留的大数组会被 persist 下次写回时自然清掉
            void flushSessionToDisk();
        }
        return migrated;
    } catch {
        return false;
    }
};

/** 启动时恢复会话：优先 session.json；缺失则做 legacy 迁移；损坏降级为空数据池 */
export const hydrateSessionFromDisk = async (): Promise<void> => {
    if (!isTauri()) return;
    try {
        const path = await resolveSessionPath();
        const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
        if (await exists(path)) {
            const raw = await readTextFile(path);
            if (!applySnapshot(JSON.parse(raw))) {
                console.warn('[sessionPersistence] session.json 结构异常，使用空数据池');
            }
            return;
        }
        migrateLegacyLocalStorage();
    } catch (err) {
        console.warn('[sessionPersistence] 会话恢复失败，使用空数据池:', err);
    }
};

let initialized = false;

/** main.tsx 启动时调用一次：订阅 store 变更 → debounce 落盘 */
export const initSessionPersistence = (): void => {
    if (initialized || !isTauri()) return;
    initialized = true;
    useVehicleStore.subscribe(scheduleSessionPersist);
    // 页面卸载前兜底落盘一次
    window.addEventListener('beforeunload', () => {
        if (debounceTimer !== null) {
            window.clearTimeout(debounceTimer);
            void flushSessionToDisk();
        }
    });
};
