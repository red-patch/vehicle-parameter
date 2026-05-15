// 快捷字段列表模块
// 数据直接内嵌，在此基础上增加支持加载指定目录下的 custom_fields.json 支持热替换
import { loadCustomConfig } from './assetManager';


export interface FieldGroupConfigItem {
    id: string;
    name: string;
    fields: string[];
}

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

export interface CustomFieldsConfig {
    groups?: FieldGroupConfigItem[];
    systemRequired?: string[];
    qualityCheck?: string[];
}

const normalizeFields = (fields: string[]) =>
    Array.from(new Set(fields.map((field) => field.trim()).filter(Boolean)));

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
            console.log('✅ 已成功加载并覆盖系统标准字段字典: custom_fields.json');
        } else {
            // 如果文件不存在或者解析空，则退回默认值（防止多次切换目录导致的数据污染）
            cachedFieldGroups = DEFAULT_FIELD_GROUPS.map((group) => ({ ...group, fields: [...group.fields] }));
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

// 兼容旧接口
export const preloadFieldLists = async (): Promise<void> => {
    // 初始化时已有硬代码内容，此处留空。未来实际的触发全交由 reloadCustomFields 负责
};
