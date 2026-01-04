import type { VehicleParameter, SheetData, DiffResult, CompareMode } from '../types';

/**
 * 参数别名/同义词库
 * key: 标准名称 (工信部常用名称)
 * value: 常见的其他叫法
 */
const PARAMETER_ALIASES: Record<string, string[]> = {
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
const normalizeName = (name: string): string => {
    return name
        .replace(/[（(].*?[)）]/g, '') // 去除括号及内容
        .replace(/[\[【].*?[\]】]/g, '') // 去除中括号及内容
        .replace(/\s+/g, '') // 去除空格
        .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ''); // 仅保留汉字字母数字
};

/**
 * 获取字段的粗略匹配（模糊匹配）
 * 支持：清洗后匹配 + 同义词匹配（均使用normalizeName进行宽松比对）
 */
const getRoughMatch = (name: string, candidates: Map<string, VehicleParameter>): VehicleParameter | undefined => {
    const normalizedName = normalizeName(name);

    // 1. 尝试清洗后直接匹配
    for (const [key, param] of candidates) {
        if (normalizeName(key) === normalizedName) {
            return param;
        }
    }

    // 2. 尝试同义词匹配（使用清洗后的名称进行宽松比对）
    for (const [standardName, aliases] of Object.entries(PARAMETER_ALIASES)) {
        const normalizedStandard = normalizeName(standardName);
        
        // 检查当前 name 是否是标准名或别名之一（清洗后比较）
        const isInGroup = normalizedName === normalizedStandard || 
                          aliases.some(a => normalizeName(a) === normalizedName);
        
        if (isInGroup) {
            // 在 candidates 中找同组的任意词（清洗后比较）
            // 优先找标准词
            for (const [candidateKey, candidateParam] of candidates) {
                if (normalizeName(candidateKey) === normalizedStandard) {
                    return candidateParam;
                }
            }
            
            // 找别名
            for (const alias of aliases) {
                const normalizedAlias = normalizeName(alias);
                for (const [candidateKey, candidateParam] of candidates) {
                    if (normalizeName(candidateKey) === normalizedAlias) {
                        return candidateParam;
                    }
                }
            }
        }
    }

    return undefined;
};

/**
 * 按字段内容对比（支持模糊匹配）
 * 匹配优先级：精确匹配 > 清洗匹配 > 同义词匹配
 */
const compareByContent = (base: SheetData, target: SheetData): DiffResult => {
    // 构建 Map: name -> param
    // 注意：这里用 name 而不是 group+name，因为模糊匹配跨 group 更有意义
    const baseMap = new Map<string, VehicleParameter>();
    base.data.forEach(p => baseMap.set(p.name, p));

    // targetMap 用于快速查找，并标记已匹配项
    const targetMap = new Map<string, VehicleParameter>();
    target.data.forEach(p => targetMap.set(p.name, p));

    const added: VehicleParameter[] = [];
    const removed: VehicleParameter[] = [];
    const modified: { id: string; oldParam: VehicleParameter; newParam: VehicleParameter }[] = [];
    const unchanged: VehicleParameter[] = [];

    // 用于记录 target 中已被匹配的 keys，避免重复添加
    const matchedTargetKeys = new Set<string>();

    // --- 重构匹配流程 ---
    
    const finalMatches = new Map<string, VehicleParameter>(); // baseName -> targetParam

    // Step 1: 精确匹配优先
    baseMap.forEach((_, baseName) => {
        if (targetMap.has(baseName)) {
            finalMatches.set(baseName, targetMap.get(baseName)!);
            matchedTargetKeys.add(baseName);
        }
    });

    // Step 2: 模糊匹配剩余项
    baseMap.forEach((_, baseName) => {
        if (!finalMatches.has(baseName)) {
            // 在未匹配的 target 中寻找
            const unmatchedTargetCandidates = new Map<string, VehicleParameter>();
            targetMap.forEach((p, key) => {
                if (!matchedTargetKeys.has(key)) {
                    unmatchedTargetCandidates.set(key, p);
                }
            });

            const match = getRoughMatch(baseName, unmatchedTargetCandidates);
            if (match) {
                finalMatches.set(baseName, match);
                matchedTargetKeys.add(match.name);
            }
        }
    });

    // Step 3: 生成结果
    baseMap.forEach((baseParam, baseName) => {
        const targetParam = finalMatches.get(baseName);
        if (targetParam) {
            // 比较值
            if (baseParam.value.toString() !== targetParam.value.toString()) {
                modified.push({ id: baseParam.id, oldParam: baseParam, newParam: targetParam });
            } else {
                unchanged.push(baseParam);
            }
        } else {
            removed.push(baseParam);
        }
    });

    // Step 4: 收集新增项
    targetMap.forEach((targetParam, targetName) => {
        if (!matchedTargetKeys.has(targetName)) {
            added.push(targetParam);
        }
    });

    return { added, removed, modified, unchanged };
};

/**
 * 按公告数据对比（以 Target 为基准，Base 中多余的字段忽略）
 * 适用于：Target=工信部数据，Base=用户上传文件
 */
const compareByMiit = (base: SheetData, target: SheetData): DiffResult => {
    const baseMap = new Map<string, VehicleParameter>();
    base.data.forEach(p => baseMap.set(p.name, p));

    const targetMap = new Map<string, VehicleParameter>();
    target.data.forEach(p => targetMap.set(p.name, p));

    const added: VehicleParameter[] = [];
    const removed: VehicleParameter[] = []; // MIIT 模式下，Base 中多余的字段不视为 Removed，而是忽略
    const modified: { id: string; oldParam: VehicleParameter; newParam: VehicleParameter }[] = [];
    const unchanged: VehicleParameter[] = [];

    // 遍历 Target（工信部数据）
    targetMap.forEach((targetParam, targetName) => {
        let baseParam: VehicleParameter | undefined;

        // 1. 精确匹配
        if (baseMap.has(targetName)) {
            baseParam = baseMap.get(targetName);
        }
        // 2. 模糊匹配
        else {
            baseParam = getRoughMatch(targetName, baseMap);
        }

        if (baseParam) {
            // 找到了对应的用户数据
            if (baseParam.value.toString() !== targetParam.value.toString()) {
                modified.push({ id: baseParam.id, oldParam: baseParam, newParam: targetParam });
            } else {
                unchanged.push(baseParam);
            }
        } else {
            // 用户数据中缺失该工信部字段 -> 视为 Added (New Requirement)
            added.push(targetParam);
        }
    });

    return { added, removed, modified, unchanged };
};

/**
 * 对比两个 Sheet 数据
 * @param mode 'content' - 按内容对比（默认）; 'miit' - 仅公告号数据对比
 */
export const compareSheets = (
    base: SheetData,
    target: SheetData,
    mode: CompareMode = 'content'
): DiffResult => {
    if (mode === 'miit') {
        return compareByMiit(base, target);
    }
    return compareByContent(base, target);
};
