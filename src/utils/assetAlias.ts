import { getAssetDisplayName } from './assetNaming';
import { deriveCarIdentityKey } from './assetGovernance';
import type { AssetMetaMap, AssetFileInfo } from './assetManager';

/**
 * 资产别名（Asset Alias）— 纯函数模块
 *
 * 见 docs/plans/2026-10-13-asset-alias-design.md。
 *
 * 存储：`_asset_meta.json` 的 `AssetGovernanceMeta.alias`（键 = fileName，与 status/groupName/note 同处）。
 *
 * 解析顺序：alias(自身) → alias(同身份键最新版) → 派生名(getAssetDisplayName)。
 * 组名（meta.groupName）**不进资产级链路**，它只在组头生效（设计 §D10）。
 *
 * 三个硬约束：
 * 1. 别名只出现在**渲染文本**里——永不进 React key、永不进比较、永不进身份键
 *    （productName 现为 MultiVehicleView 的 Map 键、vehicleStore 异源去重依据、无公告号时的身份键成分）。
 * 2. 与 `groupName` 正交：groupName **参与归组**（同名组自动合并），alias **不参与**。
 * 3. 与 `customName`（FileManager 导入前文件名）无关。
 */

/** 建议别名长度上限：超过则不给建议（导出层 VEHICLE_LABEL_MAX = 14，见 reportExport.ts） */
export const ALIAS_SUGGEST_MAX = 14;

export interface AliasLookupInfo {
    fileName: string;
    productName: string;
}

/**
 * 别名解析上下文。身份相关能力以回调注入，保持本模块为纯函数——
 * 调用方（store/组件）用可用数据（如 computeCarVersionGroups）提供实现；
 * 不提供时退化为「自身别名 → 组名 → 派生名」，不继承。
 */
export interface AliasSource {
    metaMap: AssetMetaMap;
    /** fileName → 身份键（deriveCarIdentityKey）；缺失返回 null */
    identityKeyOf?: (fileName: string) => string | null;
    /** 身份键 → 同车文件 fileName 列表；**约定按最新在前排序**（如 activeFiles[0] 即最新版） */
    siblingsOf?: (identityKey: string) => string[];
}

/** 归一别名：trim 后空串视为未设置（两态，不设「显式空」） */
export const normalizeAlias = (raw: string | null | undefined): string =>
    (raw ?? '').trim();

/** 该文件自身设置的别名；未设置/空白 → null */
export const getOwnAlias = (fileName: string, metaMap: AssetMetaMap): string | null => {
    const alias = normalizeAlias(metaMap[fileName]?.alias);
    return alias || null;
};

/**
 * 解析生效别名：自身别名优先；否则沿身份键从同车**其他**版本继承（见 D7）。
 * 未提供身份回调、或无同车其他版本带别名 → null。
 */
export const resolveAssetAlias = (fileName: string, source: AliasSource): string | null => {
    const own = getOwnAlias(fileName, source.metaMap);
    if (own) return own;

    const { identityKeyOf, siblingsOf } = source;
    if (!identityKeyOf || !siblingsOf) return null;

    const key = identityKeyOf(fileName);
    if (!key) return null;

    for (const sibling of siblingsOf(key)) {
        if (sibling === fileName) continue;
        const inherited = getOwnAlias(sibling, source.metaMap);
        if (inherited) return inherited;
    }
    return null;
};

/**
 * 资产级显示名入口：别名 → 派生名(getAssetDisplayName)。
 *
 * **刻意不含组名**（设计 §D10，只在对应层级生效）：`groupName` 是**组头**的显示覆盖，
 * 由组头渲染处（AssetGroupedView / AssetPoolLayout 的 vehicleGroupLabel）单独读取。
 * 若把它并进资产级链路，组重命名会把组内每张卡的名称全盖成同一个组名——
 * 同组多辆车（差异在电量/公告号）彼此再也分不开。
 */
export const resolveAssetDisplayName = (
    info: AliasLookupInfo,
    source: AliasSource,
): string => {
    const alias = resolveAssetAlias(info.fileName, source);
    if (alias) return alias;

    return getAssetDisplayName(info.fileName, info.productName);
};

/** 从受控属性原文（可能带注记/多值）里取首个 kWh 数值；无数字 → null */
export const parseCapacityKwh = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    const match = String(raw).match(/\d+(?:\.\d+)?/);
    return match ? match[0] : null;
};

/**
 * 派生建议别名：车型组 + 电量（如 `V8E 50.23`）。
 * 任一来源缺失、或结果超长 → null（不猜、不截断兜底）。
 */
export const suggestAssetAlias = (
    groupName: string | null | undefined,
    capacityRaw: string | null | undefined,
    maxLen: number = ALIAS_SUGGEST_MAX,
): string | null => {
    const group = normalizeAlias(groupName);
    if (!group) return null;

    const kwh = parseCapacityKwh(capacityRaw);
    if (!kwh) return null;

    const suggestion = `${group} ${kwh}`;
    return suggestion.length > maxLen ? null : suggestion;
};

export interface AliasSuggestionInput {
    fileName: string;
    productName: string;
    capacityRaw?: string | null;
}

export interface AliasSuggestion {
    fileName: string;
    productName: string;
    /** 建议别名；不可派生时为空串 */
    suggestedAlias: string;
    /** 是否成功派生（false = 列表里标黄、默认不勾） */
    derivable: boolean;
    /** 默认是否勾选（可派生且当前无别名 → true） */
    selected: boolean;
}

/**
 * 批量建议（见 D6/D14）：
 * - 已有别名 → 保留原值、不勾选（永不覆盖人工结果）；
 * - 可派生 → 给出建议、默认勾选（一次确认即可）；
 * - 不可派生 → 空建议、标黄、默认不勾。
 */
export const buildAliasSuggestions = (
    infos: AliasSuggestionInput[],
    groupNameOf: (info: AliasSuggestionInput) => string | null,
    metaMap: AssetMetaMap,
): AliasSuggestion[] =>
    infos.map(info => {
        const existing = getOwnAlias(info.fileName, metaMap);
        if (existing) {
            return {
                fileName: info.fileName,
                productName: info.productName,
                suggestedAlias: existing,
                derivable: false,
                selected: false,
            };
        }

        const suggested = suggestAssetAlias(groupNameOf(info), info.capacityRaw);
        return {
            fileName: info.fileName,
            productName: info.productName,
            suggestedAlias: suggested ?? '',
            derivable: suggested !== null,
            selected: suggested !== null,
        };
    });

/**
 * 由资产库快照构造别名解析上下文（UI 适配器）。
 *
 * - 身份键用 `deriveCarIdentityKey`（与导入查重、治理版本链同源）；
 * - `siblingsOf` 返回同车文件**按最新在前**：以 `latestSet`（buildGovernanceReport 的链头集合）
 *   作为排序依据，链头排首位，其余按文件名——继承时首个带别名的版本即被采纳。
 * - `groupKeyOf` 由调用方提供（各页面的品牌词表/标签分组可能不同），缺省用文件名推导。
 */
export const buildAliasSource = (
    infos: AssetFileInfo[],
    metaMap: AssetMetaMap,
    latestSet: Set<string>,
    groupKeyOf?: (info: AssetFileInfo) => string,
): AliasSource => {
    const byKey = new Map<string, AssetFileInfo[]>();
    infos.forEach(info => {
        const key = deriveCarIdentityKey(info, info.announceNos || [], groupKeyOf ? groupKeyOf(info) : info.fileName);
        const bucket = byKey.get(key);
        if (bucket) bucket.push(info);
        else byKey.set(key, [info]);
    });

    const orderOf = (info: AssetFileInfo) => (latestSet.has(info.fileName) ? 0 : 1);
    const index = new Map<string, string[]>();
    byKey.forEach((members, key) => {
        index.set(
            key,
            [...members]
                .sort((a, b) => orderOf(a) - orderOf(b) || a.fileName.localeCompare(b.fileName))
                .map(m => m.fileName),
        );
    });

    const infoByFile = new Map(infos.map(i => [i.fileName, i] as const));

    return {
        metaMap,
        identityKeyOf: (fileName) => {
            const info = infoByFile.get(fileName);
            if (!info) return null;
            return deriveCarIdentityKey(info, info.announceNos || [], groupKeyOf ? groupKeyOf(info) : info.fileName);
        },
        siblingsOf: (key) => index.get(key) ?? [],
    };
};
