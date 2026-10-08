import { ANNOUNCEMENT_DIR_NAME, normalizeAnnounceNo } from './announcementRecord';
import { deriveVehicleGroupKey } from './assetGovernance';
import type { AssetFileInfo } from './assetManager';

/**
 * 公告 PDF 批量扫描（设计文档 docs/plans/2026-10-01-announcement-batch-import-design.md）。
 * 纯函数优先：置信分组已在 Rust 侧完成，这里做 命名补全链 + 去重/冲突裁决（可测），
 * invoke 封装与已归档哈希采集是薄 IO 层。
 */

export interface PdfCandidate {
    path: string;
    fileName: string;
    sizeBytes: number;
    modifiedMs: number;
    contentHash: string;
    /** announcement | suspect | other（Rust 侧判定） */
    confidence: string;
    announceNo: string | null;
    batch: string | null;
    company: string | null;
    trademark: string | null;
    productTitle: string | null;
    markerHits: number;
    filenameHint: boolean;
    error: string | null;
}

export interface PdfScanResult {
    candidates: PdfCandidate[];
    truncated: boolean;
    cancelled: boolean;
}

export interface PdfScanProgress {
    scanned: number;
    total: number;
    currentFile: string;
}

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * 扫描目录（进度经 `pdf-scan-progress` 事件推送）。
 * includeNotDownloaded=false（默认）时 iCloud 未落地文件不 open、不触发下载，
 * 以「未下载」候选从文件名预填；true 才下载全文识别。
 */
export const scanPdfCandidates = async (
    root: string,
    maxDepth: number,
    includeNotDownloaded: boolean,
    onProgress?: (p: PdfScanProgress) => void,
): Promise<PdfScanResult> => {
    if (!isTauri()) throw new Error('目录扫描仅桌面端可用');
    const { invoke } = await import('@tauri-apps/api/core');
    const { listen } = await import('@tauri-apps/api/event');
    const unlisten = onProgress ? await listen<PdfScanProgress>('pdf-scan-progress', e => onProgress(e.payload)) : null;
    try {
        return await invoke<PdfScanResult>('scan_pdf_candidates', { root, maxDepth, includeNotDownloaded });
    } finally {
        unlisten?.();
    }
};

export const cancelPdfScan = async (): Promise<void> => {
    if (!isTauri()) return;
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('cancel_pdf_scan');
};

/**
 * 回应用时增量检查（无常驻监听）：列出下载目录顶层「公告像样」的 PDF 候选。
 * Rust 侧缓存命中零解析、名字预筛不缓存不像公告的文件——本调用几乎瞬时返回。
 * 调用方再按 已忽略名单 + 已归档记录 过滤后提示用户。
 */
export const probeNewPdfs = async (dir: string): Promise<PdfCandidate[]> => {
    if (!isTauri()) return [];
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<PdfCandidate[]>('probe_downloads', { dir });
};

/** 采集已归档 PDF 的内容哈希（去重比对键；单份失败跳过不影响整体） */
export const collectArchivedHashes = async (
    libraryPath: string,
    pdfFiles: string[],
): Promise<Set<string>> => {
    const hashes = new Set<string>();
    if (!isTauri()) return hashes;
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    for (const pdfFile of pdfFiles) {
        try {
            const bytes = await readFile(await join(libraryPath, ANNOUNCEMENT_DIR_NAME, pdfFile));
            const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
            hashes.add(Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join(''));
        } catch (e) {
            console.warn('计算已归档 PDF 哈希失败:', pdfFile, e);
        }
    }
    return hashes;
};

// ==================== 命名补全链（Q3 裁定） ====================

export interface AssetNamingEntry {
    fileName: string;
    productName: string;
}

/** 资产公告号 → 命名索引（车型组名优先，产品名兜底） */
export const buildAssetNamingIndex = (assets: AssetFileInfo[]): Map<string, AssetNamingEntry> => {
    const index = new Map<string, AssetNamingEntry>();
    assets.forEach(a => {
        const nos = new Set([...(a.announceNos || []), ...(a.vehicleModel ? [a.vehicleModel] : [])]
            .map(normalizeAnnounceNo)
            .filter(Boolean));
        nos.forEach(no => {
            if (!index.has(no)) index.set(no, { fileName: a.fileName, productName: a.productName });
        });
    });
    return index;
};

/** 车型组名（与迁移工具同口径：剥前缀尾缀的组键） */
export const assetGroupName = (entry: AssetNamingEntry): string =>
    deriveVehicleGroupKey(entry.fileName, entry.productName) || entry.productName;

/** 商标字段偶发抓到地址行（如「四川省南充市嘉陵区…198号」）——含行政区划字样且较长的不当商标用 */
const looksLikeAddress = (s: string): boolean =>
    s.length >= 8 && /[省市区县镇路街号]/.test(s) && /\d/.test(s);

/** 从产品型号名称（「DNC…型纯电动厢式运输车」）剥掉公告号前缀 */
const stripTitlePrefix = (title: string): string => title.replace(/^[A-Za-z0-9]{5,25}型/, '').trim();

export interface CandidateNaming {
    vehicleName: string;
    announceNo: string;
    batch: string;
}

/**
 * 命名三要素补全链：
 * ① PDF 提取公告号+批次 → ② 公告号反查资产库借车型组名 → ③ 商标+型号名称兜底 → ④ 留空人工填
 */
export const resolveCandidateNaming = (
    candidate: PdfCandidate,
    assetIndex: Map<string, AssetNamingEntry>,
): CandidateNaming => {
    const announceNo = (candidate.announceNo ?? '').trim();
    const batch = (candidate.batch ?? '').trim();
    let vehicleName = '';
    const hit = announceNo ? assetIndex.get(normalizeAnnounceNo(announceNo)) : undefined;
    if (hit) {
        vehicleName = assetGroupName(hit);
    }
    if (!vehicleName) {
        const trademark = (candidate.trademark ?? '').trim();
        const usableTrademark = trademark && !looksLikeAddress(trademark) ? trademark : '';
        const stripped = stripTitlePrefix(candidate.productTitle ?? '');
        vehicleName = [usableTrademark, stripped].filter(Boolean).join(' ');
    }
    if (!vehicleName && candidate.confidence === 'notDownloaded') {
        // 未读过内容：文件名本身就是最后的线索（用户行内可改）
        vehicleName = candidate.fileName.replace(/\.pdf$/i, '');
    }
    return { vehicleName, announceNo, batch };
};

// ==================== 去重与冲突裁决（Q4/Q9 裁定） ====================

export type CandidateGroup = 'fresh' | 'notDownloaded' | 'superseded' | 'duplicate' | 'archived' | 'other';

export interface AdjudicatedCandidate {
    candidate: PdfCandidate;
    /** fresh=可归档；notDownloaded=iCloud 未落地（未读内容，文件名预填）；archived=内容已在档；duplicate=扫描内部同内容副本；superseded=同公告号被更新版取代；other=非公告折叠 */
    group: CandidateGroup;
    /** 已有同公告号+批次的归档记录 → 导入时走替换（Q12） */
    replacesArchived: boolean;
}

const recordKey = (announceNo: string, batch: string): string =>
    `${normalizeAnnounceNo(announceNo)}|${batch.trim()}`;

/**
 * 三层裁决：
 * ① 哈希命中已归档 → archived；
 * ② 扫描内部同哈希 → 只留 mtime 最新一份，其余 duplicate；
 * ③ 同公告号+批次不同内容 → mtime 最新为 fresh（默认勾选仅限 announcement），旧版 superseded。
 */
export const adjudicateCandidates = (
    candidates: PdfCandidate[],
    archivedHashes: Set<string>,
    archivedRecordKeys: Set<string>,
): AdjudicatedCandidate[] => {
    const others: AdjudicatedCandidate[] = [];
    const notDownloaded: AdjudicatedCandidate[] = [];
    const readable = candidates.filter(c => {
        if (c.confidence === 'other') {
            others.push({ candidate: c, group: 'other', replacesArchived: false });
            return false;
        }
        if (c.confidence === 'notDownloaded') {
            // 未读内容：不进哈希去重（无内容哈希），独立分组，默认不勾选
            notDownloaded.push({ candidate: c, group: 'notDownloaded', replacesArchived: false });
            return false;
        }
        return true;
    });

    // ① 已归档
    const notArchived = readable.filter(c => {
        if (c.contentHash && archivedHashes.has(c.contentHash)) {
            return false;
        }
        return true;
    });
    const archived: AdjudicatedCandidate[] = readable
        .filter(c => c.contentHash && archivedHashes.has(c.contentHash))
        .map(c => ({ candidate: c, group: 'archived' as const, replacesArchived: false }));

    // ② 内部同哈希去重（同内容副本，留 mtime 最新）
    const byHash = new Map<string, PdfCandidate>();
    for (const c of notArchived) {
        const key = c.contentHash || c.path; // 哈希缺失按路径各自独立
        const kept = byHash.get(key);
        if (!kept || c.modifiedMs > kept.modifiedMs) byHash.set(key, c);
    }
    const keptSet = new Set(byHash.values());
    const duplicates: AdjudicatedCandidate[] = notArchived
        .filter(c => !keptSet.has(c))
        .map(c => ({ candidate: c, group: 'duplicate' as const, replacesArchived: false }));

    // ③ 同公告号+批次多版本裁决
    const keepers = [...keptSet.values()];
    const winnerByKey = new Map<string, PdfCandidate>();
    for (const c of keepers) {
        const no = (c.announceNo ?? '').trim();
        if (!no) continue;
        const key = recordKey(no, c.batch ?? '');
        const current = winnerByKey.get(key);
        if (!current || c.modifiedMs > current.modifiedMs) winnerByKey.set(key, c);
    }
    const winnerSet = new Set(winnerByKey.values());
    const main: AdjudicatedCandidate[] = keepers.map(c => {
        const no = (c.announceNo ?? '').trim();
        const isWinner = !no || winnerSet.has(c);
        const group: CandidateGroup = isWinner ? 'fresh' : 'superseded';
        const replacesArchived = no
            ? archivedRecordKeys.has(recordKey(no, c.batch ?? ''))
            : false;
        return { candidate: c, group, replacesArchived };
    });

    const rank = (g: CandidateGroup): number => {
        switch (g) {
            case 'fresh': return 0;
            case 'notDownloaded': return 1;
            case 'superseded': return 2;
            case 'duplicate': return 3;
            case 'archived': return 4;
            default: return 5;
        }
    };
    const byGroup = (list: AdjudicatedCandidate[]) =>
        list.sort((a, b) =>
            rank(a.group) - rank(b.group)
            || b.candidate.modifiedMs - a.candidate.modifiedMs
            || a.candidate.path.localeCompare(b.candidate.path));

    notDownloaded.sort((a, b) =>
        b.candidate.modifiedMs - a.candidate.modifiedMs
        || a.candidate.path.localeCompare(b.candidate.path));
    return [...byGroup(main), ...notDownloaded, ...byGroup(duplicates), ...byGroup(archived), ...others];
};
