import type { FacetOption } from '../common/FacetChips';

/**
 * 数据体检的「异常」汇总（纯函数，便于单测）。
 *
 * 为什么要拆：此前一个「发现异常 N」把两类问题揉在一起——
 * ① 字段名不在用户的枚举词表里；② 有枚举的字段值不在枚举里。
 * 词表只收录少量字段时，① 几乎等于参数总数（真实数据：503 个参数报 501），
 * 用户读到的是「数据几乎全错」，实际是「词表没覆盖」。
 * 词表为空时更是逐个参数名都被标橙。
 */
export interface PurifyAnomalyRow {
    isNameStandard: boolean;
    isEnumMismatch: boolean;
}

export interface PurifyAnomalySummary {
    /** 词表里有字段才校验字段名 */
    dictReady: boolean;
    dictSize: number;
    paramCount: number;
    /** 字段名不在词表的行数 */
    nameCount: number;
    /** 枚举值不合法的行数 */
    valueCount: number;
    /** 任一异常的行数（两类可能重叠，不等于二者之和） */
    total: number;
    /** 词表覆盖不足：过半参数名不在词表，多半是词表没收录而不是数据错 */
    lowCoverage: boolean;
}

/** 覆盖不足的判定：参数不少于该数，且过半参数名不在词表 */
export const LOW_COVERAGE_MIN_PARAMS = 10;
export const LOW_COVERAGE_RATIO = 0.5;

export function summarizePurifyAnomalies(
    rows: readonly PurifyAnomalyRow[],
    dictSize: number,
): PurifyAnomalySummary {
    const dictReady = dictSize > 0;
    let nameCount = 0;
    let valueCount = 0;
    let total = 0;
    for (const row of rows) {
        const badName = !row.isNameStandard;
        if (badName) nameCount++;
        if (row.isEnumMismatch) valueCount++;
        if (badName || row.isEnumMismatch) total++;
    }
    const paramCount = rows.length;
    return {
        dictReady,
        dictSize,
        paramCount,
        nameCount,
        valueCount,
        total,
        lowCoverage:
            dictReady
            && paramCount >= LOW_COVERAGE_MIN_PARAMS
            && nameCount / paramCount > LOW_COVERAGE_RATIO,
    };
}

/** 快捷筛选 chip：两类异常分开计数，色调与表格内标记一致（参数名橙 / 参数值红） */
export function buildAnomalyChips(summary: PurifyAnomalySummary): FacetOption[] {
    if (!summary.dictReady) {
        return [{ value: 'anomaly', label: '未配置词表', disabled: true }];
    }
    if (summary.total === 0) {
        return [{ value: 'anomaly', label: '完全合规' }];
    }
    const chips: FacetOption[] = [];
    if (summary.nameCount > 0) {
        chips.push({ value: 'name', label: '字段名不在词表', count: summary.nameCount, tone: 'warning' });
    }
    if (summary.valueCount > 0) {
        chips.push({ value: 'value', label: '枚举值不合法', count: summary.valueCount, tone: 'danger' });
    }
    return chips;
}

/** 体检页顶部的词表提示；null = 不需要提示 */
export function buildDictHint(summary: PurifyAnomalySummary): string | null {
    if (summary.paramCount === 0) return null;
    if (!summary.dictReady) {
        return '未配置字段词表，暂不校验字段名与枚举值。在「字段与词表」导入枚举 Excel 后会自动体检。';
    }
    if (summary.lowCoverage) {
        return `词表仅收录 ${summary.dictSize} 个字段，本车 ${summary.nameCount}/${summary.paramCount} 个参数名不在其中——多为词表未覆盖，并非数据有误。可在「字段与词表」补充，补充后自动重新体检。`;
    }
    return null;
}
