/**
 * 属性枚举值服务
 * 从 属性值统计.csv 加载枚举值字典，提供属性名到枚举值列表的查询
 */

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
 * 加载枚举值数据
 */
async function loadEnumData(): Promise<void> {
    if (enumCache !== null) return;
    
    enumCache = new Map();
    normalizedNameMap = new Map();
    
    try {
        // 动态加载 CSV 文件内容
        const response = await fetch('/docs/字段数据/属性值统计.csv');
        if (!response.ok) {
            console.warn('无法加载属性枚举文件，使用空缓存');
            return;
        }
        
        const text = await response.text();
        const lines = text.split('\n');
        
        // 跳过表头
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            const [name, valuesStr] = parseCSVLine(line);
            if (!name) continue;
            
            const trimmedName = name.trim();
            const normalizedName = normalizeName(trimmedName);
            
            // 保存原始名称映射
            normalizedNameMap!.set(normalizedName, trimmedName);
            
            // 解析枚举值列表
            const values = valuesStr
                ? valuesStr.split('|').map(v => v.trim()).filter(v => v.length > 0)
                : [];
            
            enumCache!.set(trimmedName, values);
        }
        
        console.log(`已加载 ${enumCache.size} 个属性枚举`);
    } catch (error) {
        console.error('加载属性枚举失败:', error);
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
 * 预加载枚举数据（可在应用启动时调用）
 */
export async function preloadEnumData(): Promise<void> {
    await loadEnumData();
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
