import type { VehicleParameter } from '../types';

/** 对比表一行：固定列 + 每个选中车型一列（列名是车辆实例键，值是参数文本） */
export type CompareRow = {
    key: string;
    group: string;
    name: string;
    hasDiff: boolean;
    hasAnyValue: boolean;
    /** 按字段名合并的行：该字段名在各车上归属的总成集合（去重）；未合并时为 undefined */
    groups?: string[];
} & Record<string, string | boolean | string[] | undefined>;

/** 参与矩阵构建的一台车：实例键 + 该车的参数行 */
export interface CompareMatrixInput {
    instanceKey: string;
    params: VehicleParameter[];
}

export interface BuildCompareRowsOptions {
    /**
     * 按字段名合并（忽略分组）。默认 false。
     * 开启后，同名参数只要在任何一台车内不冲突（该车同名只有 ≤1 个非空值），
     * 就跨总成合并成一行；任一车冲突则整体退回「分组::参数名」。
     */
    mergeByFieldName?: boolean;
}

const GROUPS_LABEL = '多组';
/** 合并键前缀：与「分组::名」键强制区分，避免碰撞 */
const MERGED_PREFIX = '\u0000merged\u0000';

/** 收集一台车内某（分组,名）键的值：空值不覆盖已填值，保留首次出现的非空值 */
const collectValues = (
    params: VehicleParameter[]
): Map<string, { group: string; name: string; values: Map<string, string> }> => {
    const byKey = new Map<string, { group: string; name: string; values: Map<string, string> }>();
    params.forEach(p => {
        const group = p.group || '未分组';
        const key = `${group}::${p.name}`;
        if (!byKey.has(key)) {
            byKey.set(key, { group, name: p.name, values: new Map() });
        }
        const entry = byKey.get(key)!;
        const value = String(p.value ?? '');
        // 同分组同名的重复行：空值不覆盖已填值（沿用原有语义）
        if (!entry.values.has('v') || entry.values.get('v') === '') {
            entry.values.set('v', value);
        }
    });
    return byKey;
};

/**
 * 构建对比矩阵行。
 *
 * 默认按「分组::参数名」建键——防止不同总成下的同名参数（如各传感器都叫「型号」）
 * 互相覆盖。开启 mergeByFieldName 后按字段名合并，但遵循规则 A：
 * 某字段名只要在任一选中车型内存在 ≥2 个不同非空值，该字段名整体不合并，
 * 退回分组键，避免在数据层替用户做业务取舍（对齐 ADR-0002 永不静默覆盖）。
 */
export const buildCompareRows = (
    inputs: CompareMatrixInput[],
    options: BuildCompareRowsOptions = {}
): CompareRow[] => {
    const mergeByFieldName = options.mergeByFieldName ?? false;

    // 每台车各自按「分组::名」聚合，保留原有空值语义
    const perCar = inputs.map(input => ({
        instanceKey: input.instanceKey,
        byGroup: collectValues(input.params),
    }));

    // 字段名 → 各车出现过的非空值集合（用于规则 A 的冲突判定）
    const nameValues = new Map<string, Map<string, Set<string>>>();
    if (mergeByFieldName) {
        perCar.forEach(car => {
            car.byGroup.forEach(entry => {
                const perName = nameValues.get(entry.name) ?? new Map<string, Set<string>>();
                const perCarSet = perName.get(car.instanceKey) ?? new Set<string>();
                entry.values.forEach(v => {
                    if (v !== '') perCarSet.add(v);
                });
                perName.set(car.instanceKey, perCarSet);
                nameValues.set(entry.name, perName);
            });
        });
    }

    // 冲突字段名：任一车内非空值种类 ≥2
    const conflictingNames = new Set<string>();
    nameValues.forEach((perName, name) => {
        for (const values of perName.values()) {
            if (values.size >= 2) {
                conflictingNames.add(name);
                break;
            }
        }
    });

    type Aggregated = { key: string; group: string; name: string; groups: string[]; values: Map<string, string> };
    const rows = new Map<string, Aggregated>();

    const upsert = (key: string, group: string, name: string, groups: string[], instanceKey: string, value: string) => {
        let row = rows.get(key);
        if (!row) {
            row = { key, group, name, groups, values: new Map() };
            rows.set(key, row);
        }
        // 空值不覆盖已填值
        if (value !== '' || !row.values.has(instanceKey) || row.values.get(instanceKey) === '') {
            row.values.set(instanceKey, value);
        }
    };

    perCar.forEach(car => {
        car.byGroup.forEach(entry => {
            const group = entry.group;
            const merged = mergeByFieldName && !conflictingNames.has(entry.name);
            const key = merged ? `${MERGED_PREFIX}${entry.name}` : `${group}::${entry.name}`;
            // 合并行的分组在全部车收集完后统一判定
            upsert(key, merged ? GROUPS_LABEL : group, entry.name, [], car.instanceKey, entry.values.get('v') ?? '');
        });
    });

    // 合并行：汇总各车该字段名归属的总成集合
    rows.forEach(row => {
        if (!row.key.startsWith(MERGED_PREFIX)) return;
        const groups = new Set<string>();
        perCar.forEach(car => {
            car.byGroup.forEach(entry => {
                if (entry.name === row.name) groups.add(entry.group);
            });
        });
        row.groups = Array.from(groups);
        row.group = row.groups.length === 1 ? row.groups[0] : GROUPS_LABEL;
    });

    return Array.from(rows.values()).map(row => {
        const values = Array.from(row.values.values());
        const allSame = values.every(v => v === values[0]);
        return {
            key: row.key,
            group: row.group,
            name: row.name,
            hasDiff: inputs.length > 1 ? !allSame : false,
            hasAnyValue: values.some(v => v.trim() !== ''),
            groups: row.groups.length > 0 ? row.groups : undefined,
            ...Object.fromEntries(row.values),
        };
    });
};
