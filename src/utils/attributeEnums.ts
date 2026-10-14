/**
 * 属性枚举值服务
 * 枚举值字典完全由用户自定义：由 UI 的「从 Excel 导入枚举」写入本地资产目录的
 * custom_enums.json，应用启动后经注入的 libraryPath 载入。应用不内置任何默认字典。
 */
import { loadCustomConfig } from './assetManager';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

interface EnumFieldMeta {
    category?: string;
    categoryPath?: string;
    required?: string;
    key?: string;
}

// 枚举值缓存
let enumCache: Map<string, string[]> | null = null;
// 字段元数据缓存：字段名 → 元数据
let enumMetaCache: Record<string, EnumFieldMeta> | null = null;
// 标准化名称到原始名称的映射
let normalizedNameMap: Map<string, string> | null = null;

// 激活过滤器配置：用户勾选的所属类目 + 属性类别
let activeFilterConfig: { categoryPaths: string[]; categories: string[] } | null = null;

/**
 * 标准化属性名称（去除空格、统一括号格式）
 */
function normalizeName(name: string): string {
    return name
        .trim()
        .replace(/\s+/g, '') // 去除所有空格
        .replace(/（/g, '(')  // 中文括号转英文
        .replace(/）/g, ')')
        .toLowerCase();
}

/**
 * 判断 custom_enums.json 是否疑似被 HTML 污染（如把 index.html 当成字典）
 */
function isSuspiciousCustomEnum(config: Record<string, string[]>): boolean {
    const keys = Object.keys(config);
    if (keys.length === 0) return false;

    const suspicious = keys.filter(k => /<[^>]+>/.test(k) || /^<!doctype/i.test(k.trim()));
    return suspicious.length / keys.length > 0.2;
}

/**
 * 加载枚举值数据
 * @param libraryPath 可选的用户资产目录路径。存在时将尝试载入 custom_enums.json
 */
async function loadEnumData(libraryPath?: string): Promise<void> {
    if (enumCache !== null && !libraryPath) return; // 普通加载如果已有缓存则短路
    
    // 初始化或获取引用
    if (enumCache === null || normalizedNameMap === null) {
        enumCache = new Map();
        normalizedNameMap = new Map();
    }

    // 从注入的资产目录挂载 custom_enums.json（唯一数据来源，应用不内置默认字典）
    if (libraryPath) {
        try {
            const customConfig = await loadCustomConfig<Record<string, string[]>>(libraryPath, 'custom_enums.json');
            if (customConfig && typeof customConfig === 'object') {
                if (isSuspiciousCustomEnum(customConfig)) {
                    console.error('❌ custom_enums.json 疑似被 HTML 污染，已忽略此文件。');
                    return;
                }

                let overwriteCount = 0;
                for (const [key, values] of Object.entries(customConfig)) {
                    if (Array.isArray(values)) {
                        const trimmedName = key.trim();
                        const normalizedName = normalizeName(trimmedName);
                        
                        normalizedNameMap!.set(normalizedName, trimmedName);
                        enumCache!.set(trimmedName, values);
                        overwriteCount++;
                    }
                }
                if (overwriteCount > 0) {
                    console.log(`✅ 已成功加载并覆写 ${overwriteCount} 个业务专属字典配置 (custom_enums.json)`);
                }
            }
        } catch (e) {
            console.error('挂载自定义 custom_enums.json 失败', e);
        }
    }
}

/**
 * 获取属性的枚举值列表
 * @param attributeName 属性名称
 * @returns 枚举值数组，如果没有找到则返回空数组
 */
export async function getEnumValues(attributeName: string): Promise<string[]> {
    await loadEnumData();
    
    if (!enumCache) return [];
    
    // 精确匹配
    if (enumCache.has(attributeName)) {
        return enumCache.get(attributeName) || [];
    }
    
    // 模糊匹配：标准化后比较
    const normalizedInput = normalizeName(attributeName);
    
    for (const [originalName, values] of enumCache.entries()) {
        const normalizedOriginal = normalizeName(originalName);
        if (normalizedOriginal === normalizedInput) {
            return values;
        }
    }
    
    return [];
}

/**
 * 检查属性是否有枚举值
 */
export async function hasEnumValues(attributeName: string): Promise<boolean> {
    const values = await getEnumValues(attributeName);
    return values.length > 0;
}

/**
 * 获取所有属性名称列表（同步版本，需确保数据已加载）
 */
export function getAllAttributeNames(): string[] {
    return enumCache ? Array.from(enumCache.keys()) : [];
}

/**
 * 预加载枚举数据（可在应用启动时乃至选择仓库路径后多发调用）
 */
export async function preloadEnumData(libraryPath?: string): Promise<void> {
    await loadEnumData(libraryPath);

    // 加载字段元数据
    if (libraryPath) {
        try {
            const meta = await loadCustomConfig<Record<string, EnumFieldMeta>>(libraryPath, 'custom_enum_meta.json');
            enumMetaCache = meta ?? {};
        } catch {
            enumMetaCache = {};
        }
        // 加载激活过滤器配置
        try {
            const filter = await loadCustomConfig<{ categoryPaths: string[]; categories: string[] }>(libraryPath, 'custom_enum_active_filter.json');
            activeFilterConfig = filter ?? null;
        } catch {
            activeFilterConfig = null;
        }
    } else {
        enumMetaCache = {};
        activeFilterConfig = null;
    }
}

/**
 * 获取当前的激活过滤器配置
 */
export function getEnumActiveFilter(): { categoryPaths: string[]; categories: string[] } {
    return {
        categoryPaths: activeFilterConfig?.categoryPaths ?? [],
        categories: activeFilterConfig?.categories ?? [],
    };
}

/**
 * 设置激活过滤器配置（并保存到文件）
 */
export async function setEnumActiveFilter(
    libraryPath: string,
    config: { categoryPaths: string[]; categories: string[] }
): Promise<void> {
    activeFilterConfig = config;
    const filePath = await join(libraryPath, 'custom_enum_active_filter.json');
    await writeTextFile(filePath, JSON.stringify(config, null, 2));
}

/**
 * 判断字段是否已激活（需同时满足用户勾选的所属类目 + 属性类别）
 */
export function isEnumActive(fieldName: string): boolean {
    const meta = enumMetaCache;
    const filter = activeFilterConfig;
    if (!meta) return true;
    if (!filter) return true;
    if (filter.categoryPaths.length === 0 && filter.categories.length === 0) return true;

    // 先精确查找，再按标准化名称模糊匹配（处理括号全角/半角差异）
    let f = meta[fieldName];
    if (!f) {
        const normalized = normalizeName(fieldName);
        for (const [key, val] of Object.entries(meta)) {
            if (normalizeName(key) === normalized) {
                f = val;
                break;
            }
        }
    }
    if (!f) return false;

    const matchCategoryPath = filter.categoryPaths.length === 0
        || (!!f.categoryPath && filter.categoryPaths.includes(f.categoryPath));
    const matchCategory = filter.categories.length === 0
        || (!!f.category && filter.categories.includes(f.category));

    return matchCategoryPath && matchCategory;
}

/**
 * 获取所有可能的所属类目列表（从元数据中提取）
 */
export function getAllCategoryPaths(): string[] {
    if (!enumMetaCache) return [];
    const set = new Set<string>();
    for (const meta of Object.values(enumMetaCache)) {
        if (meta.categoryPath) set.add(meta.categoryPath);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/**
 * 获取所有可能的属性类别列表（从元数据中提取）
 */
export function getAllCategories(): string[] {
    if (!enumMetaCache) return [];
    const set = new Set<string>();
    for (const meta of Object.values(enumMetaCache)) {
        if (meta.category) set.add(meta.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

/**
 * 判断字段名是否在枚举字典中（支持标准化匹配：忽略大小写、全角半角括号）
 */
export function isKnownAttributeName(name: string): boolean {
    if (!enumCache) return false;
    if (enumCache.has(name)) return true;
    const normalized = normalizeName(name);
    return normalizedNameMap ? normalizedNameMap.has(normalized) : false;
}

/**
 * 获取已激活的字段名列表（根据用户配置的过滤器）
 */
export function getActiveAttributeNames(): string[] {
    const all = getAllAttributeNames();
    const meta = enumMetaCache;
    const filter = activeFilterConfig;
    if (!meta || !filter) return all;
    if (filter.categoryPaths.length === 0 && filter.categories.length === 0) return all;
    return all.filter(name => isEnumActive(name));
}

/**
 * 获取已激活的枚举字段中必填属性为"是"的字段名列表
 */
export function getActiveRequiredFields(): string[] {
    const active = getActiveAttributeNames();
    const meta = enumMetaCache;
    if (!meta) return active;
    return active.filter(name => {
        const f = meta[name] as EnumFieldMeta | undefined;
        return f?.required === '是';
    });
}

/**
 * 同步版本：获取枚举值（仅在数据已加载后使用）
 */
export function getEnumValuesSync(attributeName: string): string[] {
    if (!enumCache) return [];
    
    // 精确匹配
    if (enumCache.has(attributeName)) {
        return enumCache.get(attributeName) || [];
    }
    
    // 模糊匹配
    const normalizedInput = normalizeName(attributeName);
    for (const [originalName, values] of enumCache.entries()) {
        if (normalizeName(originalName) === normalizedInput) {
            return values;
        }
    }
    
    return [];
}

/**
 * 检查数据是否已加载
 */
export function isEnumDataLoaded(): boolean {
    return enumCache !== null;
}
