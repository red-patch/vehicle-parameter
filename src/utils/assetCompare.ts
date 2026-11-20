import type { VehicleParameter } from '../types';

/**
 * 资产文件的「文件维度」对比（设计：docs/plans/2026-10-16-列表页设计语言-design.md 之后的
 * 资产治理补强，入口在版本对比页顶部）。
 *
 * 与既有对比实现的分工：
 * - `compareMatrix.buildCompareRows` 是**字段维度**的 N 列表格，`hasDiff` 不把「某车缺少该参数」
 *   算作差异，且用原始字符串严格比较——不能用来判断「两份文件内容是否相同」。
 * - `comparator.compareByContent` 按字段名（忽略分组）+ 模糊匹配，跨总成同名参数会错配。
 * 所以文件维度另立一份口径，键固定为 `分组::字段名`，缺失与空等价。
 *
 * 有效字段口径（用户已确认）：非空且不是纯符号占位；「无」是真实取值，保留。
 */

/** 视为「没填」的纯符号占位；`无` 不在其中（「无导流罩」是真实取值） */
export const EFFECTIVE_PLACEHOLDERS: ReadonlySet<string> = new Set([
    '/', '-', '—', '--', 'N/A', 'n/a', 'na', '待定', 'TBD',
]);

/** 归一化单值：trim 后若为纯符号占位则视为空 */
export const normalizeCompareValue = (value: unknown): string => {
    const v = String(value ?? '').trim();
    return EFFECTIVE_PLACEHOLDERS.has(v) ? '' : v;
};

/** 跨文件配对键：分组 + 字段名。同名参数在不同总成下不是同一个字段 */
export const compareParamKey = (p: Pick<VehicleParameter, 'group' | 'name'>): string =>
    `${p.group || '未分组'}::${p.name}`;

export interface EffectiveAnalysis {
    /** 分组::字段名 → 值（已剔除空值与占位） */
    map: Map<string, string>;
    /** 参数行数（模板行） */
    total: number;
    /** 非空行数（含占位） */
    filled: number;
    /** 有效字段数 = map.size */
    effective: number;
    /** 占位行数：填了符号但不算有效 */
    placeholder: number;
}

/** 把一份资产的参数整理成可比对的有效字段表 */
export const analyzeEffectiveParams = (params: VehicleParameter[]): EffectiveAnalysis => {
    const map = new Map<string, string>();
    let filled = 0;
    params.forEach(p => {
        // filled 沿用界面「已填」口径：非空即算，纯符号占位也计入（占位数单独统计）
        if (String(p.value ?? '').trim() === '') return;
        filled += 1;
        const v = normalizeCompareValue(p.value);
        if (!v) return;
        const key = compareParamKey(p);
        // 同组同名的重复行：保留首个非空值（与 compareMatrix「空值不覆盖已填值」同向）
        if (!map.has(key)) map.set(key, v);
    });
    return {
        map,
        total: params.length,
        filled,
        effective: map.size,
        placeholder: filled - map.size,
    };
};

export interface FileProfile {
    announceNo: string;
    admissionNo: string;
    manufacturer: string;
    model: string;
    admissionLevel: string;
    batteryBrand: string;
    capacity: string;
}

const firstValue = (params: VehicleParameter[], names: readonly string[]): string => {
    for (const name of names) {
        const hit = params.find(p => p.name === name && String(p.value ?? '').trim() !== '');
        if (hit) return String(hit.value).trim();
    }
    return '';
};

const ANNOUNCE_KEYS = ['公告号', '产品号', '产品ID', '公告产品号', '产品编号'] as const;

/** 公告号字段名各数据源不统一（真实数据常见「整车公告号」），按包含匹配——与扫描器 JS 回退同口径 */
const firstAnnounceNo = (params: VehicleParameter[]): string => {
    const hit = params.find(p =>
        ANNOUNCE_KEYS.some(k => p.name === k || p.name?.includes(k))
        && String(p.value ?? '').trim() !== '',
    );
    return hit ? String(hit.value).trim() : '';
};

/** 重点字段：全部从参数派生，字段名与 Rust `scan_one` 同源 */
export const deriveFileProfile = (params: VehicleParameter[]): FileProfile => ({
    announceNo: firstAnnounceNo(params),
    admissionNo: firstValue(params, ['准入编号']),
    // 主机厂：整车生产企业 > 公告申报企业 > 企业名称（与扫描器优先级一致）
    manufacturer: firstValue(params, ['整车生产企业', '公告申报企业', '企业名称']),
    model: firstValue(params, ['车辆型号']) || (params[0]?.productName ?? ''),
    admissionLevel: firstValue(params, ['产品等级标准']),
    // 电池品牌：动力电池包厂商 > 动力电池单体生产企业
    batteryBrand: firstValue(params, ['动力电池包厂商', '动力电池单体生产企业']),
    capacity: (() => {
        const hit = params.find(p => p.name.includes('动力电池包电量') && String(p.value ?? '').trim() !== '');
        return hit ? String(hit.value).trim() : '';
    })(),
});

export interface CompareFileInput {
    instanceKey: string;
    params: VehicleParameter[];
}

export interface PairDiff {
    /** 只在基准里有的字段 */
    onlyBaseline: string[];
    /** 只在该文件里有的字段 */
    onlyFile: string[];
    /** 两边都有但值不同 */
    changed: string[];
    /** 两边值相同 */
    sameCount: number;
}

/** 与基准逐字段比较；缺失与空等价 */
export const diffAgainstBaseline = (
    baseline: Map<string, string>,
    file: Map<string, string>,
): PairDiff => {
    const onlyBaseline: string[] = [];
    const changed: string[] = [];
    let sameCount = 0;
    baseline.forEach((value, key) => {
        const other = file.get(key);
        if (other === undefined) onlyBaseline.push(key);
        else if (other !== value) changed.push(key);
        else sameCount += 1;
    });
    const onlyFile: string[] = [];
    file.forEach((_, key) => {
        if (!baseline.has(key)) onlyFile.push(key);
    });
    return { onlyBaseline, onlyFile, changed, sameCount };
};

export interface CompareFileSummary {
    instanceKey: string;
    profile: FileProfile;
    total: number;
    filled: number;
    effective: number;
    placeholder: number;
    /** 有效字段 / 参与对比字段并集；0..1 */
    coverage: number;
    /** 与基准的三桶之和 */
    diffCount: number;
    isBaseline: boolean;
    /** 与基准内容完全相同（三桶都为 0） */
    identicalToBaseline: boolean;
}

export interface CompareFileSummaryResult {
    rows: CompareFileSummary[];
    /** 参与对比字段并集大小（覆盖率分母） */
    unionSize: number;
    baselineKey: string | null;
    /** 内容等价类数量：N 份文件里实际有几种内容 */
    contentClassCount: number;
}

/**
 * 文件维度汇总：有效字段、覆盖率、与基准的差异。
 *
 * 基准 = 有效字段最多的一份；并列取输入顺序靠前者（调用方按列表顺序传入，稳定）。
 * 注意：不用「完成率」（有效/自身模板行数）——模板行数不同的文件之间不可比：
 * 实测同一份 352 个有效值的 5 个文件，完成率会显示 70% 和 74%。
 */
export const summarizeCompareFiles = (inputs: CompareFileInput[]): CompareFileSummaryResult => {
    const analyses = inputs.map(input => ({
        input,
        analysis: analyzeEffectiveParams(input.params),
    }));

    const union = new Set<string>();
    analyses.forEach(({ analysis }) => analysis.map.forEach((_, key) => union.add(key)));

    let baselineIndex = -1;
    analyses.forEach(({ analysis }, index) => {
        if (baselineIndex === -1 || analysis.effective > analyses[baselineIndex].analysis.effective) {
            baselineIndex = index;
        }
    });
    const baseline = baselineIndex >= 0 ? analyses[baselineIndex] : null;
    const baselineKey = baseline ? baseline.input.instanceKey : null;
    const unionSize = union.size;

    const rows = analyses.map(({ input, analysis }, index) => {
        const diff = baseline ? diffAgainstBaseline(baseline.analysis.map, analysis.map) : null;
        const diffCount = diff ? diff.onlyBaseline.length + diff.onlyFile.length + diff.changed.length : 0;
        const isBaseline = index === baselineIndex;
        // 基准与自身恒相等，不算「与基准内容相同」；只有一份文件时也没有这个结论
        const identicalToBaseline = !isBaseline && inputs.length > 1 && diffCount === 0;
        return {
            instanceKey: input.instanceKey,
            profile: deriveFileProfile(input.params),
            total: analysis.total,
            filled: analysis.filled,
            effective: analysis.effective,
            placeholder: analysis.placeholder,
            coverage: unionSize > 0 ? analysis.effective / unionSize : 0,
            diffCount,
            isBaseline,
            identicalToBaseline,
        };
    });

    const signatures = new Set<string>();
    analyses.forEach(({ analysis }) => {
        signatures.add(Array.from(analysis.map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}\u0002${value}`)
            .join('\u0001'));
    });

    return { rows, unionSize, baselineKey, contentClassCount: signatures.size };
};

/** 内容等价的文件聚成类：返回 [签名, instanceKey[]]，按类大小降序 */
export const buildContentClasses = (inputs: CompareFileInput[]): { keys: string[]; size: number }[] => {
    const bySignature = new Map<string, string[]>();
    inputs.forEach(input => {
        const analysis = analyzeEffectiveParams(input.params);
        const signature = Array.from(analysis.map.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}\u0002${value}`)
            .join('\u0001');
        const list = bySignature.get(signature) ?? [];
        list.push(input.instanceKey);
        bySignature.set(signature, list);
    });
    return Array.from(bySignature.values())
        .map(keys => ({ keys, size: keys.length }))
        .sort((a, b) => b.size - a.size || a.keys[0].localeCompare(b.keys[0]));
};
