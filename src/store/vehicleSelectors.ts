import type { SheetData, VehicleParameter } from '../types';

/**
 * 获取指定车型的所有参数
 */
export const getProductData = (
    uploadedFiles: SheetData[], 
    productName: string,
    assetFiles: SheetData[] = []
): VehicleParameter[] => {
    const params: VehicleParameter[] = [];
    
    // 扫描 Excel 源
    for (const file of uploadedFiles) {
        for (const p of file.data) {
            const pName = p.productName || file.fileName;
            if (pName === productName) {
                params.push(p);
            }
        }
    }

    // 扫描资产源
    for (const file of assetFiles) {
        for (const p of file.data) {
            const pName = p.productName || file.fileName;
            if (pName === productName) {
                params.push(p);
            }
        }
    }

    return params;
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
    
    const scan = (files: SheetData[]) => {
        for (const file of files) {
            for (const p of file.data) {
                const name = p.productName || file.fileName;
                if (globalSelected.has(name) && !added.has(name)) {
                    options.push({ label: name, value: name });
                    added.add(name);
                }
            }
        }
    };

    scan(uploadedFiles);
    scan(assetFiles);
    
    return options;
};
