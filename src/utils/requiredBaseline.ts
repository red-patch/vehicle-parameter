/**
 * 必填判定基准：只认「字段与词表 → 核心字段配置」里人工勾选的 `required` 集合。
 *
 * 应用**不内置**任何必填清单（V5.6 起）：此前 `assets/requiredFields.ts` 写死了
 * 111 个字段名，与用户实际在用的字段组无关，也没法随业务改。
 * 现在「选哪个字段组，就以哪个组为基准」；不选组（`null`）就没有必填概念——
 * 界面上必填列 / 必填筛选整体不出现，而不是把每一行都显示成「否」。
 */
import { getFieldGroupsSync, type FieldGroupConfigItem } from './fieldLists';

/** 与字段组归一化口径一致：空白、全角括号、大小写都不影响匹配 */
const normalize = (name: string): string =>
    name.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')').toLowerCase();

export interface RequiredBaseline {
    groupId: string;
    groupName: string;
    /** 该字段是否属于基准组的必填集合 */
    has: (name: string | undefined | null) => boolean;
}

/**
 * 纯函数版本（便于测试）：`groupId` 为 `all` / 空 / 不存在的组时返回 `null`（= 不启用必填判定）。
 */
export function resolveRequiredBaseline(
    groups: FieldGroupConfigItem[],
    groupId: string | null | undefined,
): RequiredBaseline | null {
    if (!groupId || groupId === 'all') return null;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return null;
    const names = new Set((group.required ?? []).map(normalize));
    return {
        groupId: group.id,
        groupName: group.name,
        has: (name) => Boolean(name) && names.has(normalize(name as string)),
    };
}

/** 读当前字段组缓存的版本（组件里改完字段组后靠 `fieldGroupsVersion` 触发重算） */
export function buildRequiredBaseline(groupId: string | null | undefined): RequiredBaseline | null {
    return resolveRequiredBaseline(getFieldGroupsSync(), groupId);
}
