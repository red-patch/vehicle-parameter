import { isFieldRequired } from '../assets/requiredFields';
import type { VehicleParameter } from '../types';

/**
 * 车辆完成度统计（纯函数）：完成率 / 参数总数 / 有效值 / 空值 / 分组完成度 / 必填缺失。
 * 原逻辑在 VehicleListPanel 的 useMemo 里，摘要卡与资产检查器共用后抽到此处（设计文档 §3.3）。
 */
export interface VehicleGroupStat {
    name: string;
    total: number;
    filled: number;
    pct: number;
}

export interface VehicleStats {
    totalParams: number;
    filledParams: number;
    emptyParams: number;
    fillRate: number;
    requiredMissing: VehicleParameter[];
    groups: VehicleGroupStat[];
}

const isFilled = (param: VehicleParameter): boolean =>
    param.value !== undefined && param.value !== null && String(param.value).trim() !== '';

/**
 * @param params 参数明细（为空时退化到 fallback 的扫描计数，保持旧抽屉的口径）
 */
export function buildVehicleStats(
    params: VehicleParameter[],
    fallback?: { totalParams: number; filledParams: number },
): VehicleStats {
    const total = params.length || fallback?.totalParams || 0;
    const filled = params.length > 0
        ? params.filter(isFilled).length
        : (fallback?.filledParams ?? 0);
    const empty = Math.max(0, total - filled);
    const fillRate = total > 0 ? Math.round((filled / total) * 100) : 0;
    const requiredMissing = params.filter(param => {
        const value = String(param.value ?? '').trim();
        return isFieldRequired(param.name) && value === '';
    });

    const groupMap = new Map<string, { total: number; filled: number }>();
    params.forEach(param => {
        const groupName = param.group || '未分组';
        const current = groupMap.get(groupName) || { total: 0, filled: 0 };
        current.total += 1;
        if (isFilled(param)) current.filled += 1;
        groupMap.set(groupName, current);
    });

    const groups = Array.from(groupMap.entries())
        .map(([name, group]) => ({
            name,
            total: group.total,
            filled: group.filled,
            pct: group.total > 0 ? Math.round((group.filled / group.total) * 100) : 0,
        }))
        .sort((left, right) => right.total - left.total);

    return { totalParams: total, filledParams: filled, emptyParams: empty, fillRate, requiredMissing, groups };
}
