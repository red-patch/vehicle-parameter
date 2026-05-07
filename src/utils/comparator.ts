import type { VehicleParameter, SheetData, DiffResult, CompareMode } from '../types';
import { findBestMatch } from './matchingEngine';

/**
 * 按字段内容对比（支持模糊匹配）
 * 匹配优先级：精确匹配 > 清洗匹配 > 同义词匹配
 */
const compareByContent = (base: SheetData, target: SheetData): DiffResult => {
    // 构建 Map: name -> param
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

    const finalMatches = new Map<string, VehicleParameter>(); // baseName -> targetParam

    // Step 1: 精确匹配优先
    baseMap.forEach((_, baseName) => {
        if (targetMap.has(baseName)) {
            finalMatches.set(baseName, targetMap.get(baseName)!);
            matchedTargetKeys.add(baseName);
        }
    });

    // Step 2: 模糊匹配剩余项
    // 准备未匹配的 target 列表（不修改此数组，避免破坏 matchingEngine 的 WeakMap 缓存）
    const unmatchedTargetCandidates: VehicleParameter[] = [];
    targetMap.forEach((p, key) => {
        if (!matchedTargetKeys.has(key)) {
            unmatchedTargetCandidates.push(p);
        }
    });

    // 追踪已被模糊匹配占用的 target 名称，防止多对一匹配
    const usedTargetNames = new Set<string>(matchedTargetKeys);

    baseMap.forEach((_, baseName) => {
        if (!finalMatches.has(baseName)) {
            const matchResult = findBestMatch(baseName, unmatchedTargetCandidates, 0.4);
            
            if (matchResult.matchedParam && !usedTargetNames.has(matchResult.matchedParam.name)) {
                finalMatches.set(baseName, matchResult.matchedParam);
                matchedTargetKeys.add(matchResult.matchedParam.name);
                usedTargetNames.add(matchResult.matchedParam.name);
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
    // Base 是候选池
    const baseParams = base.data; // 全量作为候选
    const baseMap = new Map<string, VehicleParameter>();
    base.data.forEach(p => baseMap.set(p.name, p));

    const targetMap = new Map<string, VehicleParameter>();
    target.data.forEach(p => targetMap.set(p.name, p));

    const added: VehicleParameter[] = [];
    const removed: VehicleParameter[] = []; 
    const modified: { id: string; oldParam: VehicleParameter; newParam: VehicleParameter }[] = [];
    const unchanged: VehicleParameter[] = [];

    // 遍历 Target（工信部数据）
    targetMap.forEach((targetParam, targetName) => {
        let baseParam: VehicleParameter | undefined;

        // 1. 精确匹配
        if (baseMap.has(targetName)) {
            baseParam = baseMap.get(targetName);
        }
        // 2. 模糊匹配 (使用统一引擎)
        else {
            const matchResult = findBestMatch(targetName, baseParams, 0.4);
            baseParam = matchResult.matchedParam;
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
