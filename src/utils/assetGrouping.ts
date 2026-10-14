import type { AssetFileInfo } from './assetManager';
import type { ResolvedFacets } from './assetFacets';
import type { AssetSortRow } from './assetSort';

// ============================================================
// 资产按维度分组（设计文档 2026-10-14-asset-pool-grouping-design）
// 纯函数：输入已筛选/已排序的行 + 维度上下文，输出带组头的分组。
// ============================================================

/** 分组维度 */
export type AssetGroupDim = 'none' | 'vehicle' | 'manufacturer' | 'vehicleFamily' | 'admissionLevel' | 'batteryBrand' | 'status';

/** 缺值组的哨兵键 */
export const GROUP_NONE_KEY = '__none__';
export const GROUP_NONE_LABEL = '（无）';

export interface AssetGroupDimContext {
    /** 资产 fileName → 车型分组键（resolveVehicleGroupKey） */
    vehicleGroupKey: (fileName: string) => string;
    /** 资产 fileName → 车型组显示名（pickGroupAlias） */
    vehicleGroupLabel: (fileName: string) => string;
    /** 资产 fileName → 受控属性（fileFacets.get） */
    facets: Map<string, ResolvedFacets>;
    /** 资产 fileName → 治理状态（meta.status） */
    metaStatus: (fileName: string) => 'superseded' | 'deprecated' | undefined;
    /** 资产 fileName → 是否驳回（info.approvalStatus === '驳回'） */
    isRejected: (info: AssetFileInfo) => boolean;
}

/** 组内数据：保留原始排序行的全部字段 */
export interface AssetGroup {
    key: string;
    label: string;
    rows: AssetSortRow[];
    /** 组级元信息（仅车型维度有"组实体"，可供组头操作） */
    vehicleGroupKey?: string;
}

type GroupKeyResult = { key: string; label: string; vehicleGroupKey?: string };

/** 单行 → 组键/组名（缺值统一归哨兵组） */
const keyOf = (row: AssetSortRow, dim: AssetGroupDim, ctx: AssetGroupDimContext): GroupKeyResult => {
    const fn = row.info.fileName;
    switch (dim) {
        case 'vehicle': {
            const key = ctx.vehicleGroupKey(fn);
            return { key, label: ctx.vehicleGroupLabel(fn), vehicleGroupKey: key };
        }
        case 'manufacturer': {
            const v = ctx.facets.get(fn)?.manufacturer ?? null;
            return v ? { key: v, label: v } : { key: GROUP_NONE_KEY, label: GROUP_NONE_LABEL };
        }
        case 'vehicleFamily': {
            const v = ctx.facets.get(fn)?.vehicleFamily ?? null;
            return v ? { key: v, label: v } : { key: GROUP_NONE_KEY, label: GROUP_NONE_LABEL };
        }
        case 'admissionLevel': {
            const v = ctx.facets.get(fn)?.admissionLevel ?? null;
            return v ? { key: v, label: v } : { key: GROUP_NONE_KEY, label: GROUP_NONE_LABEL };
        }
        case 'batteryBrand': {
            const v = ctx.facets.get(fn)?.batteryBrand ?? null;
            return v ? { key: v, label: v } : { key: GROUP_NONE_KEY, label: GROUP_NONE_LABEL };
        }
        case 'status': {
            // 优先级单选归组：废弃 > 历史 > 驳回 > 最新版
            const s = ctx.metaStatus(fn);
            if (s === 'deprecated') return { key: 'status:deprecated', label: '已废弃' };
            if (s === 'superseded') return { key: 'status:superseded', label: '历史版本' };
            if (ctx.isRejected(row.info)) return { key: 'status:rejected', label: '驳回' };
            return { key: 'status:active', label: '正常' };
        }
        case 'none':
        default:
            return { key: '__all__', label: '' };
    }
};

/** 准入等级序（Ⅰ<Ⅱ<Ⅲ<Ⅲ1<Ⅲ2<Ⅲ3<Ⅳ）；非等级值返回大数垫底 */
const admissionRank = (level: string): number => {
    const order = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅲ1', 'Ⅲ2', 'Ⅲ3', 'Ⅳ'];
    const i = order.indexOf(level);
    return i === -1 ? order.length + 1 : i;
};

/** 状态组序（正常→驳回→历史→废弃，与"最可用的在前"直觉一致） */
const statusRank: Record<string, number> = {
    'status:active': 0,
    'status:rejected': 1,
    'status:superseded': 2,
    'status:deprecated': 3,
};

/**
 * 分组排序比较：组间顺序（维度相关；缺值组一律垫底）。
 * - 车型/主机厂/族群/电池品牌：组内数量降序 → 名称 zh 升序
 * - 准入等级：等级序升序（Ⅰ 在前） → 名称
 * - 状态：固定优先级
 */
const compareGroups = (
    a: AssetGroup, b: AssetGroup, dim: AssetGroupDim,
): number => {
    const aNone = a.key === GROUP_NONE_KEY;
    const bNone = b.key === GROUP_NONE_KEY;
    if (aNone !== bNone) return aNone ? 1 : -1;

    if (dim === 'admissionLevel') {
        const d = admissionRank(a.key) - admissionRank(b.key);
        return d !== 0 ? d : a.label.localeCompare(b.label, 'zh-Hans-CN');
    }
    if (dim === 'status') {
        return (statusRank[a.key] ?? 99) - (statusRank[b.key] ?? 99);
    }
    // 数量降序 → 名称升序
    const d = b.rows.length - a.rows.length;
    return d !== 0 ? d : a.label.localeCompare(b.label, 'zh-Hans-CN');
};

/**
 * 按维度分组。dim='none' 时返回单个无标签组（供调用方平铺渲染）。
 * rows 的组内顺序 = 入参顺序（调用方已排好序）。
 */
export const buildAssetGroups = (
    rows: AssetSortRow[],
    dim: AssetGroupDim,
    ctx: AssetGroupDimContext,
): AssetGroup[] => {
    if (dim === 'none' || rows.length === 0) {
        return rows.length === 0 ? [] : [{ key: '__all__', label: '', rows }];
    }

    const buckets = new Map<string, AssetGroup>();
    rows.forEach(row => {
        const { key, label, vehicleGroupKey } = keyOf(row, dim, ctx);
        const bucket = buckets.get(key);
        if (bucket) bucket.rows.push(row);
        else buckets.set(key, { key, label, rows: [row], vehicleGroupKey });
    });

    return Array.from(buckets.values()).sort((a, b) => compareGroups(a, b, dim));
};

/** 分组维度中文标签（列表头下拉用） */
export const ASSET_GROUP_LABELS: Record<AssetGroupDim, string> = {
    none: '不分组',
    vehicle: '车型',
    manufacturer: '主机厂',
    vehicleFamily: '车型族群',
    admissionLevel: '准入等级',
    batteryBrand: '电池品牌',
    status: '状态',
};

/** 默认分组维度（车型，等价于迭代 3 的聚拢） */
export const DEFAULT_ASSET_GROUP: AssetGroupDim = 'vehicle';
