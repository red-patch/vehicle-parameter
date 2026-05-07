import type { SheetData, VehicleParameter } from '../types';
import {
    buildVehicleDisplayLabels,
    getVehicleProductName,
    getVehicleInstanceMetaFromParam,
    matchesVehicleSelection,
} from '../utils/vehicleInstance';

const uploadedIndexCache = new WeakMap<SheetData[], Map<string, VehicleParameter[]>>();
const assetIndexCache = new WeakMap<SheetData[], Map<string, VehicleParameter[]>>();

const buildProductIndex = (files: SheetData[], source: 'excel' | 'asset'): Map<string, VehicleParameter[]> => {
    const index = new Map<string, VehicleParameter[]>();
    for (const file of files) {
        for (const p of file.data) {
            const identity = getVehicleInstanceMetaFromParam(source, file, p);
            const bucket = index.get(identity.key);
            const nextParam = p.instanceKey ? p : { ...p, instanceKey: identity.key };
            if (bucket) {
                bucket.push(nextParam);
            } else {
                index.set(identity.key, [nextParam]);
            }
        }
    }
    return index;
};

const getOrCreateIndex = (
    files: SheetData[],
    cache: WeakMap<SheetData[], Map<string, VehicleParameter[]>>
): Map<string, VehicleParameter[]> => {
    let index = cache.get(files);
    if (!index) {
        index = buildProductIndex(files, cache === uploadedIndexCache ? 'excel' : 'asset');
        cache.set(files, index);
    }
    return index;
};

/**
 * 获取指定车型的所有参数
 */
export const getProductData = (
    uploadedFiles: SheetData[], 
    productName: string,
    assetFiles: SheetData[] = []
): VehicleParameter[] => {
    const uploadedIndex = getOrCreateIndex(uploadedFiles, uploadedIndexCache);
    const assetIndex = getOrCreateIndex(assetFiles, assetIndexCache);

    const fromUploaded = uploadedIndex.get(productName) || [];
    const fromAsset = assetIndex.get(productName) || [];
    if (fromUploaded.length > 0 || fromAsset.length > 0) {
        return [...fromUploaded, ...fromAsset];
    }

    // 兼容旧状态：如果传入的是纯车型名，则回退到按显示名聚合
    // 按 param.id 去重，防止同一参数从两个 source 各被匹配一次导致翻倍
    const legacyMatches: VehicleParameter[] = [];
    const seenIds = new Set<string>();
    for (const [instanceKey, params] of uploadedIndex.entries()) {
        if (matchesVehicleSelection(productName, instanceKey)) {
            for (const p of params) {
                if (!seenIds.has(p.id)) { seenIds.add(p.id); legacyMatches.push(p); }
            }
        }
    }
    for (const [instanceKey, params] of assetIndex.entries()) {
        if (matchesVehicleSelection(productName, instanceKey)) {
            for (const p of params) {
                if (!seenIds.has(p.id)) { seenIds.add(p.id); legacyMatches.push(p); }
            }
        }
    }
    return legacyMatches;
};

/**
 * 根据已配置的 files 和 selected names，生成下拉组件所需的 productOptions
 */
export const getProductOptions = (
    uploadedFiles: SheetData[], 
    selectedProductNames: string[],
    assetFiles: SheetData[] = []
) => {
    const candidateKeys: string[] = [];
    const added = new Set<string>();
    const uploadedIndex = getOrCreateIndex(uploadedFiles, uploadedIndexCache);
    const assetIndex = getOrCreateIndex(assetFiles, assetIndexCache);

    const appendCandidate = (instanceKey: string) => {
        if (added.has(instanceKey)) return;
        candidateKeys.push(instanceKey);
        added.add(instanceKey);
    };

    const collect = (
        selection: string,
        index: Map<string, VehicleParameter[]>
    ) => {
        for (const instanceKey of index.keys()) {
            if (matchesVehicleSelection(selection, instanceKey)) appendCandidate(instanceKey);
        }
    };

    selectedProductNames.forEach(selection => {
        // 选中状态是下游模块最先感知到的来源，先用它保证下拉立即可见。
        appendCandidate(selection);
        collect(selection, uploadedIndex);
        collect(selection, assetIndex);
    });

    const labels = buildVehicleDisplayLabels(candidateKeys);

    return candidateKeys.map((instanceKey) => ({
        label: labels.get(instanceKey)?.shortLabel || getVehicleProductName(instanceKey),
        value: instanceKey,
    }));
};
