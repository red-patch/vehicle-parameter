import type { AssetFileInfo } from './assetManager';

// ============================================================
// 资产列表排序与同车型聚拢（设计文档 2026-10-14-asset-pool-sort-group-design）
// 纯函数，无 React / 无 store 依赖，便于单测。
// ============================================================

/** 排序维度 */
export type AssetSortDim = 'name' | 'fillRate' | 'paramCount' | 'updatedAt';
/** 排序方向 */
export type AssetSortDir = 'asc' | 'desc';

export interface AssetSortSpec {
    dim: AssetSortDim;
    dir: AssetSortDir;
}

/** 默认排序：时间倒序（保持 V1/V2 现状，用户无感迁移） */
export const DEFAULT_ASSET_SORT: AssetSortSpec = { dim: 'updatedAt', dir: 'desc' };

export interface AssetSortRow {
    info: AssetFileInfo;
    /** 显示名（别名解析后；名称维度按它排，与卡片显示一致） */
    displayName: string;
    /** 该行所属车型分组键（聚拢用） */
    groupKey: string;
}

const timeOf = (v: string | null): number => {
    if (!v) return 0;
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
};

const fillRateOf = (info: AssetFileInfo): number =>
    info.totalParams > 0 ? info.filledParams / info.totalParams : 0;

/**
 * 单行的排序键比较（**不含方向**，方向由 applyDir 施加于主判据）。
 * 返回 <0 / 0 / >0。方向不作用于末尾的文件名兜底——兜底恒定升序，
 * 保证"同值行"的次序与方向无关、且不随输入顺序抖动。
 */
const compareByDim = (a: AssetSortRow, b: AssetSortRow, dim: AssetSortDim): number => {
    switch (dim) {
        case 'name':
            return a.displayName.localeCompare(b.displayName, 'zh-Hans-CN');
        case 'fillRate':
            return fillRateOf(a.info) - fillRateOf(b.info);
        case 'paramCount':
            // 主判据参数总数；同数则缺必填少者优先
            return a.info.totalParams - b.info.totalParams
                || (b.info.totalParams - b.info.filledParams) - (a.info.totalParams - a.info.filledParams);
        case 'updatedAt':
            return timeOf(a.info.updatedAt) - timeOf(b.info.updatedAt);
    }
};

/** 方向只作用于主判据；同值（主判据相等）时按文件名升序兜底，与方向无关。 */
const compareRows = (a: AssetSortRow, b: AssetSortRow, spec: AssetSortSpec): number => {
    const primary = compareByDim(a, b, spec.dim);
    if (primary !== 0) return spec.dir === 'asc' ? primary : -primary;
    return a.info.fileName.localeCompare(b.info.fileName);
};

/** 按维度 + 方向排序（纯平铺；不聚拢）。返回新数组，不改入参。 */
export const sortAssetRows = (rows: AssetSortRow[], spec: AssetSortSpec): AssetSortRow[] =>
    [...rows].sort((a, b) => compareRows(a, b, spec));

/**
 * 同车型聚拢排序：先按 groupKey 分桶，桶间按 spec 排（桶代表值 = 桶内最优），
 * 桶内按 spec 排。关闭聚拢时退化为纯排序。
 *
 * 「桶内最优」定义：取排序方向上最靠前的那一行（即桶内排序后的第一行）作为比较代表，
 * 这样「完成率降序」时按各车型最高完成率排车型，「时间降序」时按各车型最新版排车型。
 */
export const sortAssetRowsGrouped = (rows: AssetSortRow[], spec: AssetSortSpec): AssetSortRow[] => {
    // 分桶（保持首次出现顺序以便稳定）
    const buckets = new Map<string, AssetSortRow[]>();
    rows.forEach(row => {
        const bucket = buckets.get(row.groupKey);
        if (bucket) bucket.push(row);
        else buckets.set(row.groupKey, [row]);
    });

    // 桶内先排，得到每桶的"最优代表"（排序后第一行）
    const sortedBuckets = Array.from(buckets.values()).map(bucket => {
        const sorted = sortAssetRows(bucket, spec);
        return { sorted, head: sorted[0] };
    });

    // 桶间按代表行排（复用同一比较器，保证口径一致）
    sortedBuckets.sort((a, b) => compareRows(a.head, b.head, spec));

    return sortedBuckets.flatMap(b => b.sorted);
};

/**
 * 入口：按聚拢开关分派。groupAdjacent=false 时纯排序。
 */
export const sortAssetRowsByMode = (
    rows: AssetSortRow[],
    spec: AssetSortSpec,
    groupAdjacent: boolean,
): AssetSortRow[] => (groupAdjacent ? sortAssetRowsGrouped(rows, spec) : sortAssetRows(rows, spec));

/** 排序维度中文标签（列表头下拉用） */
export const ASSET_SORT_LABELS: Record<AssetSortDim, string> = {
    name: '名称',
    fillRate: '完成率',
    paramCount: '参数数',
    updatedAt: '时间',
};

/** 各维度的默认方向（推荐起点；用户可改） */
export const ASSET_SORT_DEFAULT_DIR: Record<AssetSortDim, AssetSortDir> = {
    name: 'asc',
    fillRate: 'desc',
    paramCount: 'desc',
    updatedAt: 'desc',
};
