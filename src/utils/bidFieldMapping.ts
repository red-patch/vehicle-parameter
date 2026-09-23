// 投标字段关联映射（智能填报 · 多车取数模式）
// 一个方案 = 多条规则；一条规则 = 投标目标字段 → 1..N 个系统来源字段 + 组合模板
// 持久化到资产库目录 custom_bid_field_mappings.json（仿 custom_fields.json 模式）
import { loadCustomConfig } from './assetManager';
import { findBestMatch } from './matchingEngine';
import type { MatchAlternative, MatchResult } from './matchingEngine';
import type { VehicleParameter } from '../types';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

export const BID_FIELD_MAPPINGS_FILE = 'custom_bid_field_mappings.json';

export interface BidFieldRule {
    id: string;
    /** 投标目标字段名（规则的显示名），如 "外扩尺寸" */
    target: string;
    /** 系统来源字段名（1..N 个），如 ["外形尺寸长","外形尺寸宽","外形尺寸高"] */
    sources: string[];
    /** 组合模板，如 "{0}×{1}×{2}"；单来源留空 = 直取值 */
    template?: string;
    note?: string;
}

export interface BidMappingScheme {
    id: string;
    /** 方案名：一次映射多次复用的入口 */
    name: string;
    createdAt?: string;
    updatedAt?: string;
    rules: BidFieldRule[];
}

export interface BidMappingsConfig {
    schemes: BidMappingScheme[];
}

/** 用户在结果矩阵里手选的来源命中（fuzzy 候选或任意字段） */
export interface SourcePick {
    name: string;
    value: string | number;
}

export type SourceResolutionStatus = 'auto' | 'picked' | 'fuzzy' | 'missing';

export interface SourceResolution {
    /** 规则里绑定的来源字段名 */
    source: string;
    status: SourceResolutionStatus;
    /** 实际命中的系统字段名 */
    resolvedName?: string;
    value?: string | number;
    matchType?: MatchResult['matchType'];
    /** fuzzy 时的候选列表（供下拉手选） */
    alternatives?: MatchAlternative[];
}

export interface RuleComposedResult {
    /** 组合后的展示/导出值；缺失来源渲染为 "?" 占位 */
    text: string;
    /** 全部来源都有值 */
    ready: boolean;
    missingCount: number;
}

const isEmptyValue = (v: string | number | undefined | null): boolean =>
    v === undefined || v === null || String(v).trim() === '';

/** 多来源且未配置模板时的默认模板：{0}×{1}×{2} */
export const defaultTemplateFor = (sourceCount: number): string =>
    Array.from({ length: sourceCount }, (_, i) => `{${i}}`).join('×');

/** 渲染组合模板：{0} {1} … 占位符替换为来源值；缺失/越界占位渲染为 "?" */
export const renderCombineTemplate = (
    template: string,
    values: (string | number | undefined)[]
): string =>
    template.replace(/\{(\d+)\}/g, (_, digit: string) => {
        const v = values[Number(digit)];
        return isEmptyValue(v) ? '?' : String(v);
    });

/**
 * 对规则的每个来源在某个车型参数集上做解析
 * exact/normalized/alias 自动取值；fuzzy 保留候选待手选；none 视为缺失
 * @param picks 会话级手选结果（按来源下标），优先于自动匹配
 */
export const resolveRuleSources = (
    rule: BidFieldRule,
    candidates: VehicleParameter[],
    picks?: Record<number, SourcePick>
): SourceResolution[] =>
    rule.sources.map((source, index) => {
        const pick = picks?.[index];
        if (pick) {
            return { source, status: 'picked', resolvedName: pick.name, value: pick.value };
        }

        const match = findBestMatch(source, candidates);
        if (
            match.matchType === 'exact' ||
            match.matchType === 'normalized' ||
            match.matchType === 'alias'
        ) {
            return {
                source,
                status: 'auto',
                resolvedName: match.matchedParam?.name,
                value: match.matchedParam?.value,
                matchType: match.matchType,
            };
        }
        if (match.matchType === 'fuzzy') {
            return {
                source,
                status: 'fuzzy',
                matchType: 'fuzzy',
                alternatives: match.alternatives,
            };
        }
        return { source, status: 'missing', matchType: 'none' };
    });

/** 由解析结果组装规则的最终值（单来源直取 / 多来源按模板渲染） */
export const composeRuleValue = (
    rule: BidFieldRule,
    resolutions: SourceResolution[]
): RuleComposedResult => {
    const values = resolutions.map((r) => r.value);
    const missingCount = values.filter((v) => isEmptyValue(v)).length;

    if (rule.sources.length === 0) {
        return { text: '', ready: false, missingCount: 0 };
    }

    if (rule.sources.length === 1) {
        const v = values[0];
        return { text: isEmptyValue(v) ? '' : String(v), ready: missingCount === 0, missingCount };
    }

    const template = rule.template?.trim() || defaultTemplateFor(rule.sources.length);
    return {
        text: renderCombineTemplate(template, values),
        ready: missingCount === 0,
        missingCount,
    };
};

// ---------------------------------------------------------------------------
// 默认方案：投标常用 13 项（来源留空的由用户在抽屉里绑定）
// ---------------------------------------------------------------------------

const BID_DEFAULT_RULES: Array<Pick<BidFieldRule, 'target' | 'sources' | 'template'>> = [
    { target: '外扩尺寸', sources: ['外形尺寸长', '外形尺寸宽', '外形尺寸高'], template: '{0}×{1}×{2}' },
    { target: '车辆重量（kg）', sources: [] },
    { target: '载质量', sources: ['额定载质量'] },
    { target: '容积（方）', sources: [] },
    { target: '电机额定功率(kw)', sources: ['电机额定功率（kW）'] },
    { target: '电机峰值功率(kw)', sources: ['电机峰值功率（kW）'] },
    { target: '续航里程(km)实测', sources: ['DST工况实测续航（km）'] },
    { target: '续航里程(km)工况', sources: ['公告续航里程（km）'] },
    { target: '电池品牌', sources: ['动力电池包厂商'] },
    { target: '电池容量(kwh)', sources: ['动力电池包电量（kWh）'] },
    { target: '电池能量密度(wh/kg)', sources: [] },
    { target: '充电能力', sources: [] },
    { target: '三电质保', sources: [] },
];

export const createBidRuleId = (): string =>
    `bid-rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const createDefaultBidScheme = (): BidMappingScheme => ({
    id: 'bid-default',
    name: '常用投标字段',
    rules: BID_DEFAULT_RULES.map((rule, index) => ({
        id: `bid-default-rule-${index + 1}`,
        target: rule.target,
        sources: [...rule.sources],
        template: rule.template,
    })),
});

// ---------------------------------------------------------------------------
// 配置归一化 / 持久化（仿 fieldLists.ts 模式）
// ---------------------------------------------------------------------------

const normalizeRule = (rule: unknown, schemeKey: string, ruleIndex: number): BidFieldRule | null => {
    if (typeof rule !== 'object' || rule === null) return null;
    const raw = rule as Partial<BidFieldRule>;
    const target = typeof raw.target === 'string' ? raw.target.trim() : '';
    if (!target) return null;

    const sources = Array.isArray(raw.sources)
        ? Array.from(
              new Set(
                  raw.sources
                      .filter((s): s is string => typeof s === 'string')
                      .map((s) => s.trim())
                      .filter(Boolean)
              )
          )
        : [];

    const template =
        typeof raw.template === 'string' && raw.template.trim() ? raw.template.trim() : undefined;

    return {
        id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `${schemeKey}-rule-${ruleIndex}`,
        target,
        sources,
        template,
        note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : undefined,
    };
};

const normalizeScheme = (scheme: unknown, schemeIndex: number): BidMappingScheme | null => {
    if (typeof scheme !== 'object' || scheme === null) return null;
    const raw = scheme as Partial<BidMappingScheme>;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) return null;

    const schemeKey = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : `bid-scheme-${schemeIndex}`;
    const rules = (Array.isArray(raw.rules) ? raw.rules : [])
        .map((rule, index) => normalizeRule(rule, schemeKey, index))
        .filter((rule): rule is BidFieldRule => rule !== null);

    return {
        id: schemeKey,
        name,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,
        rules,
    };
};

/**
 * 防御性归一化磁盘配置；无有效方案时返回 null（由调用方回退默认方案）
 */
export const normalizeBidMappingsConfig = (raw: unknown): BidMappingScheme[] | null => {
    if (typeof raw !== 'object' || raw === null) return null;
    const schemes = (raw as Partial<BidMappingsConfig>).schemes;
    if (!Array.isArray(schemes) || schemes.length === 0) return null;

    const normalized = schemes
        .map((scheme, index) => normalizeScheme(scheme, index))
        .filter((scheme): scheme is BidMappingScheme => scheme !== null);

    return normalized.length > 0 ? normalized : null;
};

let cachedSchemes: BidMappingScheme[] = [createDefaultBidScheme()];

/**
 * 从资产库目录加载（或重载）字段关联方案；无有效文件时回退内置默认方案
 */
export const reloadBidMappings = async (libraryPath: string): Promise<void> => {
    if (!libraryPath) return;
    try {
        const config = await loadCustomConfig<BidMappingsConfig>(libraryPath, BID_FIELD_MAPPINGS_FILE);
        const schemes = config ? normalizeBidMappingsConfig(config) : null;
        cachedSchemes = schemes ?? [createDefaultBidScheme()];
    } catch (e) {
        console.error('动态加载 custom_bid_field_mappings.json 失败', e);
    }
};

export const getBidSchemesSync = (): BidMappingScheme[] => cachedSchemes;
export const getBidSchemeByIdSync = (id: string): BidMappingScheme | undefined =>
    cachedSchemes.find((scheme) => scheme.id === id);

/**
 * 保存方案列表到资产库目录。写入成功后由调用方触发 reloadBidMappings + 版本号 bump
 */
export const saveBidMappingsConfig = async (
    libraryPath: string,
    schemes: BidMappingScheme[]
): Promise<boolean> => {
    try {
        const filePath = await join(libraryPath, BID_FIELD_MAPPINGS_FILE);
        await writeTextFile(filePath, JSON.stringify({ schemes }, null, 2));
        return true;
    } catch (e) {
        console.error('保存 custom_bid_field_mappings.json 失败', e);
        return false;
    }
};
