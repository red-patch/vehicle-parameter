import { readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { loadAssetTags } from './assetManager';
import { deriveVehicleGroupKey } from './assetGovernance';
import { ASSET_SOURCE_TAGS } from './assetSourceTags';
import {
    buildAnnouncementBaseName,
    buildQueryUrl,
    findParamValue,
    uniquifyBaseName,
    writeAnnouncementRecord,
    type AnnouncementRecord,
} from './announcementRecord';
import type { VehicleParameter } from '../types';

/**
 * 存量迁移（设计文档 §6）：把资产库里带「公告数据」标签的资产转为公告中心记录
 * （有参数、无 PDF），原资产文件移入废纸篓。一次性工具。
 */

export interface MigrationCandidate {
    fileName: string;
    announceNo: string;
    batch: string;
    vehicleName: string;
    paramCount: number;
    updatedAt: string | null;
    /** 记录文件基名（不含扩展名，唯一化前） */
    baseName: string;
}

const ANNOUNCE_FALLBACK_KEYS = ['公告号', '产品号', '产品ID', '公告产品号', '产品编号'];

/**
 * 从一份公告数据资产推导迁移候选（纯函数）。
 * announceNo 链：参数「车辆型号」（公告数据源口径）→ 公告类字段 → 文件名基名；
 * vehicleName 链：参数「产品名称」→ 车型组键（剥前缀尾缀）→ 文件名基名。
 */
export const deriveMigrationCandidate = (
    fileName: string,
    productName: string | null,
    params: VehicleParameter[],
    updatedAt: string | null,
): MigrationCandidate => {
    const base = fileName.replace(/\.json$/i, '');
    const announceNo =
        findParamValue(params, ['车辆型号'])
        || findParamValue(params, ANNOUNCE_FALLBACK_KEYS)
        || base;
    const batch = findParamValue(params, ['批次', '公告批次']);
    const vehicleName = findParamValue(params, ['产品名称'])
        || deriveVehicleGroupKey(fileName, productName)
        || base;
    return {
        fileName,
        announceNo,
        batch,
        vehicleName,
        paramCount: params.length,
        updatedAt,
        baseName: buildAnnouncementBaseName({ vehicleName, announceNo, batch }) || base,
    };
};

export const buildMigrationRecord = (
    candidate: MigrationCandidate,
    parameters: VehicleParameter[],
): AnnouncementRecord => ({
    version: '1.0',
    announceNo: candidate.announceNo,
    batch: candidate.batch,
    vehicleName: candidate.vehicleName,
    sourceUrl: buildQueryUrl(candidate.announceNo),
    importedAt: candidate.updatedAt || new Date().toISOString(),
    pdfFile: null,
    parameters,
});

export interface MigrationResult {
    migrated: MigrationCandidate[];
    errors: { fileName: string; error: string }[];
}

/** 扫描资产库中带「公告数据」标签的资产，返回可迁移候选 */
export const collectAnnouncementMigrationCandidates = async (
    libraryPath: string,
): Promise<MigrationCandidate[]> => {
    const tags = await loadAssetTags(libraryPath);
    const candidates: MigrationCandidate[] = [];
    for (const [fileName, fileTags] of Object.entries(tags)) {
        if (!fileTags.includes(ASSET_SOURCE_TAGS.announcement)) continue;
        try {
            const fullPath = await join(libraryPath, fileName);
            const parsed = JSON.parse(await readTextFile(fullPath)) as {
                productName?: string;
                updatedAt?: string;
                parameters?: VehicleParameter[];
            };
            if (!Array.isArray(parsed.parameters)) continue;
            candidates.push(
                deriveMigrationCandidate(fileName, parsed.productName ?? null, parsed.parameters, parsed.updatedAt ?? null),
            );
        } catch (e) {
            console.warn('跳过无法读取的公告数据资产:', fileName, e);
        }
    }
    return candidates.sort((a, b) => a.fileName.localeCompare(b.fileName));
};

/**
 * 执行迁移：逐条写公告记录 JSON（撞名自动加序号）+ 原资产文件移入废纸篓。
 * 标签旁路里的悬空条目由既有扫描对账（reconcileSidecarEntries）自动清理。
 */
export const runAnnouncementMigration = async (
    libraryPath: string,
    candidates: MigrationCandidate[],
): Promise<MigrationResult> => {
    const { moveToTrash } = await import('./announcementRecord');
    const taken = new Set<string>();
    const result: MigrationResult = { migrated: [], errors: [] };

    for (const candidate of candidates) {
        try {
            const fullPath = await join(libraryPath, candidate.fileName);
            const parsed = JSON.parse(await readTextFile(fullPath)) as { parameters?: VehicleParameter[] };
            const parameters = Array.isArray(parsed.parameters) ? parsed.parameters : [];
            // 逐条占用基名：首条用净名，同公告号同批次的重复资产（ZR 重报对）落到 (2)
            const base = uniquifyBaseName(candidate.baseName, taken);
            taken.add(base);
            await writeAnnouncementRecord(
                libraryPath,
                `${base}.json`,
                buildMigrationRecord(candidate, parameters),
            );
            await moveToTrash([fullPath]);
            result.migrated.push(candidate);
        } catch (e) {
            result.errors.push({ fileName: candidate.fileName, error: e instanceof Error ? e.message : String(e) });
        }
    }
    return result;
};
