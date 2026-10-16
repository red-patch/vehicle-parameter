import type { VehicleParameter } from '../types';

/** 字段名归一化：全角→半角、去首尾与内部空白，用于跨车型匹配同名字段 */
export const normalizeFieldKey = (name: string): string =>
    (name || '')
        .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
        .replace(/\u3000/g, ' ')
        .replace(/\s+/g, '')
        .trim();

/** 参考车型字段索引：精确名 + 归一化名两级 */
export interface ReferenceIndex {
    exact: Map<string, VehicleParameter>;
    normalized: Map<string, VehicleParameter>;
}

export const buildReferenceIndex = (refParams: VehicleParameter[]): ReferenceIndex => {
    const exact = new Map<string, VehicleParameter>();
    const normalized = new Map<string, VehicleParameter>();
    refParams.forEach(param => {
        const name = param.name || '';
        if (name && !exact.has(name)) exact.set(name, param);
        const key = normalizeFieldKey(name);
        if (key && !normalized.has(key)) normalized.set(key, param);
    });
    return { exact, normalized };
};

/** 为当前车型的一行找参考车型里的对应字段：精确名优先，再退到归一化名 */
export const matchReference = (row: VehicleParameter, index: ReferenceIndex | null): VehicleParameter | null => {
    if (!index) return null;
    const name = row.name || '';
    return index.exact.get(name) || index.normalized.get(normalizeFieldKey(name)) || null;
};

/** 一行与参考车型之间的差异维度；全同或无参考则返回 null（非差异行） */
export interface RowDiff {
    reference: VehicleParameter;
    nameDiffers: boolean;
    valueDiffers: boolean;
    groupDiffers: boolean;
}

export const computeRowDiff = (row: VehicleParameter, reference: VehicleParameter | null): RowDiff | null => {
    if (!reference) return null;
    // 参考车型自己没填值的字段不作为差异依据，避免把空覆盖到当前车型
    if (String(reference.value ?? '').trim() === '') return null;

    const nameDiffers = (row.name || '') !== (reference.name || '');
    const valueDiffers = String(row.value ?? '').trim() !== String(reference.value ?? '').trim();
    const groupDiffers = (row.group || '') !== (reference.group || '');

    if (!nameDiffers && !valueDiffers && !groupDiffers) return null;
    return { reference, nameDiffers, valueDiffers, groupDiffers };
};

/**
 * 「视同更新」写入内容：参数名 + 参数值 + 分组（不动 id）
 *
 * 刻意不写 updatedAt：全量视同会一次刷满整表，而那个时间戳在界面上表达的是
 * 「人工逐条校对过」，批量采纳参考车型并不具备这层含义。
 */
export const buildSyncPatch = (
    _row: VehicleParameter,
    reference: VehicleParameter
): Pick<VehicleParameter, 'name' | 'value' | 'group'> => ({
    name: reference.name,
    value: reference.value,
    group: reference.group,
});

/**
 * 对视同更新求新参数列表：只有 id 同时命中 `ids` 与 `diffById` 的行才被写入。
 *
 * `ids` 是这次动作的目标集合——行内按钮传单行 id，全量按钮传全部差异行 id。
 * 漏判 ids 会让行内按钮退化成全量覆盖（历史上出过这个 bug）。
 */
export const applySyncToParams = (
    params: VehicleParameter[],
    ids: Set<string>,
    diffById: Map<string, RowDiff>
): VehicleParameter[] => {
    if (ids.size === 0) return params;
    return params.map(p => {
        if (!ids.has(p.id)) return p;
        const diff = diffById.get(p.id);
        return diff ? { ...p, ...buildSyncPatch(p, diff.reference) } : p;
    });
};

export const diffCount = (diffs: (RowDiff | null)[]): number => diffs.filter(Boolean).length;
