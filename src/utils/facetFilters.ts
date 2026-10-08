import type { ResolvedFacets } from './assetFacets';

// ============================================================
// 受控属性横切筛选（纯函数）：
// 维度内 OR、维度间 AND；每个维度带「(无)」虚拟值（缺值资产默认不被过滤，
// 勾选具体值才收敛；勾「(无)」= 只看缺值）。级联计数 = 非本列维度先收敛后的命中数。
// ============================================================

export const FACET_NONE = '（无）';

export type FacetDim = 'manufacturer' | 'vehicleFamily' | 'batteryBrand' | 'admissionLevel' | 'announceNos';

export interface FacetSelection {
    manufacturers: string[];
    families: string[];
    batteryBrands: string[];
    admissionLevels: string[];
    announceNos: string[];
    /** 电量区间（kWh）；两者皆空 = 不筛 */
    capacityMin: number | null;
    capacityMax: number | null;
    /** 电量维度勾选「(无)」 */
    capacityNone: boolean;
}

export const EMPTY_FACET_SELECTION: FacetSelection = {
    manufacturers: [],
    families: [],
    batteryBrands: [],
    admissionLevels: [],
    announceNos: [],
    capacityMin: null,
    capacityMax: null,
    capacityNone: false,
};

export const isFacetSelectionActive = (sel: FacetSelection): boolean =>
    sel.manufacturers.length > 0
    || sel.families.length > 0
    || sel.batteryBrands.length > 0
    || sel.admissionLevels.length > 0
    || sel.announceNos.length > 0
    || sel.capacityMin !== null
    || sel.capacityMax !== null
    || sel.capacityNone;

/** 单值维度匹配：空选=全过；勾「(无)」包含缺值；值命中即可 */
const matchScalar = (selected: string[], value: string | null): boolean => {
    if (selected.length === 0) return true;
    if (value === null) return selected.includes(FACET_NONE);
    return selected.includes(value);
};

/** 多值维度（公告号）匹配：任一命中；全缺值时看「(无)」 */
const matchMulti = (selected: string[], values: string[]): boolean => {
    if (selected.length === 0) return true;
    if (values.length === 0) return selected.includes(FACET_NONE);
    return values.some(v => selected.includes(v));
};

const matchCapacity = (sel: FacetSelection, value: number | null): boolean => {
    const rangeActive = sel.capacityMin !== null || sel.capacityMax !== null;
    if (!rangeActive && !sel.capacityNone) return true;
    if (value === null) return sel.capacityNone;
    if (!rangeActive) return true;
    if (sel.capacityMin !== null && value < sel.capacityMin) return false;
    if (sel.capacityMax !== null && value > sel.capacityMax) return false;
    return true;
};

/** 一条资产是否命中全部维度（AND） */
export const matchFacets = (facets: ResolvedFacets, sel: FacetSelection): boolean =>
    matchScalar(sel.manufacturers, facets.manufacturer)
    && matchScalar(sel.families, facets.vehicleFamily)
    && matchScalar(sel.batteryBrands, facets.batteryBrand)
    && matchScalar(sel.admissionLevels, facets.admissionLevel)
    && matchMulti(sel.announceNos, facets.announceNos)
    && matchCapacity(sel, facets.capacityKwh);

/** 按当前选择过滤 */
export const filterByFacets = <T extends { facets: ResolvedFacets }>(items: T[], sel: FacetSelection): T[] =>
    items.filter(item => matchFacets(item.facets, sel));

/** 从候选集收集某维度的全部可选值（含「(无)」占位由 UI 决定，这里只出实际值） */
export const collectFacetValues = (items: { facets: ResolvedFacets }[], dim: FacetDim): string[] => {
    const set = new Set<string>();
    items.forEach(({ facets }) => {
        if (dim === 'announceNos') facets.announceNos.forEach(n => set.add(n));
        else {
            const v = facets[dim];
            if (v !== null) set.add(v);
        }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
};

/**
 * 级联计数：固定其它维度（AND）后，本维度各值的命中数。
 * 本列保持全量展示带计数（Facet 标准做法）：计数基于其它维度收敛后的子集。
 * 返回 value → count；「(无)」键为 FACET_NONE。
 */
export const countFacetValues = (
    items: { facets: ResolvedFacets }[],
    sel: FacetSelection,
    dim: FacetDim,
): Map<string, number> => {
    // 先按非本列维度收敛
    const narrowed = items.filter(({ facets }) => matchFacets(facets, excludeDim(sel, dim)));
    const counts = new Map<string, number>();
    const bump = (key: string) => counts.set(key, (counts.get(key) || 0) + 1);

    narrowed.forEach(({ facets }) => {
        if (dim === 'announceNos') {
            if (facets.announceNos.length === 0) bump(FACET_NONE);
            else facets.announceNos.forEach(n => bump(n));
        } else {
            const v = facets[dim];
            if (v === null) bump(FACET_NONE);
            else bump(String(v));
        }
    });
    return counts;
};

/** 电量维度计数：区间命中数 + 「(无)」数（其余维度先收敛） */
export const countCapacity = (
    items: { facets: ResolvedFacets }[],
    sel: FacetSelection,
): { inRange: number; none: number; total: number } => {
    const narrowed = items.filter(({ facets }) => matchFacets(facets, {
        ...sel, capacityMin: null, capacityMax: null, capacityNone: false,
    }));
    let none = 0;
    let inRange = 0;
    narrowed.forEach(({ facets }) => {
        if (facets.capacityKwh === null) { none++; return; }
        if (matchCapacity(sel, facets.capacityKwh)) inRange++;
    });
    return { inRange, none, total: narrowed.length };
};

/** 去掉某一维度的选择（级联计数用） */
export const excludeDim = (sel: FacetSelection, dim: FacetDim): FacetSelection => {
    switch (dim) {
        case 'manufacturer': return { ...sel, manufacturers: [] };
        case 'vehicleFamily': return { ...sel, families: [] };
        case 'batteryBrand': return { ...sel, batteryBrands: [] };
        case 'admissionLevel': return { ...sel, admissionLevels: [] };
        case 'announceNos': return { ...sel, announceNos: [] };
    }
};

/** 维度选择的增/删（值含 FACET_NONE 语义） */
export const toggleFacetValue = (selected: string[], value: string): string[] =>
    selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value];
