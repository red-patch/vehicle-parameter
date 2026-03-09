import type { SheetData, VehicleParameter } from '../types';

const uploadedIndexCache = new WeakMap<SheetData[], Map<string, VehicleParameter[]>>();
const assetIndexCache = new WeakMap<SheetData[], Map<string, VehicleParameter[]>>();

const buildProductIndex = (files: SheetData[]): Map<string, VehicleParameter[]> => {
    const index = new Map<string, VehicleParameter[]>();
    for (const file of files) {
        for (const p of file.data) {
            const pName = p.productName || file.fileName;
            const bucket = index.get(pName);
            if (bucket) {
                bucket.push(p);
            } else {
                index.set(pName, [p]);
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
        index = buildProductIndex(files);
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
    return [...fromUploaded, ...fromAsset];
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
        for (const name of index.keys()) {
            if (globalSelected.has(name) && !added.has(name)) {
                options.push({ label: name, value: name });
                added.add(name);
            }
        }
    };

    collect(getOrCreateIndex(uploadedFiles, uploadedIndexCache));
    collect(getOrCreateIndex(assetFiles, assetIndexCache));
    
    return options;
};
