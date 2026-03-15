import { writeTextFile, readTextFile, exists, readDir, remove } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { SheetData, VehicleParameter } from '../types';
import { getAssetBaseName, toAssetFileName } from './assetNaming';

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
}

/**
 * 遍历并轻量解析资产库的所有文件，获得核心元信息和概览统计
 * 这对实现看板级混排与列表呈现极其重要，支持大批量的毫秒级读取
 */
export const getAssetFilesWithInfo = async (libraryPath: string): Promise<AssetFileInfo[]> => {
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
                    
                    return {
                        fileName,
                        productName: parsed.productName || fileName.replace(/\.json$/i, ''),
                        updatedAt: parsed.updatedAt || parsed.createdAt || null,
                        totalParams: params.length,
                        filledParams: filled
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
