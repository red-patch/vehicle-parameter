import { readTextFile, writeTextFile, exists, mkdir, copyFile, readDir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { normalizeOtherParams } from './announcementParamParse';
import type { VehicleParameter } from '../types';

/**
 * 公告中心存储层（设计文档 docs/plans/2026-10-01-announcement-center-design.md §3）
 *
 * 目录：{assetLibraryPath}/公告PDF/，平铺；每条公告 = 同名 .json（唯一事实源）+ .pdf（附件）。
 * JSON 存在即记录存在；只有 PDF 没有 JSON 的文件是孤儿（orphan，待认领）。
 * 无中央索引——扫描目录即全量事实。
 */

/** 公告归档子目录名（位于资产库根目录下） */
export const ANNOUNCEMENT_DIR_NAME = '公告PDF';

/** 公告记录 JSON（version 1.0） */
export interface AnnouncementRecord {
    version: string;
    /** 关联键：车型资产 ↔ 公告记录按公告号运行时 join（多对一） */
    announceNo: string;
    /** 公告批次（如「第389批」），可空——空则文件名省略批次段 */
    batch: string;
    /** 文件名车型名；预填链：参数「产品名称」→ 人工填 */
    vehicleName: string;
    sourceUrl: string;
    importedAt: string;
    /** 同目录 PDF 文件名；null = 只有参数没有 PDF */
    pdfFile: string | null;
    parameters: VehicleParameter[];
}

/** 扫描元信息（Rust scan_announcements 回传；不含参数全量，参数按需懒加载） */
export interface AnnouncementInfo {
    /** 记录 JSON 文件名（含 .json）；孤儿 PDF 为空串 */
    jsonFile: string;
    announceNo: string;
    batch: string | null;
    vehicleName: string | null;
    importedAt: string | null;
    sourceUrl: string | null;
    hasPdf: boolean;
    pdfFile: string | null;
    paramCount: number;
    /** true = 只有 PDF 没有 JSON，待认领 */
    orphan: boolean;
}

/** 工信部查询页 URL（与 AnnouncementQuery 保持同源） */
export const MIIT_QUERY_URL = 'https://service.miit-eidc.org.cn/miitxxgk/gonggao/xxgk/index';

export const buildQueryUrl = (announcementNo: string): string =>
    `${MIIT_QUERY_URL}?querylb=cp&querydata=${encodeURIComponent(announcementNo)}`;

/** 公告号比较口径：去空白 + 大写（与资产面板粘贴口一致） */
export const normalizeAnnounceNo = (raw: string): string => raw.trim().toUpperCase();

const FILE_NAME_ILLEGAL = /[/\\:*?"<>|\u0000-\u001f]/g; // eslint-disable-line no-control-regex -- 控制字符正是要清洗的目标

/** 清洗文件名分段：去非法字符与控制字符、压空白、去首尾分隔符 */
export const sanitizeFileNamePart = (raw: string): string =>
    raw
        .replace(FILE_NAME_ILLEGAL, '')
        .replace(/\s+/g, ' ')
        .replace(/^[_\s]+|[_\s]+$/g, '')
        .trim();

/** 由三要素生成文件基名（不含扩展名）：{车型名}_{公告号}_{批次}，批次缺省则两段 */
export const buildAnnouncementBaseName = (parts: {
    vehicleName: string;
    announceNo: string;
    batch?: string | null;
}): string => {
    const segments = [
        sanitizeFileNamePart(parts.vehicleName),
        sanitizeFileNamePart(parts.announceNo),
        sanitizeFileNamePart(parts.batch || ''),
    ].filter(Boolean);
    return segments.join('_');
};

export const buildRecordFileNames = (baseName: string): { jsonName: string; pdfName: string } => ({
    jsonName: `${baseName}.json`,
    pdfName: `${baseName}.pdf`,
});

/**
 * 孤儿 PDF 文件名反解（best-effort 预填，认领时人工确认）：
 * 末段形如「第N批」→ 批次；纯字母数字且较长 → 公告号；其余 → 车型名
 */
export const parseAnnouncementBaseName = (
    baseName: string,
): { vehicleName: string; announceNo: string; batch: string } => {
    const segments = baseName.split('_').map(s => s.trim()).filter(Boolean);
    let announceNo = '';
    let batch = '';
    const rest: string[] = [];
    for (const seg of segments) {
        if (!batch && /^第\d+批$/.test(seg)) {
            batch = seg;
        } else if (!announceNo && /^[A-Za-z0-9]{5,}$/.test(seg)) {
            announceNo = seg;
        } else {
            rest.push(seg);
        }
    }
    return { vehicleName: rest.join('_'), announceNo, batch };
};

/** 在已占用基名集合中解析唯一名：base → base(2) → base(3)… */
export const uniquifyBaseName = (base: string, taken: Set<string>): string => {
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(`${base}(${i})`)) i++;
    return `${base}(${i})`;
};

/** 记录 JSON 结构校验（announceNo 必须非空，parameters 必须是数组） */
export const validateAnnouncementRecord = (parsed: unknown): AnnouncementRecord | null => {
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    const announceNo = typeof p.announceNo === 'string' ? p.announceNo.trim() : '';
    if (!announceNo) return null;
    return {
        version: typeof p.version === 'string' ? p.version : '1.0',
        announceNo,
        batch: typeof p.batch === 'string' ? p.batch : '',
        vehicleName: typeof p.vehicleName === 'string' ? p.vehicleName : '',
        sourceUrl: typeof p.sourceUrl === 'string' ? p.sourceUrl : '',
        importedAt: typeof p.importedAt === 'string' ? p.importedAt : '',
        pdfFile: typeof p.pdfFile === 'string' && p.pdfFile ? p.pdfFile : null,
        parameters: Array.isArray(p.parameters) ? (p.parameters as VehicleParameter[]) : [],
    };
};

// ==================== 参数预填提取（书签解析数据的纯函数） ====================

/** 取参数表中第一个命中名称的非空值（trim 后） */
export const findParamValue = (params: VehicleParameter[], names: string[]): string => {
    for (const name of names) {
        const hit = params.find(p => p.name === name || p.name?.includes(name));
        const v = hit ? String(hit.value ?? '').trim() : '';
        if (v) return v;
    }
    return '';
};

export const extractProductName = (params: VehicleParameter[]): string =>
    findParamValue(params, ['产品名称']);

export const extractBatch = (params: VehicleParameter[]): string =>
    findParamValue(params, ['批次', '公告批次']);

export const extractAnnounceNo = (params: VehicleParameter[]): string =>
    findParamValue(params, ['公告号', '车辆型号', '产品号']);

// ==================== 关联（纯公告号运行时 join，多对一） ====================

/** 按资产行的有效公告号集合匹配公告记录（孤儿不参与关联）；保持 store 原顺序，调用方自行排序批次 */
export const matchAnnouncementsByNos = (
    infos: AnnouncementInfo[],
    announceNos: string[],
): AnnouncementInfo[] => {
    const wanted = new Set(announceNos.map(normalizeAnnounceNo).filter(Boolean));
    if (wanted.size === 0) return [];
    return infos.filter(i => !i.orphan && wanted.has(normalizeAnnounceNo(i.announceNo)));
};

/** 批次号里的数字，用于「默认取最新批次」排序（无数字的排最后） */
export const batchSeq = (batch: string | null | undefined): number => {
    const m = batch?.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : -1;
};

// ==================== IO（Tauri 优先，Web/测试回退 JS 实现） ====================

const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const getAnnouncementDir = (libraryPath: string): Promise<string> =>
    join(libraryPath, ANNOUNCEMENT_DIR_NAME);

const ensureAnnouncementDir = async (libraryPath: string): Promise<string> => {
    const dir = await getAnnouncementDir(libraryPath);
    if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
    }
    return dir;
};

export const readAnnouncementRecord = async (
    libraryPath: string,
    jsonFile: string,
): Promise<AnnouncementRecord | null> => {
    try {
        const fullPath = await join(libraryPath, ANNOUNCEMENT_DIR_NAME, jsonFile);
        if (!(await exists(fullPath))) return null;
        const record = validateAnnouncementRecord(JSON.parse(await readTextFile(fullPath)));
        if (!record) return null;
        // 读时归一：「其它」整格拆成子项（旧记录/迁移记录没拆过，读取即自愈；幂等）
        return { ...record, parameters: normalizeOtherParams(record.parameters) };
    } catch (e) {
        console.error('Failed to read announcement record', jsonFile, e);
        return null;
    }
};

/** 写入公告记录 JSON（目录不存在则创建） */
export const writeAnnouncementRecord = async (
    libraryPath: string,
    jsonName: string,
    record: AnnouncementRecord,
): Promise<string> => {
    const dir = await ensureAnnouncementDir(libraryPath);
    const fullPath = await join(dir, jsonName);
    await writeTextFile(fullPath, JSON.stringify(record, null, 2));
    return fullPath;
};

/**
 * 把 PDF 复制进归档目录。源文件已在归档目录内（孤儿认领/改名）时：
 * 同名跳过复制；异名复制后由调用方决定是否清理源文件。
 */
export const importPdfToArchive = async (
    libraryPath: string,
    sourcePath: string,
    pdfName: string,
): Promise<{ skipped: boolean; targetPath: string }> => {
    const dir = await ensureAnnouncementDir(libraryPath);
    const targetPath = await join(dir, pdfName);
    const samePlace = sourcePath === targetPath;
    if (!samePlace) {
        await copyFile(sourcePath, targetPath);
    }
    return { skipped: samePlace, targetPath };
};

/**
 * 扫描公告归档目录。Tauri 走 Rust 命令（读+解析全在线程池）；Web/测试回退 JS 实现。
 */
export const scanAnnouncements = async (libraryPath: string): Promise<AnnouncementInfo[]> => {
    if (!libraryPath) return [];
    if (isTauri()) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            return await invoke<AnnouncementInfo[]>('scan_announcements', { path: libraryPath });
        } catch (e) {
            console.warn('scan_announcements 失败，回退 JS 实现', e);
        }
    }
    return scanAnnouncementsJs(libraryPath);
};

const scanAnnouncementsJs = async (libraryPath: string): Promise<AnnouncementInfo[]> => {
    const dir = await getAnnouncementDir(libraryPath);
    if (!(await exists(dir))) return [];
    const entries = await readDir(dir);
    const jsonNames = entries
        .map(e => e.name)
        .filter((n): n is string => !!n && n.endsWith('.json') && !n.startsWith('_'));
    const pdfSet = new Set(
        entries.map(e => e.name).filter((n): n is string => !!n && n.toLowerCase().endsWith('.pdf')),
    );

    const infos: AnnouncementInfo[] = [];
    const claimedPdfs = new Set<string>();
    for (const jsonName of jsonNames) {
        try {
            const content = await readTextFile(await join(dir, jsonName));
            const record = validateAnnouncementRecord(JSON.parse(content));
            if (!record) continue;
            let pdfFile = record.pdfFile;
            const sameBasePdf = `${jsonName.slice(0, -'.json'.length)}.pdf`;
            if (!pdfFile && pdfSet.has(sameBasePdf)) {
                pdfFile = sameBasePdf; // 自愈：记录未写 pdfFile 但同名 PDF 在盘上
            }
            if (pdfFile) claimedPdfs.add(pdfFile);
            infos.push({
                jsonFile: jsonName,
                announceNo: record.announceNo,
                batch: record.batch || null,
                vehicleName: record.vehicleName || null,
                importedAt: record.importedAt || null,
                sourceUrl: record.sourceUrl || null,
                hasPdf: !!pdfFile && pdfSet.has(pdfFile),
                pdfFile,
                paramCount: record.parameters.length,
                orphan: false,
            });
        } catch (e) {
            console.warn('跳过无法解析的公告记录:', jsonName, e);
        }
    }

    // 孤儿 PDF：没有同名 JSON 认领的
    for (const pdfName of pdfSet) {
        if (claimedPdfs.has(pdfName)) continue;
        const parsed = parseAnnouncementBaseName(pdfName.slice(0, -'.pdf'.length));
        infos.push({
            jsonFile: '',
            announceNo: parsed.announceNo,
            batch: parsed.batch || null,
            vehicleName: parsed.vehicleName || null,
            importedAt: null,
            sourceUrl: null,
            hasPdf: true,
            pdfFile: pdfName,
            paramCount: 0,
            orphan: true,
        });
    }
    return infos;
};

/** 移入 macOS 废纸篓（仅 Tauri 环境可用；fs 插件无 trash API，走自定义 Rust 命令） */
export const moveToTrash = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return;
    if (!isTauri()) {
        throw new Error('移入废纸篓仅桌面端可用');
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('move_to_trash', { paths });
};

/** 把文件引用写入系统剪贴板（粘贴到 Finder/微信/邮件即为目标文件；走 Rust 原生粘贴板） */
export const copyFilesToClipboard = async (paths: string[]): Promise<void> => {
    if (paths.length === 0) return;
    if (!isTauri()) {
        throw new Error('复制文件到剪贴板仅桌面端可用');
    }
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('copy_files_to_clipboard', { paths });
};
