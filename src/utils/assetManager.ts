import { writeTextFile, readTextFile, exists, readDir, remove } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { SheetData, VehicleParameter } from '../types';
import { getAssetBaseName, toAssetFileName } from './assetNaming';
import { buildBatchTagUpdates } from './assetTagBatch';

/**
 * 结构化的资产文件格式
 */
export interface AssetFileFormat {
    version: string;
    productName: string;
    createdAt: string;
    updatedAt: string;
    parameters: VehicleParameter[];
}

/**
 * 将整车数据保存为标准化的 JSON 资产文件
 * @param libraryPath 资产库根目录
 * @param fileName 文件名 (需含 .json 后缀)
 * @param productName 车型名称
 * @param parameters 参数列表
 * @returns 最终保存的绝对路径
 */
export const saveAssetFile = async (
    libraryPath: string,
    fileName: string,
    productName: string,
    parameters: VehicleParameter[]
): Promise<string> => {
    // 确保有后缀
    const finalFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const fullPath = await join(libraryPath, finalFileName);

    const data: AssetFileFormat = {
        version: '1.0',
        productName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parameters
    };

    const jsonString = JSON.stringify(data, null, 2);
    await writeTextFile(fullPath, jsonString);
    
    return fullPath;
};

/**
 * 检查资产文件是否存在
 * @param libraryPath 资产库根目录
 * @param fileName 文件名
 */
export const checkAssetExists = async (libraryPath: string, fileName: string): Promise<boolean> => {
    const finalFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
    const fullPath = await join(libraryPath, finalFileName);
    return await exists(fullPath);
};

/** 判断是否为资产数据文件（排除元数据/配置文件） */
const isAssetDataFile = (name: string) =>
    name.endsWith('.json') && !name.startsWith('_') && !name.startsWith('custom_');

/**
 * 获取资产库中的所有预设文件
 * @param libraryPath 资产库根目录
 */
export const getAssetFiles = async (libraryPath: string): Promise<string[]> => {
    try {
        if (!await exists(libraryPath)) return [];
        const entries = await readDir(libraryPath);
        return entries
            .filter(entry => entry.name && isAssetDataFile(entry.name))
            .map(entry => entry.name!);
    } catch (error) {
        console.error("Failed to read asset directory", error);
        return [];
    }
};

export interface AssetFileInfo {
    fileName: string;
    productName: string;
    updatedAt: string | null;
    totalParams: number;
    filledParams: number;
    /** 公告号列表（从参数中提取的产品号/产品ID/公告号等） */
    announceNos: string[];
    /** 车辆型号（公告数据源以此为公告号） */
    vehicleModel: string | null;
    /** 数据级别（治理）：参数含「准入信息」组 → 公告/准入级 */
    hasAdmissionInfo: boolean;
    /** 审批状态（治理）：准入信息里「审批状态」的值（已审核/驳回） */
    approvalStatus: string | null;
}

/**
 * 遍历并轻量解析资产库的所有文件，获得核心元信息和概览统计
 *
 * Tauri 环境优先走 Rust 命令 scan_asset_library：读文件+解析+统计全部在
 * Rust 线程池完成，只回传元信息——资产库达数百文件/几十 MB 时，主线程
 * 不再被 JSON.parse 分片阻塞（这是页面切换卡顿的主因）。
 */
export const getAssetFilesWithInfo = async (libraryPath: string): Promise<AssetFileInfo[]> => {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        try {
            const { invoke } = await import('@tauri-apps/api/core');
            return await invoke<AssetFileInfo[]>('scan_asset_library', { path: libraryPath });
        } catch (e) {
            console.warn('Rust scan_asset_library 失败，回退 JS 实现', e);
        }
    }
    try {
        if (!await exists(libraryPath)) return [];
        const entries = await readDir(libraryPath);
        const files = entries.filter(entry => entry.name && isAssetDataFile(entry.name)).map(e => e.name!);
        
        const results = await Promise.all(
            files.map(async fileName => {
                const fullPath = await join(libraryPath, fileName);
                try {
                    const content = await readTextFile(fullPath);
                    const parsed: AssetFileFormat = JSON.parse(content);
                    const params = parsed.parameters || [];
                    const filled = params.filter(p => p.value !== undefined && p.value !== null && String(p.value).trim() !== '').length;

                    // 提取公告号：从参数中扫描公告相关字段
                    // 仅保留形如 JHC6507BEVR2 的纯车架号，过滤掉复合ID（如 "V7E 50kwh_20260303-JHC6507BEVR2"）
                    const ANNOUNCE_NAME_KEYS = ['公告号', '产品号', '产品ID', '公告产品号', '产品编号'];
                    const announceNos = Array.from(new Set(
                        params
                            .filter(p => ANNOUNCE_NAME_KEYS.some(k => p.name === k || p.name?.includes(k)))
                            .map(p => String(p.value ?? '').trim())
                            .filter(v => /^[A-Za-z0-9]+$/.test(v)) // 只取纯车架号格式（不区分大小写）
                    ));

                    // 公告数据源的公告号 = 车辆型号
                    const vehicleModelParam = params.find(p => p.name === '车辆型号');
                    const vehicleModel = vehicleModelParam?.value ? String(vehicleModelParam.value).trim() : null;

                    // 治理字段：与 Rust scan_one 对齐
                    const hasAdmissionInfo = params.some(p => (p.group || '').includes('准入'));
                    const statusParam = params.find(p => p.name === '审批状态' && String(p.value ?? '').trim() !== '');
                    const approvalStatus = statusParam ? String(statusParam.value).trim() : null;

                    return {
                        fileName,
                        productName: parsed.productName || fileName.replace(/\.json$/i, ''),
                        updatedAt: parsed.updatedAt || parsed.createdAt || null,
                        totalParams: params.length,
                        filledParams: filled,
                        announceNos,
                        vehicleModel,
                        hasAdmissionInfo,
                        approvalStatus,
                    };
                } catch (e) {
                    console.warn(`Failed to parse asset file ${fileName}`, e);
                    return null;
                }
            })
        );
        
        return results.filter(Boolean) as AssetFileInfo[];
    } catch (error) {
        console.error("Failed to read asset directory with info", error);
        return [];
    }
};

/**
 * 加载并解析一个本地 JSON 资产文件，转为标准 SheetData 以供系统复用
 * @param libraryPath 资产库根目录
 * @param fileName 文件名
 */
export const loadAssetFile = async (libraryPath: string, fileName: string): Promise<SheetData | null> => {
    try {
        const fullPath = await join(libraryPath, fileName);
        if (!await exists(fullPath)) return null;
        
        const content = await readTextFile(fullPath);
        const parsed: AssetFileFormat = JSON.parse(content);
        const assetProductName = parsed.productName || fileName.replace(/\.json$/i, '');

        const normalizedData = (parsed.parameters || []).map(p => ({
            ...p,
            productName: p.productName || assetProductName
        }));

        return {
            fileName: fileName,
            data: normalizedData,
            rawHeaders: ['参数分组', '参数名称', '参数值']
        };
    } catch (error) {
        console.error("Failed to load asset file", error);
        return null;
    }
};

/**
 * 尝试从资产库加载自定义 JSON 配置文件
 * @param libraryPath 资产库根目录
 * @param fileName 文件名（如 custom_enums.json）
 */
export const loadCustomConfig = async <T>(libraryPath: string, fileName: string): Promise<T | null> => {
    try {
        if (!libraryPath) return null;
        const fullPath = await join(libraryPath, fileName);
        if (!await exists(fullPath)) return null;
        
        const content = await readTextFile(fullPath);
        return JSON.parse(content) as T;
    } catch (error) {
        console.error(`Failed to load custom config ${fileName}`, error);
        return null;
    }
};

/**
 * 重命名资产库中的文件
 * @param libraryPath 资产库根目录
 * @param oldFileName 旧文件名
 * @param newFileName 新文件名
 */
export const renameAssetFile = async (
    libraryPath: string, 
    oldFileName: string, 
    newFileName: string
): Promise<boolean> => {
    try {
        const finalOldName = oldFileName.endsWith('.json') ? oldFileName : `${oldFileName}.json`;
        const finalNewName = newFileName.endsWith('.json') ? newFileName : `${newFileName}.json`;
        
        const oldPath = await join(libraryPath, finalOldName);
        const newPath = await join(libraryPath, finalNewName);
        
        if (!await exists(oldPath)) return false;
        
        if (!await exists(oldPath)) return false;
        
        const content = await readTextFile(oldPath);
        await writeTextFile(newPath, content);
        
        if (oldPath !== newPath) {
            await remove(oldPath);
        }

        // 同步标签映射
        try {
            const tags = await loadAssetTags(libraryPath);
            if (tags[finalOldName]) {
                tags[finalNewName] = tags[finalOldName];
                delete tags[finalOldName];
                await saveAssetTags(libraryPath, tags);
            }
        } catch (e) {
            console.warn('Failed to sync tags during rename', e);
        }

        // 同步治理元数据
        await syncMetaOnRename(libraryPath, finalOldName, finalNewName);

        return true;
    } catch (error) {
        console.error("Failed to rename asset file", error);
        return false;
    }
};

export const renameAssetIdentity = async (
    libraryPath: string,
    oldFileName: string,
    newBaseName: string
): Promise<{ success: boolean; fileName: string; productName: string }> => {
    try {
        const normalizedBaseName = getAssetBaseName(newBaseName);
        if (!normalizedBaseName) {
            return { success: false, fileName: oldFileName, productName: '' };
        }

        const finalOldName = oldFileName.endsWith('.json') ? oldFileName : `${oldFileName}.json`;
        const finalNewName = toAssetFileName(normalizedBaseName);
        const oldPath = await join(libraryPath, finalOldName);
        const newPath = await join(libraryPath, finalNewName);

        if (!await exists(oldPath)) {
            return { success: false, fileName: finalOldName, productName: normalizedBaseName };
        }

        const content = await readTextFile(oldPath);
        const parsed: AssetFileFormat = JSON.parse(content);
        parsed.productName = normalizedBaseName;
        parsed.updatedAt = new Date().toISOString();
        parsed.parameters = (parsed.parameters || []).map(parameter => ({
            ...parameter,
            productName: normalizedBaseName,
        }));

        await writeTextFile(newPath, JSON.stringify(parsed, null, 2));

        if (oldPath !== newPath) {
            await remove(oldPath);
        }

        try {
            const tags = await loadAssetTags(libraryPath);
            if (tags[finalOldName]) {
                tags[finalNewName] = tags[finalOldName];
                delete tags[finalOldName];
                await saveAssetTags(libraryPath, tags);
            }
        } catch (e) {
            console.warn('Failed to sync tags during unified asset rename', e);
        }

        // 同步治理元数据
        await syncMetaOnRename(libraryPath, finalOldName, finalNewName);

        return {
            success: true,
            fileName: finalNewName,
            productName: normalizedBaseName,
        };
    } catch (error) {
        console.error('Failed to rename asset identity', error);
        return { success: false, fileName: oldFileName, productName: getAssetBaseName(newBaseName) };
    }
};

export const renameAssetProductName = async (
    libraryPath: string,
    fileName: string,
    newProductName: string
): Promise<boolean> => {
    try {
        const finalFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
        const fullPath = await join(libraryPath, finalFileName);

        if (!await exists(fullPath)) return false;

        const content = await readTextFile(fullPath);
        const parsed: AssetFileFormat = JSON.parse(content);
        const trimmedName = newProductName.trim();
        if (!trimmedName) return false;

        parsed.productName = trimmedName;
        parsed.updatedAt = new Date().toISOString();
        parsed.parameters = (parsed.parameters || []).map(parameter => ({
            ...parameter,
            productName: trimmedName
        }));

        await writeTextFile(fullPath, JSON.stringify(parsed, null, 2));
        return true;
    } catch (error) {
        console.error('Failed to rename asset product name', error);
        return false;
    }
};

/**
 * 删除资产库中的文件
 * @param libraryPath 资产库根目录
 * @param fileName 文件名
 */
export const deleteAssetFile = async (libraryPath: string, fileName: string): Promise<boolean> => {
    try {
        const finalFileName = fileName.endsWith('.json') ? fileName : `${fileName}.json`;
        const fullPath = await join(libraryPath, finalFileName);
        
        if (!await exists(fullPath)) return false;
        
        await remove(fullPath);

        // 同步清除标签
        try {
            const tags = await loadAssetTags(libraryPath);
            if (tags[finalFileName]) {
                delete tags[finalFileName];
                await saveAssetTags(libraryPath, tags);
            }
        } catch (e) {
            console.warn('Failed to sync tags during delete', e);
        }

        // 同步清除治理元数据
        await syncMetaOnDelete(libraryPath, finalFileName);

        return true;
    } catch (error) {
        console.error("Failed to delete asset file", error);
        return false;
    }
};

// ==================== 标签管理 ====================

const TAGS_FILE = '_asset_tags.json';

/**
 * 加载资产标签映射
 */
export const loadAssetTags = async (libraryPath: string): Promise<Record<string, string[]>> => {
    try {
        const fullPath = await join(libraryPath, TAGS_FILE);
        if (!await exists(fullPath)) return {};
        const content = await readTextFile(fullPath);
        return JSON.parse(content) as Record<string, string[]>;
    } catch (error) {
        console.error('Failed to load asset tags', error);
        return {};
    }
};

/**
 * 保存整个标签映射
 */
export const saveAssetTags = async (libraryPath: string, tags: Record<string, string[]>): Promise<void> => {
    try {
        const fullPath = await join(libraryPath, TAGS_FILE);
        await writeTextFile(fullPath, JSON.stringify(tags, null, 2));
    } catch (error) {
        console.error('Failed to save asset tags', error);
    }
};

/**
 * 设置单个资产的标签并持久化
 */
export const setAssetFileTags = async (libraryPath: string, fileName: string, fileTags: string[]): Promise<void> => {
    const tags = await loadAssetTags(libraryPath);
    if (fileTags.length === 0) {
        delete tags[fileName];
    } else {
        tags[fileName] = fileTags;
    }
    await saveAssetTags(libraryPath, tags);
};

/**
 * 批量为多个资产追加标签。普通标签合并去重；互斥组标签替换组内已有标签
 * （exclusiveGroupTags 由调用方从标签分组配置解析，见 assetTagGroups.getExclusiveGroupTagSets）。
 * 一次读盘、一次写盘，避免逐个 setAssetFileTags 造成的 N 次整文件读写。
 * @returns 更新后的完整标签映射（以盘上最新数据为准，供调用方回写 UI）
 */
export const batchAddAssetTags = async (
    libraryPath: string,
    fileNames: string[],
    tagsToAdd: string[],
    exclusiveGroupTags?: string[][]
): Promise<Record<string, string[]>> => {
    const tags = await loadAssetTags(libraryPath);
    const updates = buildBatchTagUpdates(tags, fileNames, tagsToAdd, { exclusiveGroupTags });
    if (Object.keys(updates).length > 0) {
        await saveAssetTags(libraryPath, { ...tags, ...updates });
        return { ...tags, ...updates };
    }
    return tags;
};

// ==================== 治理元数据（主文件/历史/废弃） ====================

export const META_FILE = '_asset_meta.json';

/** 单个资产的治理标注（旁路存储在 META_FILE，不写入资产 JSON 本体） */
export interface AssetGovernanceMeta {
    /** 主文件标记：同一车型组内原则上只有一个 */
    isPrimary?: boolean;
    /** 状态标记：历史版本 / 废弃（只打标，不隐藏、不移动文件） */
    status?: 'superseded' | 'deprecated';
    note?: string;
}

export type AssetMetaMap = Record<string, AssetGovernanceMeta>;

/** 加载治理元数据映射（文件不存在/损坏时返回空表） */
export const loadAssetMeta = async (libraryPath: string): Promise<AssetMetaMap> => {
    try {
        const fullPath = await join(libraryPath, META_FILE);
        if (!await exists(fullPath)) return {};
        const content = await readTextFile(fullPath);
        return JSON.parse(content) as AssetMetaMap;
    } catch (error) {
        console.error('Failed to load asset meta', error);
        return {};
    }
};

/** 保存整个治理元数据映射 */
export const saveAssetMeta = async (libraryPath: string, meta: AssetMetaMap): Promise<void> => {
    try {
        const fullPath = await join(libraryPath, META_FILE);
        await writeTextFile(fullPath, JSON.stringify(meta, null, 2));
    } catch (error) {
        console.error('Failed to save asset meta', error);
    }
};

/**
 * 更新单个资产的治理元数据并持久化
 * @param patch null 表示清除该文件的全部治理标注
 */
export const setAssetFileMeta = async (
    libraryPath: string,
    fileName: string,
    patch: AssetGovernanceMeta | null
): Promise<void> => {
    const meta = await loadAssetMeta(libraryPath);
    if (patch === null || Object.keys(patch).length === 0) {
        delete meta[fileName];
    } else {
        meta[fileName] = { ...(meta[fileName] || {}), ...patch };
    }
    await saveAssetMeta(libraryPath, meta);
};

/** 重命名资产时同步迁移治理元数据（与标签同步同款逻辑） */
const syncMetaOnRename = async (libraryPath: string, oldName: string, newName: string): Promise<void> => {
    try {
        const meta = await loadAssetMeta(libraryPath);
        if (meta[oldName]) {
            meta[newName] = meta[oldName];
            delete meta[oldName];
            await saveAssetMeta(libraryPath, meta);
        }
    } catch (e) {
        console.warn('Failed to sync meta during rename', e);
    }
};

/** 删除资产时同步清除治理元数据 */
const syncMetaOnDelete = async (libraryPath: string, fileName: string): Promise<void> => {
    try {
        const meta = await loadAssetMeta(libraryPath);
        if (meta[fileName]) {
            delete meta[fileName];
            await saveAssetMeta(libraryPath, meta);
        }
    } catch (e) {
        console.warn('Failed to sync meta during delete', e);
    }
};
