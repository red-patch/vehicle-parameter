import type { AssetFileInfo, AssetMetaMap } from './assetManager';
import type { VehicleParameter } from '../types';
import { deriveVehicleGroupKey, normalizeGroupKey, resolveVehicleGroupKey, DEFAULT_BRAND_NAMES } from './assetGovernance';
import { normalizeAdmissionLevel } from './assetFacets';

// ============================================================
// 导入三分类查重（纯函数，零 IO）
// 身份键：有公告号 = 公告号；无公告号 = 车型组 + 产品名（ADR-0002）。
// 确定重复（updated）→ 程序可判；疑似重复（suspect）→ 只进人工裁定，不自动合并。
// ============================================================

export type ImportVerdict = 'new' | 'updated' | 'suspect';

/** 落盘动作：save=按新车保存；keep-new=并存为新版本（旧版标 superseded）；replace=替换旧版内容；skip=跳过 */
export type ImportDecision = 'save' | 'keep-new' | 'replace' | 'skip';

export interface ImportCandidate {
    /** 保存时的文件名基名（不含 .json） */
    fileName: string;
    productName: string;
    /** 从参数体提取的公告号（含车辆型号） */
    announceNos: string[];
    /** 从参数体提取的准入编号（ZR...；判别信号） */
    admissionNos?: string[];
    /** 准入等级原文（产品等级标准；判别信号） */
    admissionLevel?: string | null;
    /** 关键参数签名（如 车型组|电量|电池品牌），可选的疑似重复佐证 */
    keySignature?: string;
}

export interface ImportClassifyResult {
    verdict: ImportVerdict;
    /** 命中的现有资产文件名（verdict=new 时为空） */
    matchedFiles: string[];
    /** 命中/判定依据（展示用） */
    reason: string;
}

/** 产品名归一：去首尾空白、压缩连续空白、拉丁大写（同口径保证「同名必同判」） */
const normalizeName = (s: string): string => s.trim().replace(/\s+/g, ' ').toUpperCase();

/** 公告号归一：去全部空白、拉丁大写 */
const normalizeAnnounce = (s: string): string => s.replace(/\s+/g, '').toUpperCase();

const ANNOUNCE_NAME_KEYS = ['公告号', '产品号', '产品ID', '公告产品号', '产品编号'];

/**
 * 从参数体提取公告号（与扫描口径一致：纯字母数字才收；「车辆型号」为公告源公告号）。
 */
export const extractImportAnnounceNos = (params: VehicleParameter[]): string[] => {
    const nos = new Set<string>();
    params.forEach(p => {
        if (ANNOUNCE_NAME_KEYS.some(k => p.name === k || p.name?.includes(k))) {
            const v = String(p.value ?? '').trim();
            if (/^[A-Za-z0-9]+$/.test(v)) nos.add(v);
        }
        if (p.name === '车辆型号') {
            const v = String(p.value ?? '').trim();
            if (v) nos.add(v);
        }
    });
    return Array.from(nos);
};

/** 从参数体提取准入编号（准入编号参数，非空值） */
export const extractImportAdmissionNos = (params: VehicleParameter[]): string[] => {
    const out = new Set<string>();
    params.forEach(p => {
        if ((p.name || '').includes('准入编号')) {
            const v = String(p.value ?? '').trim();
            if (v) out.add(v);
        }
    });
    return Array.from(out);
};

/** 组装导入候选（调用方从参数体提取公告号时可直接构造，不走此函数） */
export const buildImportCandidate = (
    params: VehicleParameter[],
    fileNameBase: string,
    productName: string,
    keySignature?: string,
): ImportCandidate => {
    const levelParam = params.find(p => p.name === '产品等级标准');
    return {
        fileName: fileNameBase,
        productName,
        announceNos: extractImportAnnounceNos(params),
        admissionNos: extractImportAdmissionNos(params),
        admissionLevel: levelParam ? String(levelParam.value ?? '').trim() || null : null,
        keySignature,
    };
};

interface ExistingEntry {
    fileName: string;
    productName: string;
    announceNos: string[];
    admissionNos: string[];
    admissionLevel: string | null;
    groupKey: string;
    keySignature?: string;
}

const buildExistingEntries = (
    existing: (AssetFileInfo & { keySignature?: string })[],
    meta: AssetMetaMap,
    brandNames: string[],
): ExistingEntry[] => existing.map(info => {
    const announceNos = [info.vehicleModel, ...info.announceNos].filter((k): k is string => !!k);
    return {
        fileName: info.fileName,
        productName: info.productName,
        announceNos,
        admissionNos: info.admissionNos ?? [],
        admissionLevel: normalizeAdmissionLevel(info.admissionLevelRaw),
        keySignature: info.keySignature,
        // 与归组同口径：groupName 别名优先，回落文件名推导
        groupKey: resolveVehicleGroupKey(info, meta[info.fileName], brandNames),
    };
});

/** 证据强度：2=确定重复（身份键命中）；1=疑似重复（证据不足）；0=无关联（reason 非空时携带"判不同"说明） */
const evidenceLevel = (
    candidate: ImportCandidate,
    entry: ExistingEntry,
    candidateKeys: Set<string>,
    candidateGroupKey: string,
): { level: 0 | 1 | 2; reason: string } => {
    const entryKeys = new Set(entry.announceNos.map(normalizeAnnounce));
    const hasKeyOverlap = Array.from(candidateKeys).some(k => entryKeys.has(k));
    const nameMatch = normalizeName(candidate.productName) === normalizeName(entry.productName);
    const bothAnnounceLess = candidateKeys.size === 0 && entryKeys.size === 0;

    if (hasKeyOverlap) {
        // 同公告号但准入证据不同 → 判定为不同车型，不进重复裁定（2026-10-01 用户裁定：
        // 准入编号/准入等级不同即不同车，如 ZR 重报对）。准入编号相同（同准入记录）时
        // 等级差异视为数据修正，不作为"不同车"证据。
        const candNos = candidate.admissionNos ?? [];
        const bothNos = candNos.length > 0 && entry.admissionNos.length > 0;
        if (bothNos && !candNos.some(n => entry.admissionNos.includes(n))) {
            return {
                level: 0,
                reason: `同公告号但准入编号不同（${candNos[0]} ≠ ${entry.admissionNos[0]}），判定为不同车型`,
            };
        }
        const candLevel = normalizeAdmissionLevel(candidate.admissionLevel);
        if (!bothNos && candLevel && entry.admissionLevel && candLevel !== entry.admissionLevel) {
            return {
                level: 0,
                reason: `同公告号但准入等级不同（${candLevel} ≠ ${entry.admissionLevel}），判定为不同车型`,
            };
        }
        return nameMatch
            ? { level: 2, reason: `公告号相同（${[...candidateKeys].filter(k => entryKeys.has(k)).join('、')}）且产品名一致` }
            : { level: 1, reason: '公告号相同但产品名不同，需人工裁定是否同一辆车' };
    }
    if (nameMatch) {
        if (bothAnnounceLess) {
            return candidateGroupKey === entry.groupKey
                ? { level: 2, reason: '同车型组同产品名（双方均无公告号）' }
                : { level: 1, reason: '产品名相同但车型组不同，需人工裁定' };
        }
        return { level: 1, reason: bothAnnounceLess ? '产品名相同' : '产品名相同但公告号不同或缺失，需人工裁定' };
    }
    if (candidate.keySignature && entry.keySignature && candidate.keySignature === entry.keySignature) {
        return { level: 1, reason: '关键参数（车型/电量/电池品牌）高度重合，需人工裁定' };
    }
    return { level: 0, reason: '' };
};

/**
 * 单条导入候选三分类：new / updated（确定重复）/ suspect（疑似重复）。
 * 确定重复优先于疑似（同一批命中取证据最强档）。
 */
export const classifyImportCandidate = (
    candidate: ImportCandidate,
    existing: (AssetFileInfo & { keySignature?: string })[],
    meta: AssetMetaMap = {},
    brandNames: string[] = DEFAULT_BRAND_NAMES,
): ImportClassifyResult => {
    const candidateKeys = new Set(candidate.announceNos.map(normalizeAnnounce).filter(Boolean));
    const candidateGroupKey = normalizeGroupKey(deriveVehicleGroupKey(candidate.fileName, candidate.productName, brandNames));
    const entries = buildExistingEntries(existing, meta, brandNames);

    const updated: { files: string[]; reason: string } = { files: [], reason: '' };
    const suspect: { files: string[]; reason: string } = { files: [], reason: '' };
    let newReason = '';

    entries.forEach(entry => {
        const { level, reason } = evidenceLevel(candidate, entry, candidateKeys, candidateGroupKey);
        if (level === 2) {
            updated.files.push(entry.fileName);
            if (!updated.reason) updated.reason = `与现有资产「${entry.fileName}」确定重复：${reason}`;
        } else if (level === 1) {
            suspect.files.push(entry.fileName);
            if (!suspect.reason) suspect.reason = `与现有资产「${entry.fileName}」疑似重复：${reason}`;
        } else if (reason && !newReason) {
            // 判定为不同车型的说明（如"同公告号但准入编号不同"）
            newReason = reason;
        }
    });

    if (updated.files.length > 0) return { verdict: 'updated', matchedFiles: updated.files, reason: updated.reason };
    if (suspect.files.length > 0) return { verdict: 'suspect', matchedFiles: suspect.files, reason: suspect.reason };
    return { verdict: 'new', matchedFiles: [], reason: newReason || '未命中现有资产' };
};

/**
 * 批量三分类：在 classifyImportCandidate 基础上追加批次内互查——
 * 同一批次两条候选命中同一身份键时，后者判 suspect（避免一次导入自己造重复）。
 * 返回与 candidates 等长的结果数组。
 */
export const classifyImportBatch = (
    candidates: ImportCandidate[],
    existing: (AssetFileInfo & { keySignature?: string })[],
    meta: AssetMetaMap = {},
    brandNames: string[] = DEFAULT_BRAND_NAMES,
): ImportClassifyResult[] => {
    const results = candidates.map(c => classifyImportCandidate(c, existing, meta, brandNames));

    const seenKeys = new Map<string, number>(); // announceKey|name → 首见下标
    candidates.forEach((c, i) => {
        const nameKey = normalizeName(c.productName);
        const identityTokens = c.announceNos.length > 0
            ? c.announceNos.map(normalizeAnnounce).filter(Boolean)
            : [`#${nameKey}::${normalizeGroupKey(deriveVehicleGroupKey(c.fileName, c.productName, brandNames))}`];
        identityTokens.forEach(token => {
            const mapKey = `${token}::${nameKey}`;
            const firstIdx = seenKeys.get(mapKey);
            if (firstIdx !== undefined) {
                results[i] = {
                    verdict: 'suspect',
                    matchedFiles: results[i].matchedFiles,
                    reason: `与本次导入中的「${candidates[firstIdx].productName}」重复，需人工裁定`,
                };
            } else {
                seenKeys.set(mapKey, i);
            }
        });
    });

    return results;
};

/** 各 verdict 的默认落盘动作：新增→保存；更新已有→并存为新版本；疑似重复→跳过 */
export const defaultDecisionFor = (verdict: ImportVerdict): ImportDecision =>
    verdict === 'updated' ? 'keep-new' : verdict === 'suspect' ? 'skip' : 'save';
