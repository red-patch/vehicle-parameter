import { writeTextFile, readTextFile, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import type { AssetFileInfo } from './assetManager';

// ============================================================
// 受控属性（Facet）：词表 + 取值（ADR-0001）
// 组级：主机厂、车型族群（一组一值）；资产级：公告号、电池品牌、电量、准入等级。
// 词表/取值均为库目录内旁路文件，人工维护；派生值为默认，人工修正为覆盖层。
// 纯解析/归一逻辑在本文件，筛选逻辑在 facetFilters.ts。
// ============================================================

export const FACET_VOCAB_FILE = '_facet_vocab.json';
export const FACET_VALUES_FILE = '_facet_values.json';

/** 词表条目：name=规范值（法人级/规范名），group=集团归属（面板折叠多选），aliases=其他写法（归一映射） */
export interface FacetVocabEntry {
    name: string;
    group?: string;
    aliases?: string[];
}

export interface FacetVocab {
    manufacturer: FacetVocabEntry[];
    batteryBrand: FacetVocabEntry[];
    vehicleFamily: string[];
    admissionLevel: string[];
}

export interface GroupFacetValue {
    manufacturer?: string;
    vehicleFamily?: string;
}

export interface AssetFacetOverride {
    manufacturer?: string;
    batteryBrand?: string;
    capacityKwh?: number;
    admissionLevel?: string;
    announceNos?: string[];
}

export interface FacetValues {
    /** 组级取值：groupKey → 值 */
    groupLevel: Record<string, GroupFacetValue>;
    /** 资产级人工修正：fileName → 覆盖值 */
    assetLevel: Record<string, AssetFacetOverride>;
}

export const EMPTY_FACET_VALUES: FacetValues = { groupLevel: {}, assetLevel: {} };

/**
 * 初始词表（2026-09-30 全量数据核查的归并结论，一次性种子）：
 * 主机厂 = 法人级规范名（分公司归并到法人）+ 集团归属；同集团不同法人不合并（ADR-0002 裁定⑤）。
 * 错别字/旧名/简称进 aliases 作归一映射；词表外新写法走治理体检「待归类」。
 */
export const DEFAULT_FACET_VOCAB: FacetVocab = {
    manufacturer: [
        { name: '上汽大通汽车有限公司', group: '上汽大通', aliases: ['上汽大通', '上汽大通汽车有限公司南京分公司', '上汽大通南京分公司'] },
        { name: '北汽福田汽车股份有限公司', group: '福田', aliases: ['北汽福田', '福田'] },
        { name: '河南福田智蓝新能源汽车有限公司', group: '福田', aliases: ['河南福田智蓝'] },
        { name: '厦门金龙旅行车有限公司', group: '金龙', aliases: ['金旅', '厦门金龙旅行车'] },
        { name: '厦门金龙联合汽车工业有限公司', group: '金龙', aliases: ['金龙联合', '厦门金龙联合'] },
        { name: '吉利四川商用车有限公司', group: '吉利', aliases: ['吉利四川商用车', 'jiangxi Geely New Energy Commercial Vehicles Co., Ltd', '江西吉利新能源商用车有限公司', '江西吉利新能源商用车'] },
        { name: '山西新能源汽车工业有限公司', group: '吉利', aliases: ['山西晋中'] },
        { name: '浙江豪情汽车制造有限公司', group: '吉利' },
        { name: '湖州远程汽车有限公司', group: '吉利', aliases: ['远程'] },
        { name: '鑫源汽车有限公司', group: '鑫源', aliases: ['华晨鑫源重庆汽车有限公司', '鑫源'] },
        { name: '陕西汽车集团股份有限公司', group: '陕汽', aliases: ['陕西汽车集团', '陕汽'] },
        { name: '山东唐骏欧铃汽车制造有限公司', group: '唐骏欧铃', aliases: ['唐骏欧铃'] },
        { name: '贵州长江汽车有限公司', group: '长江汽车' },
        { name: '庆铃汽车股份有限公司', group: '庆铃' },
        { name: '重庆瑞驰汽车实业有限公司', group: '瑞驰', aliases: ['瑞驰'] },
        { name: '重庆长安汽车股份有限公司', group: '长安', aliases: ['长安汽车'] },
        { name: '重庆长安跨越商用车有限公司', group: '长安', aliases: ['长安跨越商用车有限公司', '长安跨越'] },
        { name: '东风汽车股份有限公司', group: '东风', aliases: ['东风'] },
        { name: '中国重汽集团济南商用车有限公司', group: '重汽', aliases: ['中国重汽'] },
        { name: '安徽华菱汽车有限公司', group: '重汽', aliases: ['华菱'] },
        { name: '安徽开乐专用车辆股份有限公司', group: '开乐', aliases: ['开乐'] },
        { name: '广西汽车集团', group: '广西汽车', aliases: ['广西汽车集团有限公司'] },
        { name: '杭州醇氢电动新能源商用车有限公司', group: '醇氢电动' },
        { name: '重庆凯瑞特种车有限公司', group: '凯瑞' },
        { name: '新石器', group: '新石器' },
    ],
    batteryBrand: [
        { name: '宁德时代新能源科技股份有限公司', group: '宁德时代', aliases: ['宁德时代', '宁德'] },
        { name: '中创新航科技集团股份有限公司', group: '中创新航', aliases: ['中创新航', '重创新航科技集团股份有限公司', '中航锂电科技有限公司', '中航锂电'] },
        { name: '弗迪电池有限公司', group: '弗迪', aliases: ['重庆弗迪锂电池有限公司', '弗迪'] },
        { name: '合肥国轩高科动力能源有限公司', group: '国轩高科', aliases: ['国轩高科'] },
        { name: '湖北亿纬动力有限公司', group: '亿纬', aliases: ['亿纬动力', '亿纬'] },
        { name: '欣旺达动力科技股份有限公司', group: '欣旺达' },
        { name: '厦门新能安科技有限公司', group: '新能安', aliases: ['厦门新能安', '新能安'] },
        { name: '多氟多', group: '多氟多' },
        { name: '科易动力科技有限公司', group: '科易', aliases: ['科易动力', '科易电池'] },
        { name: '孝感楚能新能源创新科技有限公司', group: '楚能', aliases: ['武汉楚能新能源有限公司', '楚能'] },
        { name: '瑞普兰钧', group: '瑞普兰钧', aliases: ['瑞普兰均'] },
        { name: '上汽时代动力电池系统有限公司', group: '上汽时代' },
        { name: '时代上汽动力电池有限公司', group: '上汽时代' },
        { name: '浙江远程智芯科技有限公司', group: '远程智芯' },
        { name: '湖州智芯动力系统发展有限公司', group: '湖州智芯' },
        { name: '江西安驰新能源科技有限公司', group: '安驰' },
        { name: '上海新动力汽车科技股份有限公司', group: '上海新动力' },
    ],
    vehicleFamily: ['大面', '中面', '小卡', '微卡', '轻卡', '无人车'],
    admissionLevel: ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅲ1', 'Ⅲ2', 'Ⅲ3', 'Ⅳ'],
};

// ==================== IO ====================

export const loadFacetVocab = async (libraryPath: string): Promise<FacetVocab> => {
    try {
        if (!libraryPath) return DEFAULT_FACET_VOCAB;
        const fullPath = await join(libraryPath, FACET_VOCAB_FILE);
        if (!await exists(fullPath)) return DEFAULT_FACET_VOCAB;
        const parsed = JSON.parse(await readTextFile(fullPath)) as Partial<FacetVocab>;
        return {
            manufacturer: parsed.manufacturer?.length ? parsed.manufacturer : DEFAULT_FACET_VOCAB.manufacturer,
            batteryBrand: parsed.batteryBrand?.length ? parsed.batteryBrand : DEFAULT_FACET_VOCAB.batteryBrand,
            vehicleFamily: parsed.vehicleFamily?.length ? parsed.vehicleFamily : DEFAULT_FACET_VOCAB.vehicleFamily,
            admissionLevel: parsed.admissionLevel?.length ? parsed.admissionLevel : DEFAULT_FACET_VOCAB.admissionLevel,
        };
    } catch (e) {
        console.warn('Failed to load facet vocab', e);
        return DEFAULT_FACET_VOCAB;
    }
};

export const loadFacetValues = async (libraryPath: string): Promise<FacetValues> => {
    try {
        if (!libraryPath) return EMPTY_FACET_VALUES;
        const fullPath = await join(libraryPath, FACET_VALUES_FILE);
        if (!await exists(fullPath)) return EMPTY_FACET_VALUES;
        const parsed = JSON.parse(await readTextFile(fullPath)) as Partial<FacetValues>;
        return { groupLevel: parsed.groupLevel || {}, assetLevel: parsed.assetLevel || {} };
    } catch (e) {
        console.warn('Failed to load facet values', e);
        return EMPTY_FACET_VALUES;
    }
};

export const saveFacetVocab = async (libraryPath: string, vocab: FacetVocab): Promise<void> => {
    try {
        const fullPath = await join(libraryPath, FACET_VOCAB_FILE);
        await writeTextFile(fullPath, JSON.stringify(vocab, null, 2));
    } catch (e) {
        console.warn('Failed to save facet vocab', e);
    }
};

export const saveFacetValues = async (libraryPath: string, values: FacetValues): Promise<void> => {
    try {
        const fullPath = await join(libraryPath, FACET_VALUES_FILE);
        await writeTextFile(fullPath, JSON.stringify(values, null, 2));
    } catch (e) {
        console.warn('Failed to save facet values', e);
    }
};

// ==================== 归一化 ====================

/** 归一键：去全部空白、拉丁大写（与归组键同口径，保证「同写法必同归一」） */
const norm = (s: string): string => s.replace(/\s+/g, '').toUpperCase();

/**
 * 按词表归一：命中 name/alias 返回规范名；未命中返回 null（进「待归类」，永不猜测合并）。
 * 大小写与空白不敏感。
 */
export const resolveByAlias = (
    entries: FacetVocabEntry[],
    raw: string | null | undefined,
): string | null => {
    const key = raw ? norm(raw) : '';
    if (!key) return null;
    for (const entry of entries) {
        if (norm(entry.name) === key) return entry.name;
        if (entry.aliases?.some(a => norm(a) === key)) return entry.name;
    }
    return null;
};

/** 词表外新写法收集（治理体检「待归类」清单） */
export const collectUnmappedValues = (
    entries: FacetVocabEntry[],
    rawValues: string[],
): string[] => {
    const out = new Set<string>();
    rawValues.forEach(raw => {
        const v = raw.trim();
        if (v && !resolveByAlias(entries, v)) out.add(v);
    });
    return Array.from(out).sort();
};

export type FacetDimKey = 'manufacturer' | 'batteryBrand' | 'vehicleFamily' | 'admissionLevel';

/**
 * 就地收词：编辑处输入词表外新值时，归一后新增进词表（受控属性的词表约束由此维持）。
 * 已存在（含别名命中）返回既有规范值，不产生重复条目。返回新词表与最终规范值。
 */
export const addVocabValue = (
    vocab: FacetVocab,
    dim: FacetDimKey,
    raw: string,
): { vocab: FacetVocab; value: string } => {
    const v = (raw ?? '').trim();
    if (!v) return { vocab, value: '' };

    if (dim === 'vehicleFamily' || dim === 'admissionLevel') {
        const list = vocab[dim];
        const hit = list.find(e => norm(e) === norm(v));
        if (hit) return { vocab, value: hit };
        return { vocab: { ...vocab, [dim]: [...list, v] }, value: v };
    }

    const entries = vocab[dim];
    const canonical = resolveByAlias(entries, v);
    if (canonical) return { vocab, value: canonical };
    return {
        vocab: { ...vocab, [dim]: [...entries, { name: v, group: v }] },
        value: v,
    };
};

// ==================== 取值解析 ====================

export interface ResolvedFacets {
    manufacturer: string | null;
    vehicleFamily: string | null;
    batteryBrand: string | null;
    capacityKwh: number | null;
    admissionLevel: string | null;
    announceNos: string[];
}

export interface ResolveFacetsInput {
    fileName: string;
    groupKey: string;
    /** 扫描派生（公告号已有；P3 起含厂商/电池品牌/电量/等级，未派生时为 null） */
    info: Pick<AssetFileInfo, 'announceNos' | 'vehicleModel'> & {
        manufacturerRaw?: string | null;
        batteryBrandRaw?: string | null;
        capacityRaw?: string | null;
        admissionLevelRaw?: string | null;
    };
    /** 文件标签（厂商/车型族群/准入等级标签组作兜底源） */
    tags?: string[];
    values: FacetValues;
    vocab: FacetVocab;
}

/** 从标签组兜底：tags 里命中词表的值（厂商→manufacturer，族群→vehicleFamily，等级→admissionLevel） */
const tagFallback = (tags: string[] | undefined, entries: FacetVocabEntry[] | string[]): string | null => {
    if (!tags || tags.length === 0) return null;
    const isStringList = entries.length > 0 && typeof entries[0] === 'string';
    for (const tag of tags) {
        if (isStringList) {
            const hit = (entries as string[]).find(e => norm(e) === norm(tag));
            if (hit) return hit;
        } else {
            const hit = resolveByAlias(entries as FacetVocabEntry[], tag);
            if (hit) return hit;
        }
    }
    return null;
};

/** 电量归一（裁定①②）：剥离括号注记、分号双值取首值，转数值；解析失败返回 null */
export const normalizeCapacity = (raw: string | null | undefined): number | null => {
    if (!raw) return null;
    const first = String(raw).split(/[;；]/)[0];
    const cleaned = first.replace(/[（(][^）)]*[）)]/g, '').replace(/kwh/ig, '').trim();
    const n = Number.parseFloat(cleaned);
    return Number.isFinite(n) ? n : null;
};

/** 等级归一（裁定④⑥）：ASCII VI → Ⅳ；其余原样 */
export const normalizeAdmissionLevel = (raw: string | null | undefined): string | null => {
    const v = (raw ?? '').trim();
    if (!v) return null;
    return /^VI$/i.test(v) ? 'Ⅳ' : v;
};

/**
 * 资产级受控属性解析，优先级：
 * 人工修正（assetLevel）> 扫描派生（词表归一）> 组级（manufacturer）> 标签兜底。
 * 车型族群为组级专属：groupLevel > 标签兜底。
 */
export const resolveAssetFacets = (input: ResolveFacetsInput): ResolvedFacets => {
    const { fileName, groupKey, info, tags, values, vocab } = input;
    const override = values.assetLevel[fileName] || {};
    const groupValue = values.groupLevel[groupKey] || {};

    const derivedManufacturer = resolveByAlias(vocab.manufacturer, info.manufacturerRaw);
    const derivedBrand = resolveByAlias(vocab.batteryBrand, info.batteryBrandRaw);
    const derivedLevel = normalizeAdmissionLevel(info.admissionLevelRaw);
    const derivedCapacity = normalizeCapacity(info.capacityRaw);

    return {
        manufacturer: override.manufacturer
            ?? derivedManufacturer
            ?? groupValue.manufacturer
            ?? tagFallback(tags, vocab.manufacturer),
        vehicleFamily: groupValue.vehicleFamily ?? tagFallback(tags, vocab.vehicleFamily),
        batteryBrand: override.batteryBrand ?? derivedBrand ?? tagFallback(tags, vocab.batteryBrand),
        capacityKwh: override.capacityKwh ?? derivedCapacity,
        admissionLevel: override.admissionLevel ?? derivedLevel
            ?? normalizeAdmissionLevel(tagFallback(tags, vocab.admissionLevel)),
        announceNos: override.announceNos
            ?? [info.vehicleModel, ...info.announceNos].filter((k): k is string => !!k),
    };
};

// ==================== 组级取值维护 ====================

/** 组级取值写入（覆盖式，空值=清除）；返回新 FacetValues，调用方落盘 */
export const setGroupFacetValue = (
    values: FacetValues,
    groupKey: string,
    patch: GroupFacetValue,
): FacetValues => {
    const next = { ...values, groupLevel: { ...values.groupLevel } };
    const merged: GroupFacetValue = { ...next.groupLevel[groupKey], ...patch };
    Object.keys(merged).forEach(k => {
        const v = (merged as Record<string, unknown>)[k];
        if (v === undefined || v === null || v === '') delete (merged as Record<string, unknown>)[k];
    });
    if (Object.keys(merged).length === 0) delete next.groupLevel[groupKey];
    else next.groupLevel[groupKey] = merged;
    return next;
};

/** 资产级修正写入（覆盖式，空值=清除） */
export const setAssetFacetOverride = (
    values: FacetValues,
    fileName: string,
    patch: AssetFacetOverride,
): FacetValues => {
    const next = { ...values, assetLevel: { ...values.assetLevel } };
    const merged: AssetFacetOverride = { ...next.assetLevel[fileName], ...patch };
    Object.keys(merged).forEach(k => {
        const v = (merged as Record<string, unknown>)[k];
        if (v === undefined || v === null || v === '') delete (merged as Record<string, unknown>)[k];
    });
    if (Object.keys(merged).length === 0) delete next.assetLevel[fileName];
    else next.assetLevel[fileName] = merged;
    return next;
};
