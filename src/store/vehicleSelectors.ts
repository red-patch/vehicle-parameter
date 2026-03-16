import type { SheetData, VehicleParameter } from '../types';
import {
    buildVehicleOptionLabel,
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
    const legacyMatches: VehicleParameter[] = [];
    for (const [instanceKey, params] of uploadedIndex.entries()) {
        if (matchesVehicleSelection(productName, instanceKey)) legacyMatches.push(...params);
    }
    for (const [instanceKey, params] of assetIndex.entries()) {
        if (matchesVehicleSelection(productName, instanceKey)) legacyMatches.push(...params);
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
    const options: { label: string; value: string }[] = [];
    const globalSelected = new Set(selectedProductNames);
    const added = new Set<string>();

    const collect = (
        index: Map<string, VehicleParameter[]>
    ) => {
        for (const instanceKey of index.keys()) {
            const isSelected = Array.from(globalSelected).some(selection => matchesVehicleSelection(selection, instanceKey));
            if (isSelected && !added.has(instanceKey)) {
                options.push({ label: buildVehicleOptionLabel(instanceKey), value: instanceKey });
                added.add(instanceKey);
            }
        }
    };

    collect(getOrCreateIndex(uploadedFiles, uploadedIndexCache));
    collect(getOrCreateIndex(assetFiles, assetIndexCache));
    
    return options;
};
