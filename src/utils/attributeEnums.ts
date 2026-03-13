/**
 * 属性枚举值服务
 * 从 属性值统计.csv 加载枚举值字典，提供属性名到枚举值列表的查询
 * 并且支持通过注入 libraryPath 热替换为使用本地资产目录的 custom_enums.json
 */
import { loadCustomConfig } from './assetManager';
import defaultEnumCsv from '../assets/attribute_values.txt?raw';

// 枚举值缓存
let enumCache: Map<string, string[]> | null = null;
// 标准化名称到原始名称的映射
let normalizedNameMap: Map<string, string> | null = null;

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
 * 解析 CSV 行，处理引号包裹的字段
 */
function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

/**
 * 将 CSV 文本解析并写入缓存。返回写入字段数。
 */
function applyCsvToCache(csvText: string): number {
    if (!enumCache || !normalizedNameMap) return 0;

    const text = csvText.replace(/^\uFEFF/, ''); // 清除 UTF-8 BOM
    const headSample = text.slice(0, 200).toLowerCase();
    // 防止打包环境静态资源回退到 index.html 被误解析
    if (headSample.includes('<html') || headSample.includes('<head') || headSample.includes('<body')) {
        console.error('❌ 属性枚举 CSV 内容异常：检测到 HTML，已跳过加载。');
        return 0;
    }

    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return 0;

    let loaded = 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [name, valuesStr] = parseCSVLine(line);
        if (!name) continue;

        const trimmedName = name.trim();
        if (!trimmedName) continue;
        const normalizedName = normalizeName(trimmedName);
        normalizedNameMap.set(normalizedName, trimmedName);

        const values = valuesStr
            ? valuesStr.split('|').map(v => v.trim()).filter(v => v.length > 0)
            : [];

        enumCache.set(trimmedName, values);
        loaded++;
    }

    return loaded;
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
    
    // 默认优先加载打包内置 CSV，避免运行时路径回退导致误读 index.html
    if (enumCache.size === 0) {
        try {
            const loaded = applyCsvToCache(defaultEnumCsv);
            console.log(`✅ 已加载 ${loaded} 个系统默认属性枚举（内置 CSV）`);
        } catch (error) {
            console.error('加载系统默认属性枚举失败:', error);
        }
    }

    // 第二步：尝试通过传入的 libraryPath 挂载 custom_enums.json (它的优先级最高，将覆写对应键集)
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
