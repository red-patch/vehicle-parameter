import type { VehicleParameter } from '../types';
import type { AssetFacetOverride, ResolvedFacets } from './assetFacets';

/**
 * 资产级可覆盖的受控属性维度。注意与 assetFacets 的 FacetDimKey 不同：
 * FacetDimKey 含组级专属的 vehicleFamily，却因电量归一为数值而未含 capacityKwh；
 * 本抽屉只碰资产级 4 维（含数值型电量），故单列此类型。
 */
export type AssetFacetDim = 'manufacturer' | 'batteryBrand' | 'capacityKwh' | 'admissionLevel';

/**
 * 批量字段维护的纯逻辑（设计：docs/plans/2026-10-13-batch-field-maintenance-design.md）。
 *
 * 字段目标分两层：受控属性（facet，走 _facet_values.json 覆盖层）与参数行
 * （VehicleParameter.name，走资产 JSON 的 parameters[]）。本文件零 IO，
 * 只做「读当前值 → 判定 → 生成写计划/写结果」，读写盘由调用方负责。
 */

/** 字段目标：受控属性维度，或参数层的某个受控字段名 */
export type FieldTarget =
    | { layer: 'facet'; dim: AssetFacetDim }
    | { layer: 'param'; name: string; group?: string };

/** 单行的写入判定 */
export type FieldEditVerdict = 'fill' | 'overwrite' | 'same' | 'addRow';

export interface FieldEditSourceRow {
    fileName: string;
    productName: string;
    isLatest: boolean;
    /** 参数层用：该资产的全部参数行（facet 层可传空数组） */
    params: VehicleParameter[];
    /** facet 层用：该资产解析后的受控属性（参数层可省） */
    facets?: ResolvedFacets;
}

export interface FieldEditRow {
    fileName: string;
    productName: string;
    isLatest: boolean;
    currentValue: string | number | null;
    nextValue: string | number | null;
    verdict: FieldEditVerdict | null;
    /** 参数层命中的行数（同名多行时 > 1）；facet 层恒为 1 */
    hitCount: number;
}

/** 空值判定：null / undefined / 纯空白都算空 */
export const isEmptyFieldValue = (v: unknown): boolean =>
    v === null || v === undefined || String(v).trim() === '';

/** 值等价判定：按去空白后的字符串比较（12 与 '12' 视为等同） */
export const isSameFieldValue = (a: unknown, b: unknown): boolean =>
    String(a ?? '').trim() === String(b ?? '').trim();

export const isFacetTarget = (t: FieldTarget): t is { layer: 'facet'; dim: AssetFacetDim } => t.layer === 'facet';

/** 读取某行在给定字段目标下的当前值 */
export const readFieldValue = (
    row: FieldEditSourceRow,
    target: FieldTarget,
): { value: string | number | null; hitCount: number } => {
    if (isFacetTarget(target)) {
        const raw = row.facets ? (row.facets[target.dim] as string | number | null | undefined) : null;
        return { value: raw ?? null, hitCount: 1 };
    }
    const hits = row.params.filter(p => p.name === target.name);
    return { value: hits.length > 0 ? hits[0].value : null, hitCount: hits.length };
};

/**
 * 生成逐台写计划（预览表的行）。
 * 判定：same（无变化）/ addRow（参数层无此字段，需新增行）/ fill（当前为空）/ overwrite（覆盖非空）。
 */
export const buildFieldEditPlan = (
    rows: FieldEditSourceRow[],
    target: FieldTarget,
    newValue: string | number | null,
): FieldEditRow[] =>
    rows.map(row => {
        const { value: currentValue, hitCount } = readFieldValue(row, target);
        const base = {
            fileName: row.fileName,
            productName: row.productName,
            isLatest: row.isLatest,
            currentValue,
            hitCount,
        };

        if (newValue === null) return { ...base, nextValue: null, verdict: null };
        if (isSameFieldValue(currentValue, newValue)) {
            return { ...base, nextValue: newValue, verdict: 'same' };
        }
        if (!isFacetTarget(target) && hitCount === 0) {
            return { ...base, nextValue: newValue, verdict: 'addRow' };
        }
        if (isEmptyFieldValue(currentValue)) {
            return { ...base, nextValue: newValue, verdict: 'fill' };
        }
        return { ...base, nextValue: newValue, verdict: 'overwrite' };
    });

/**
 * 应用参数层改动：改中命中行的 value 与 updatedAt，未命中则新增一行。
 * 无任何实际改动（全部 same）时返回原数组引用，调用方据此跳过写盘。
 * 纯函数：时间戳由调用方传入。
 */
export const applyParamFieldEdit = (
    params: VehicleParameter[],
    target: { layer: 'param'; name: string; group?: string },
    value: string | number,
    nowIso: string,
): VehicleParameter[] => {
    const { name, group } = target;
    let matched = 0;
    let changed = 0;

    const next = params.map(p => {
        if (p.name !== name) return p;
        matched += 1;
        if (isSameFieldValue(p.value, value)) return p;
        changed += 1;
        return { ...p, value, updatedAt: nowIso };
    });

    if (matched === 0) {
        const id = group ? `${group}::${name}` : name;
        return [...params, { id, group: group || '批量维护', name, value, updatedAt: nowIso }];
    }
    return changed === 0 ? params : next;
};

/** facet 批量写：把 N 个资产改成同一维度同一个值（覆盖层 patch） */
export const buildFacetBatchPatch = (dim: AssetFacetDim, value: string | number): AssetFacetOverride =>
    ({ [dim]: value } as AssetFacetOverride);

/** 校验：字段目标可写入（参数层字段名非空） */
export const isWritableTarget = (target: FieldTarget | null): target is FieldTarget => {
    if (!target) return false;
    if (target.layer === 'param') return target.name.trim().length > 0;
    return ASSET_LEVEL_FACET_DIMS.includes(target.dim);
};

/** facet 维度中文名（供下拉展示） */
export const FACET_DIM_LABELS: Record<AssetFacetDim, string> = {
    manufacturer: '主机厂',
    batteryBrand: '电池品牌',
    capacityKwh: '电量',
    admissionLevel: '准入等级',
};

/** 本抽屉只处理资产级可覆盖的 4 个维度（车型族群是组级专属，不在此列） */
export const ASSET_LEVEL_FACET_DIMS: AssetFacetDim[] = ['manufacturer', 'batteryBrand', 'capacityKwh', 'admissionLevel'];
