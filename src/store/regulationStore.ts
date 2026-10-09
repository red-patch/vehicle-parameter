import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { readSidecar, scanRegulations, writeSidecar } from '../utils/regulationIO';
import {
    EMPTY_FILTERS,
    identityOf,
    type RegulationFilters,
    type RegulationRecord,
    type RegulationScanResult,
    type RegulationSidecar,
    type UnregisteredFile,
} from '../utils/regulationTypes';

/**
 * 法规标准库状态（设计文档 §4.1 / §5.3）。
 *
 * 与公告中心 store 的两点不同：
 * 1. **持久化库路径**——法规库是独立路径（Q11），不像公告中心复用资产库路径，
 *    所以要记住用户选的那个目录；只持久化路径这一个标量，记录本身仍在 `_regulations.json`。
 * 2. **不做「磁盘即事实源」的纯缓存**——单文件旁路持有全量记录，store 需要在内存里
 *    做增删改，写盘是显式动作（`persistSidecar`）。
 */

/** 缺省空库：仅当 Rust 不可用时兜底（正常路径下 Rust 会回带默认词表/站点） */
const emptySidecar = (rootPath: string): RegulationSidecar => ({
    version: '1.0',
    rootPath,
    vocab: { levels: [], domains: [] },
    sites: [],
    records: [],
});

interface RegulationState {
    /** 法规库根目录（持久化） */
    rootPath: string;
    sidecar: RegulationSidecar;
    scan: RegulationScanResult | null;
    filters: RegulationFilters;
    loading: boolean;
    saving: boolean;
    /** 上次错误信息（界面以一句提示呈现） */
    error: string | null;

    setRootPath: (path: string) => void;
    setFilters: (filters: Partial<RegulationFilters>) => void;
    resetFilters: () => void;
    /** 载入：读旁路文件 + 扫描目录 */
    load: (path?: string) => Promise<void>;
    /** 仅重扫目录（改词表/标签后无需重读旁路文件时用） */
    rescan: () => Promise<void>;
    /** 把内存中的 sidecar 写回磁盘 */
    persistSidecar: () => Promise<void>;
    /** 登记未登记文件（人工确认后调用） */
    registerFile: (file: UnregisteredFile, overrides?: Partial<RegulationRecord>) => void;
    /** 批量登记 */
    registerFiles: (entries: Array<{ file: UnregisteredFile; overrides?: Partial<RegulationRecord> }>) => void;
    /** 新增或就地更新一条记录（身份 + 版本 定位） */
    upsertRecord: (record: RegulationRecord) => void;
    /** 删除记录（只删元数据，不动 iCloud 里的文件） */
    removeRecord: (standardNo: string, year: string | null) => void;
    /** 更新词表（主题域可增补） */
    setVocab: (vocab: Partial<RegulationSidecar['vocab']>) => void;
}

/** 记录定位键：身份 + 版本（身份走 identityOf，容忍用户把年份填进标准号） */
const recordKey = (r: Pick<RegulationRecord, 'standardNo' | 'year'>): string =>
    `${identityOf(r)}@${r.year ?? ''}`;

export const useRegulationStore = create<RegulationState>()(
    persist(
        (set, get) => ({
            rootPath: '',
            sidecar: emptySidecar(''),
            scan: null,
            filters: EMPTY_FILTERS,
            loading: false,
            saving: false,
            error: null,

            setRootPath: (path) => {
                set({ rootPath: path, scan: null });
            },

            setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),
            resetFilters: () => set({ filters: EMPTY_FILTERS }),

            load: async (path) => {
                const root = path ?? get().rootPath;
                if (!root) {
                    set({ sidecar: emptySidecar(''), scan: null, error: null });
                    return;
                }
                set({ loading: true, error: null });
                try {
                    const sidecar = await readSidecar(root);
                    const scan = await scanRegulations(root);
                    // 扫描结果里的 records 已重算过引用状态，以它为准
                    set({
                        sidecar: { ...sidecar, records: scan.records },
                        scan,
                        loading: false,
                    });
                } catch (e) {
                    set({ loading: false, error: e instanceof Error ? e.message : String(e) });
                }
            },

            rescan: async () => {
                const root = get().rootPath;
                if (!root) return;
                set({ loading: true, error: null });
                try {
                    const scan = await scanRegulations(root);
                    set({
                        sidecar: { ...get().sidecar, records: scan.records },
                        scan,
                        loading: false,
                    });
                } catch (e) {
                    set({ loading: false, error: e instanceof Error ? e.message : String(e) });
                }
            },

            persistSidecar: async () => {
                const { rootPath, sidecar } = get();
                if (!rootPath) return;
                set({ saving: true, error: null });
                try {
                    await writeSidecar(rootPath, sidecar);
                    set({ saving: false });
                } catch (e) {
                    set({ saving: false, error: e instanceof Error ? e.message : String(e) });
                    throw e;
                }
            },

            registerFile: (file, overrides) => get().registerFiles([{ file, overrides }]),

            registerFiles: (entries) => {
                const sidecar = get().sidecar;
                const byKey = new Map(sidecar.records.map(r => [recordKey(r), r]));
                for (const { file, overrides } of entries) {
                    const p = file.parsed;
                    const rec: RegulationRecord = {
                        version: '1.0',
                        standardNo: p.standardNo,
                        year: p.year,
                        title: p.title,
                        level: p.level,
                        domains: [],
                        publishedAt: null,
                        effectiveAt: null,
                        status: p.marker && /征求意见稿|报批稿|送审稿|草案/.test(p.marker) ? '草案' : '',
                        statusOverridden: false,
                        replaces: [],
                        fileName: file.fileName,
                        fileSize: file.fileSize,
                        fileMissing: false,
                        notDownloaded: file.notDownloaded,
                        textLayer: 'unknown',
                        knowledgeCards: [],
                        note: '',
                        updatedAt: new Date().toISOString(),
                        ...overrides,
                    };
                    byKey.set(recordKey(rec), { ...(byKey.get(recordKey(rec)) ?? {}), ...rec });
                }
                set({ sidecar: { ...sidecar, records: [...byKey.values()] } });
            },

            upsertRecord: (record) => {
                const sidecar = get().sidecar;
                const key = recordKey(record);
                const idx = sidecar.records.findIndex(r => recordKey(r) === key);
                const stamped = { ...record, updatedAt: new Date().toISOString() };
                const records =
                    idx >= 0
                        ? sidecar.records.map((r, i) => (i === idx ? stamped : r))
                        : [...sidecar.records, stamped];
                set({ sidecar: { ...sidecar, records } });
            },

            removeRecord: (standardNo, year) => {
                const sidecar = get().sidecar;
                const key = recordKey({ standardNo, year });
                set({
                    sidecar: {
                        ...sidecar,
                        records: sidecar.records.filter(r => recordKey(r) !== key),
                    },
                });
            },

            setVocab: (vocab) =>
                set({ sidecar: { ...get().sidecar, vocab: { ...get().sidecar.vocab, ...vocab } } }),
        }),
        {
            name: 'regulation-library-storage',
            // 只持久化库路径这一个标量：记录的事实源是磁盘上的 _regulations.json
            partialize: (s) => ({ rootPath: s.rootPath }),
        },
    ),
);
