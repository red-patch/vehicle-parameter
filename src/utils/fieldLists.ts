// 快捷字段列表模块
// 数据直接内嵌，在此基础上增加支持加载指定目录下的 custom_fields.json 支持热替换
import { loadCustomConfig } from './assetManager';


export interface FieldGroupConfigItem {
    id: string;
    name: string;
    fields: string[];
    /**
     * 字段取值来源：输出字段名 → 来源规则。
     *
     * **不要用 `Record<string,string>`**：同一个目标字段在不同车型上叫法不同，
     * 也可能要由多个资产字段拼成，1 对 N 是常态不是例外。
     * - `candidates`: 按顺序尝试的资产字段名，取第一个在当前车型存在的
     * - `template`: 多候选同时命中时的拼接模板（`{0}×{1}×{2}`）
     */
    sources?: Record<string, FieldSourceRule>;
    /**
     * 必填字段集合（字段名的数组，不用对象 map）。
     *
     * 与 `fields` / `sources` **独立存储**：字段清单从 Excel 覆盖导入时，
     * 这个集合按字段名原样保留——重导模板不能把人工标好的必填抹掉。
     * 不在 `fields` 里的名字在归一化时会被清掉，避免留下已删除字段的必填标记。
     */
    required?: string[];
}

export interface FieldSourceRule {
    /** 按顺序尝试的资产字段名 */
    candidates: string[];
    /** 多来源拼接模板；单来源留空 = 直取值 */
    template?: string;
}

/** 导出格式：只描述「怎么出文件」，字段永远来自字段组（避免两处维护） */
export interface ExportFormat {
    id: string;
    name: string;
    /** 引用的字段组 id */
    fieldGroupId: string;
    /** Excel sheet 名 */
    sheetName: string;
    /** 文件名模板，支持 {车型} {日期} {格式} */
    fileNamePattern: string;
}

export interface CustomFieldsConfig {
    groups?: FieldGroupConfigItem[];
    /** 导出格式列表（与字段组同文件，复用同一套加载/保存） */
    exportFormats?: ExportFormat[];
    systemRequired?: string[];
    qualityCheck?: string[];
}

export const DEFAULT_SHEET_NAME = '产品准入导入模版';
export const DEFAULT_FILE_NAME_PATTERN = '车上云系统导入_{车型}_{日期}';

export const DEFAULT_FIELD_GROUPS: FieldGroupConfigItem[] = [
    {
        id: 'system-required',
        name: '系统必填字段',
        fields: [],
    },
    {
        id: 'quality-check',
        name: '质量验车字段',
        fields: [],
    },
];

let cachedFieldGroups: FieldGroupConfigItem[] = DEFAULT_FIELD_GROUPS;
let cachedExportFormats: ExportFormat[] = [];

const normalizeFields = (fields: string[]) =>
    Array.from(new Set(fields.map((field) => field.trim()).filter(Boolean)));

/** 兼容旧格式（`"字段": "来源名"`）与手写的破损条目，统一成规则对象 */
const normalizeSourceRule = (raw: unknown): FieldSourceRule | null => {
    if (typeof raw === 'string') {
        const name = raw.trim();
        return name ? { candidates: [name] } : null;
    }
    if (raw && typeof raw === 'object') {
        const candidates = (raw as FieldSourceRule).candidates;
        if (!Array.isArray(candidates)) return null;
        const cleaned = candidates.map(c => String(c).trim()).filter(Boolean);
        if (!cleaned.length) return null;
        const template = typeof (raw as FieldSourceRule).template === 'string'
            ? (raw as FieldSourceRule).template!.trim()
            : '';
        return { candidates: cleaned, ...(template ? { template } : {}) };
    }
    return null;
};

/** 必填集合只保留仍是本组成员的字段名 */
const pruneRequired = (required: string[], fields: string[]): string[] => {
    const keep = new Set(fields.map(f => f.trim()).filter(Boolean));
    return Array.from(new Set(required.map(r => String(r).trim()).filter(r => r && keep.has(r))));
};

const pruneSources = (
    sources: Record<string, FieldSourceRule | string>,
    fields: string[],
): Record<string, FieldSourceRule> => {
    const keep = new Set(fields.map(f => f.trim()).filter(Boolean));
    const next: Record<string, FieldSourceRule> = {};
    for (const [field, raw] of Object.entries(sources)) {
        if (!keep.has(field)) continue;
        const rule = normalizeSourceRule(raw);
        if (rule) next[field] = rule;
    }
    return next;
};

/** 导出格式去重与兜底：字段组必须存在，否则该格式不可用 */
/**
 * 导出格式归一化（导出供测试）。
 *
 * 这里会**丢弃引用了不存在字段组的格式**。所以「新建格式后下拉没数据」有两类原因：
 * ① 没落盘（界面内存有、custom_fields.json 里没有）②落盘了但字段组 id 对不上。
 */
export const normalizeExportFormats = (
    formats: ExportFormat[] | undefined,
    groups: FieldGroupConfigItem[],
): ExportFormat[] => {
    if (!Array.isArray(formats)) return [];
    const groupIds = new Set(groups.map(g => g.id));
    return formats
        .filter(f => f && typeof f.id === 'string' && typeof f.name === 'string')
        .map(f => ({
            id: f.id,
            name: f.name.trim(),
            fieldGroupId: f.fieldGroupId,
            sheetName: (f.sheetName || DEFAULT_SHEET_NAME).trim(),
            fileNamePattern: (f.fileNamePattern || DEFAULT_FILE_NAME_PATTERN).trim(),
        }))
        .filter(f => f.name && groupIds.has(f.fieldGroupId));
};

export const normalizeFieldGroupsConfig = (customConfig: CustomFieldsConfig | null): FieldGroupConfigItem[] => {
    if (!customConfig) {
        return DEFAULT_FIELD_GROUPS.map((group) => ({ ...group, fields: [...group.fields] }));
    }

    if (customConfig.groups && Array.isArray(customConfig.groups) && customConfig.groups.length > 0) {
        return customConfig.groups
            .map((group) => ({
                id: group.id.trim(),
                name: group.name.trim(),
                fields: normalizeFields(group.fields || []),
                // 来源映射只保留仍在本组里的字段，避免删字段后映射悄悄复活
                ...(group.sources ? { sources: pruneSources(group.sources, group.fields || []) } : {}),
                ...(group.required ? { required: pruneRequired(group.required, group.fields || []) } : {}),
            }))
            .filter((group) => group.id && group.name);
    }

    return [
        {
            id: 'system-required',
            name: '系统必填字段',
            fields: normalizeFields(customConfig.systemRequired || []),
        },
        {
            id: 'quality-check',
            name: '质量验车字段',
            fields: normalizeFields(customConfig.qualityCheck || []),
        },
    ];
};

/**
 * 尝试从资产库重新加载用户定义的字典配置
 * @param libraryPath 用户本地资产根目录
 */
export const reloadCustomFields = async (libraryPath: string): Promise<void> => {
    if (!libraryPath) return;
    try {
        const customConfig = await loadCustomConfig<CustomFieldsConfig>(libraryPath, 'custom_fields.json');
        if (customConfig) {
            cachedFieldGroups = normalizeFieldGroupsConfig(customConfig);
            cachedExportFormats = normalizeExportFormats(customConfig.exportFormats, cachedFieldGroups);
            console.log('✅ 已成功加载并覆盖系统标准字段字典: custom_fields.json');
        } else {
            // 如果文件不存在或者解析空，则退回默认值（防止多次切换目录导致的数据污染）
            cachedFieldGroups = DEFAULT_FIELD_GROUPS.map((group) => ({ ...group, fields: [...group.fields] }));
            cachedExportFormats = [];
        }
    } catch (e) {
        console.error('动态加载 custom_fields.json 失败', e);
    }
};

// 同步获取（内部取自实时存根）
export const getFieldGroupsSync = (): FieldGroupConfigItem[] => cachedFieldGroups;
export const getFieldGroupByIdSync = (groupId: string): FieldGroupConfigItem | undefined =>
    cachedFieldGroups.find((group) => group.id === groupId);
export const getSystemRequiredFieldsSync = (): string[] => cachedFieldGroups.find((group) => group.id === 'system-required')?.fields || [];
export const getQualityCheckFieldsSync = (): string[] => cachedFieldGroups.find((group) => group.id === 'quality-check')?.fields || [];
export const getExportFormatsSync = (): ExportFormat[] => cachedExportFormats;

/** 保存字段组 + 导出格式（同一文件，供设置页与填报页共用） */
export const saveFieldGroups = async (
    libraryPath: string,
    groups: FieldGroupConfigItem[],
    exportFormats: ExportFormat[],
): Promise<void> => {
    const { writeTextFile } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const payload: CustomFieldsConfig = { groups, exportFormats };
    await writeTextFile(await join(libraryPath, 'custom_fields.json'), JSON.stringify(payload, null, 2));
    cachedFieldGroups = groups;
    cachedExportFormats = exportFormats;
};

// 兼容旧接口
export const preloadFieldLists = async (): Promise<void> => {
    // 初始化时已有硬代码内容，此处留空。未来实际的触发全交由 reloadCustomFields 负责
};
