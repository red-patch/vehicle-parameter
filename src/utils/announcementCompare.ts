import type { VehicleParameter } from '../types';

/**
 * 公告比对（设计文档 §4.5，Q16/Q17 裁定）：
 * 以公告记录参数为基准，按参数名精确匹配（trim + 压空白）逐项核对资产参数。
 * 公告为准——不一致即资产侧疑似错误。v1 只读。
 */

export interface AnnouncementCompareRow {
    name: string;
    assetValue: string;
    announceValue: string;
    match: boolean;
}

export interface AnnouncementCompareResult {
    /** 两侧同名参数的逐项对比（含一致项） */
    rows: AnnouncementCompareRow[];
    /** 仅资产有的参数 */
    onlyInAsset: { name: string; value: string }[];
    /** 仅公告有的参数 */
    onlyInAnnounce: { name: string; value: string }[];
    comparedCount: number;
    mismatchCount: number;
}

/** 同名参数去重口径：last-wins（与对比模块既有行为一致）。配对键去除全部空白——中文参数名里的空格是复制噪声 */
const toValueMap = (params: VehicleParameter[]): Map<string, string> => {
    const map = new Map<string, string>();
    for (const p of params) {
        const display = String(p.name ?? '').trim();
        if (!display) continue;
        map.set(display.replace(/\s+/g, ''), String(p.value ?? '').trim());
    }
    return map;
};

export const compareAssetWithAnnouncement = (
    assetParams: VehicleParameter[],
    announceParams: VehicleParameter[],
): AnnouncementCompareResult => {
    const assetMap = toValueMap(assetParams);
    const announceMap = toValueMap(announceParams);

    const rows: AnnouncementCompareRow[] = [];
    let mismatchCount = 0;

    for (const [name, assetValue] of assetMap) {
        if (!announceMap.has(name)) continue;
        const announceValue = announceMap.get(name)!;
        const match = assetValue === announceValue;
        if (!match) mismatchCount++;
        rows.push({ name, assetValue, announceValue, match });
    }

    const onlyInAsset: { name: string; value: string }[] = [];
    for (const [name, value] of assetMap) {
        if (!announceMap.has(name)) onlyInAsset.push({ name, value });
    }

    const onlyInAnnounce: { name: string; value: string }[] = [];
    for (const [name, value] of announceMap) {
        if (!assetMap.has(name)) onlyInAnnounce.push({ name, value });
    }

    return {
        rows,
        onlyInAsset,
        onlyInAnnounce,
        comparedCount: rows.length,
        mismatchCount,
    };
};

// ==================== 批次 vs 批次（设计文档 2026-10-02 §4.4） ====================

export interface BatchCompareRow {
    name: string;
    oldValue: string;
    newValue: string;
    /** 值不同或单侧缺失 */
    changed: boolean;
}

export interface BatchCompareResult {
    /** 两侧参数名并集（新批次顺序优先，旧批次独有排后） */
    rows: BatchCompareRow[];
    /** 一致项数 */
    sameCount: number;
    /** 差异项数（含单侧缺失） */
    changedCount: number;
}

/**
 * 同公告号两批次的参数对比（只读）：新批次为基准列。
 * 与资产对比同口径：参数名 trim + 压空白精确匹配，同名 last-wins；
 * 两侧参数先经「其它」格读时归一（readAnnouncementRecord），键值明细可直接比。
 */
export const compareBatchParams = (
    oldParams: VehicleParameter[],
    newParams: VehicleParameter[],
): BatchCompareResult => {
    const oldMap = toValueMap(oldParams);
    const newMap = toValueMap(newParams);

    const rows: BatchCompareRow[] = [];
    let sameCount = 0;
    for (const [name, newValue] of newMap) {
        const oldValue = oldMap.get(name);
        if (oldValue === undefined) {
            rows.push({ name, oldValue: '', newValue, changed: true });
        } else {
            const changed = oldValue !== newValue;
            if (!changed) sameCount++;
            rows.push({ name, oldValue, newValue, changed });
        }
    }
    for (const [name, oldValue] of oldMap) {
        if (!newMap.has(name)) rows.push({ name, oldValue, newValue: '', changed: true });
    }

    return { rows, sameCount, changedCount: rows.length - sameCount };
};
