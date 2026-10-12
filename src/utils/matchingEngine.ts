import Fuse from 'fuse.js';
import type { VehicleParameter } from '../types';

/**
 * 参数别名/同义词库
 * key: 标准名称 (工信部常用名称)
 * value: 常见的其他叫法
 */
export const PARAMETER_ALIASES: Record<string, string[]> = {
    // --- 基础信息 ---
    '产品号': ['产品编号', '公告产品号'],
    '产品ID': ['公告号id', '公告ID', '公告号ID'],
    '批次': ['公告批次', '批次号'],
    '发布日期': ['公告日期', '发布时间'],
    '企业名称': ['整车生产企业', '主机厂', '生产厂家'],
    '产品商标': ['品牌', '商标'],
    '生产地址': ['生产厂地址', '厂址'],
    '车辆型号': ['型号', '车型'],
    '车辆名称': ['车型名称', '公告车型', '名称'],
    '车辆识别代号(VIN)': ['VIN码前缀', 'VIN', 'VIN码'],
    '是否免检': ['免征批次', '免检'],
    '停产日期': ['状态', '停产状态'],
    '停售日期': ['状态', '停售状态'],

    // --- 尺寸类 ---
    '外形尺寸长': ['车长', '长度', '长', '整车长', '外廓长度(mm)', '外廓长度', '外廓尺寸长'],
    '外形尺寸宽': ['车宽', '宽度', '宽', '整车宽', '外廓宽度(mm)', '外廓宽度', '外廓尺寸宽'],
    '外形尺寸高': ['车高', '高度', '高', '整车高', '外廓高度(mm)', '外廓高度', '外廓尺寸高'],
    '货厢长': ['货箱长', '箱长', '货箱长度', '内部长', '货厢内部长度', '货厢内部长度(mm)'],
    '货厢宽': ['货箱宽', '箱宽', '货箱宽度', '内部宽', '货厢内部宽度', '货厢内部宽度(mm)'],
    '货厢高': ['货箱高', '箱高', '货箱高度', '内部高', '货厢内部高度', '货厢内部高度(mm)'],
    '轴距': ['前后轴距', '轴距(mm)'],
    '轴数': ['车轴数', '轴数量'],
    '前轮距': ['轮距(前)', '前轮距(mm)'],
    '后轮距': ['轮距(后)', '后轮距(mm)'],
    '前悬后悬': ['前/后悬(mm)', '前/后悬', '前悬/后悬'],
    '接近角/离去角': ['接近角(°)/离去角(°)', '接近角/离去角', '接近离去角'],

    // --- 质量类 ---
    '总质量': ['最大总质量', '满载质量', '总质量(kg)'],
    '整备质量': ['自重', '空车重量', '整备质量(kg)'],
    '额定载质量': ['载重量', '载重', '最大载质量', '额定载质量(kg)'],
    '准拖挂车总质量': ['拖挂总质量', '准拖挂质量'],
    '载质量利用系数': ['载质量系数', '利用系数'],
    '半挂车鞍座最大允许载质量': ['鞍座载质量', '半挂鞍座载质量'],
    '轴荷': ['前/后轴荷(kg)', '前/后轴荷', '轴荷分布'],
    '驾驶室准乘人数': ['乘员数', '驾驶室人数', '准乘人数'],
    '额定载客(含驾驶员)': ['乘员数', '载客人数', '额定载客'],

    // --- 性能与动力 ---
    '最高车速': ['最高时速', '车速', '最大车速', '最高车速(km/h)'],
    '发动机生产企业': ['电机厂商', '发动机企业', '动力企业'],
    '发动机型号': ['电机型号', '动力型号'],
    '发动机功率': ['功率', '最大功率', '电机功率', '额定功率', '电机额定功率(kW)'],
    '排量': ['发动机排量'],
    '燃料种类': ['燃料', '能源类型', '动力类型', '能源种类'],
    '油耗': ['百公里油耗', '综合油耗'],
    '排放依据标准': ['排放标准', '国六'],
    '驱动电机对应关系': ['电机额定/峰值功率', '电机对应关系'],
    '储能装置种类/生产企业': ['动力电池单体生产企业', '电池企业'],
    '动力电池包电量': ['动力电池电量', '电量', '电池电量', '动力电池电量(kWh)', '动力电池包电量(kWh)'],

    // --- 底盘与配置 ---
    '底盘ID': ['底盘编号'],
    '底盘型号及企业': ['车身结构', '底盘型号'],
    '钢板弹簧片数': ['板簧', '板簧数', '弹簧片数', '钢板弹簧'],
    '轮胎数': ['轮胎数量'],
    '轮胎规格': ['轮胎', '轮胎型号'],
    '转向形式': ['转向助力类型', '转向类型'],
    '防抱死系统': ['ABS'],
    'ABS型号/生产企业': ['ABS系统型号/生产企业', 'ABS型号'],
    '反光标识企业': ['反光标识生产企业'],
    '反光标识型号': ['反光标识'],
    '反光标识商标': ['反光标识品牌'],
    '其它': ['需求描述/备注', '备注', '其他'],
};

/**
 * 归一化字段名：取出单位、括号、空格等干扰字符
 * e.g. "整备质量(kg)" -> "整备质量"
 */
export const normalizeName = (name: string): string => {
    return name
        .replace(/[（(].*?[)）]/g, '') // 去除括号及内容
        .replace(/[[【].*?[\]】]/g, '') // 去除中括号及内容
        .replace(/\s+/g, '') // 去除空格
        // V1.5: 移除常见的单位词
        .replace(/mm$|kg$|km\/h$|kW$|kWh$|L$/i, '')
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') // 仅保留汉字字母数字
        .toLowerCase();
};

export interface MatchAlternative {
    name: string;
    value: string | number;
    score: number;
}

export interface MatchResult {
    matchedParam: VehicleParameter | undefined;
    score: number; // 0-1, 0 is perfect, 1 is mismatch (Fuse legacy) or 1 is match, 0 is mismatch (Confidence)
    matchType: 'exact' | 'normalized' | 'alias' | 'fuzzy' | 'none';
    /** Top-N alternative fuzzy matches (excluding best), for dropdown selection UI */
    alternatives?: MatchAlternative[];
}

// Fuse 实例缓存：同一 candidates 引用 + 同一 threshold 只构建一次索引。
// 必须按 threshold 分键——Fuse 的 threshold 不只是事后过滤，它参与 Bitap 搜索的
// 早期剪枝上界（fuse.js 以 min(精确匹配得分, threshold) 作为放弃条件），因此不同
// 阈值会得出不同的结果集。早前只按数组身份缓存、却把首次构造时的 threshold 一并
// 复用，导致缺陷：数组被窄阈值（填报流 0.3）先建索引后，宽阈值（对比流 0.4）
// 调用时候选已在剪枝阶段被丢弃，findBestMatch 事后的阈值复检无从施展。
// 反向（先宽后窄）被那道复检兜住，所以缺陷只在「先窄后宽」时显形。
const fuseCache = new WeakMap<VehicleParameter[], Map<number, Fuse<VehicleParameter>>>();

// 规范化名称索引缓存：避免重复 normalizeName 调用
const normalizedMapCache = new WeakMap<VehicleParameter[], Map<string, VehicleParameter>>();

const getOrCreateFuse = (candidates: VehicleParameter[], threshold: number): Fuse<VehicleParameter> => {
    let byThreshold = fuseCache.get(candidates);
    if (!byThreshold) {
        byThreshold = new Map();
        fuseCache.set(candidates, byThreshold);
    }
    let fuse = byThreshold.get(threshold);
    if (!fuse) {
        fuse = new Fuse(candidates, {
            keys: ['name'],
            includeScore: true,
            threshold,
            ignoreLocation: true,
            useExtendedSearch: true
        });
        byThreshold.set(threshold, fuse);
    }
    return fuse;
};

const getOrCreateNormalizedMap = (candidates: VehicleParameter[]): Map<string, VehicleParameter> => {
    let map = normalizedMapCache.get(candidates);
    if (!map) {
        map = new Map();
        for (const p of candidates) {
            const key = normalizeName(p.name);
            if (!map.has(key)) map.set(key, p);
        }
        normalizedMapCache.set(candidates, map);
    }
    return map;
};

/**
 * 统一匹配函数
 * @param queryName 目标字段名（如用户输入的"车长"）
 * @param candidates 候选参数列表
 * @param threshold 模糊匹配阈值 (0-1), 越小越严格。默认0.3
 */
export const findBestMatch = (
    queryName: string,
    candidates: VehicleParameter[],
    threshold = 0.3
): MatchResult => {
    const normalizedQuery = normalizeName(queryName);
    const normalizedMap = getOrCreateNormalizedMap(candidates);
    
    // 1. 精确匹配 & 规范化匹配
    // 优先：名字完全一致（先用 normalizedMap 中的精确查找）
    const exactMatch = candidates.find(p => p.name === queryName);
    if (exactMatch) return { matchedParam: exactMatch, score: 0, matchType: 'exact' };

    // 次优：规范化后一致（O(1) Map 查找代替 O(N) 遍历）
    const normalizedMatch = normalizedMap.get(normalizedQuery);
    if (normalizedMatch) return { matchedParam: normalizedMatch, score: 0.1, matchType: 'normalized' };

    // 2. 同义词匹配
    for (const [standardName, aliases] of Object.entries(PARAMETER_ALIASES)) {
        const normalizedStandard = normalizeName(standardName);
        
        // 检查 query 是否在当前同义词组中
        const isQueryInGroup = normalizedQuery === normalizedStandard || 
                               aliases.some(a => normalizeName(a) === normalizedQuery);
        
        if (isQueryInGroup) {
            // 优先找标准词（O(1) Map 查找）
            const standardCand = normalizedMap.get(normalizedStandard);
            if (standardCand) return { matchedParam: standardCand, score: 0.1, matchType: 'alias' };
            
            // 找别名（O(1) Map 查找）
            for (const alias of aliases) {
                const aliasCand = normalizedMap.get(normalizeName(alias));
                if (aliasCand) return { matchedParam: aliasCand, score: 0.2, matchType: 'alias' };
            }
        }
    }

    // 3. 模糊匹配 (缓存的 Fuse 实例)
    const fuse = getOrCreateFuse(candidates, threshold);
    const fuseResults = fuse.search(queryName);
    if (fuseResults.length > 0) {
        const best = fuseResults[0];
        if (best.score !== undefined && best.score <= threshold) {
            // 收集 Top-5 候选项作为 alternatives（排除最优项自身）
            const alternatives: MatchAlternative[] = fuseResults
                .slice(1, 6)
                .filter(r => r.score !== undefined && r.score <= threshold)
                .map(r => ({
                    name: r.item.name,
                    value: r.item.value,
                    score: r.score!,
                }));
            return {
                matchedParam: best.item,
                score: best.score,
                matchType: 'fuzzy',
                alternatives: alternatives.length > 0 ? alternatives : undefined,
            };
        }
    }

    return { matchedParam: undefined, score: 1, matchType: 'none' };
};

/**
 * 同义词分组倒排索引：归一化后的名字 → 它所属的全部同义词组 key。
 * 一个名字可能落在多个组里（如「状态」同时是「停产日期」「停售日期」的别名，
 * 「乘员数」同时属于「驾驶室准乘人数」「额定载客(含驾驶员)」），这类名字**不唯一**。
 */
const buildAliasGroupIndex = (): Map<string, string[]> => {
    const index = new Map<string, string[]>();
    const add = (name: string, groupKey: string) => {
        const key = normalizeName(name);
        if (!key) return;
        const groups = index.get(key);
        if (groups) {
            if (!groups.includes(groupKey)) groups.push(groupKey);
        } else {
            index.set(key, [groupKey]);
        }
    };
    for (const [standardName, aliases] of Object.entries(PARAMETER_ALIASES)) {
        add(standardName, standardName);
        aliases.forEach((alias) => add(alias, standardName));
    }
    return index;
};

/**
 * 归一化的候选名 → **全部**同名候选（不是首个）。
 * findUniqueMatch 需要看见撞名的全部候选才能判「不唯一」，
 * 而 getOrCreateNormalizedMap 对同名只留首个，所以这里另建一份。
 */
const candidatesByNormalizedName = (candidates: VehicleParameter[]): Map<string, VehicleParameter[]> => {
    const map = new Map<string, VehicleParameter[]>();
    for (const p of candidates) {
        const key = normalizeName(p.name);
        if (!key) continue;
        const list = map.get(key);
        if (list) list.push(p);
        else map.set(key, [p]);
    }
    return map;
};

/**
 * 只有「唯一确定」时才返回候选，供批量自动绑定来源用；否则返回 undefined 让用户手选。
 *
 * 判定标准：
 * - 候选名与查询**完全一致** → 直接采用（最强信号，与 findBestMatch 的优先级一致）；
 * - 否则看归一化后同名的候选：恰好一个才算确定，撞名（如 `轴距(mm)` 与 `轴距(cm)`）判不确定；
 * - 同义词命中要求查询名只属于**一个**同义词组（跨组别名如「状态」「乘员数」直接判不确定），
 *   且该组内能被命中的候选恰好一个；
 * - 模糊相近不算命定，与 findBestMatch 一致（模糊交给用户手选）。
 */
export const findUniqueMatch = (
    queryName: string,
    candidates: VehicleParameter[]
): VehicleParameter | undefined => {
    const query = queryName.trim();
    if (!query || candidates.length === 0) return undefined;

    // 1. 完全一致：名字一模一样，无需再判唯一性
    const exact = candidates.find((p) => p.name === query);
    if (exact) return exact;

    const normalizedKey = normalizeName(query);
    if (!normalizedKey) return undefined;
    const byNormalized = candidatesByNormalizedName(candidates);

    // 2. 归一化同名：必须恰好一个
    const sameNormalized = byNormalized.get(normalizedKey);
    if (sameNormalized) return sameNormalized.length === 1 ? sameNormalized[0] : undefined;

    // 3. 同义词：跨组即不确定
    const groups = buildAliasGroupIndex().get(normalizedKey);
    if (!groups || groups.length !== 1) return undefined;

    // 组内所有可能命中的名字（标准名 + 全部别名）→ 汇总候选并去重
    const groupKey = groups[0];
    const namesInGroup = [groupKey, ...(PARAMETER_ALIASES[groupKey] ?? [])];
    const hits: VehicleParameter[] = [];
    const seen = new Set<string>();
    for (const name of namesInGroup) {
        for (const hit of byNormalized.get(normalizeName(name)) ?? []) {
            if (!seen.has(hit.name)) {
                seen.add(hit.name);
                hits.push(hit);
            }
        }
    }

    return hits.length === 1 ? hits[0] : undefined;
};
