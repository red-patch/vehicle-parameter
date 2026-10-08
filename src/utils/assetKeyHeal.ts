import type { SheetData } from '../types';
import { buildVehicleInstanceKey, getVehicleInstanceMetaFromParam, parseVehicleInstanceKey } from './vehicleInstance';

/**
 * 资产选择 key 自愈
 *
 * 会话里持久化的选择 key 形如 asset::文件名::产品名，其中「产品名」是写入当时的
 * 资产 productName；资产文件被重新导入/改写后，数据行的 productName 可能漂移
 * （如招标拉取批次文件名是「白犀牛R3_20260309」而行内 productName 是「白犀牛R3」），
 * 导致旧 key 与数据索引精确匹配、按名兜底全部落空，对比/填报等模块表现为"暂无数据"。
 * 这里从已加载的资产数据派生每个文件当前的规范 productName，把漂移的旧 key 重映射回去。
 */

/** 已加载资产 → 文件名当前的规范 productName（与 buildProductIndex 的取名规则一致）。
 *  行内 productName 缺失时按文件名（去 .json）兜底；一个文件内出现多种 productName 时无法裁决，跳过。 */
export const deriveCanonicalAssetProductNames = (files: SheetData[]): Record<string, string> => {
    const canonical: Record<string, string> = {};
    for (const file of files) {
        const names = new Set<string>();
        for (const p of file.data) {
            names.add(getVehicleInstanceMetaFromParam('asset', file, p).productName);
        }
        if (names.size === 1) {
            const [only] = names;
            canonical[file.fileName] = only;
        } else if (names.size === 0) {
            canonical[file.fileName] = file.fileName.replace(/\.json$/i, '');
        }
    }
    return canonical;
};

/** 重映射选择 key 列表：asset::文件名::旧名 → asset::文件名::规范名，并去重。
 *  非 asset key、未知文件、名称已一致的 key 原样保留；无任何变化时返回原引用。 */
export const remapAssetSelectionKeys = (
    keys: string[],
    canonicalByFileName: Record<string, string>
): string[] => {
    let changed = false;
    const next: string[] = [];
    const seen = new Set<string>();
    for (const key of keys) {
        const parsed = parseVehicleInstanceKey(key);
        const canonical = parsed ? canonicalByFileName[parsed.fileName] : undefined;
        const healed = parsed && canonical && canonical !== parsed.productName
            ? buildVehicleInstanceKey('asset', parsed.fileName, canonical)
            : key;
        if (healed !== key || seen.has(healed)) changed = true;
        if (!seen.has(healed)) next.push(healed);
        seen.add(healed);
    }
    return changed ? next : keys;
};
