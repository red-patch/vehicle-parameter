import type { SheetData, VehicleParameter } from '../types';

/**
 * 获取指定车型的所有参数
 */
export const getProductData = (uploadedFiles: SheetData[], productName: string): VehicleParameter[] => {
    const params: VehicleParameter[] = [];
    for (const file of uploadedFiles) {
        for (const p of file.data) {
            const pName = p.productName || file.fileName;
            if (pName === productName) {
                params.push(p);
            }
        }
        // 由于同名产品可能存在于多个文件中，我们仍需继续遍历，
        // 但如果要求严格按照单个文件提取，则这里可以提前 break
        // 目前产品分布在多个文件合并的情况是支持的。
    }
    return params;
};

/**
 * 根据已配置的 files 和 selected names，生成下拉组件所需的 productOptions
 */
export const getProductOptions = (uploadedFiles: SheetData[], selectedProductNames: string[]) => {
    const options: { label: string; value: string }[] = [];
    const globalSelected = new Set(selectedProductNames);
    const added = new Set<string>();
    
    for (const file of uploadedFiles) {
        for (const p of file.data) {
            const name = p.productName || file.fileName;
            if (globalSelected.has(name) && !added.has(name)) {
                options.push({ label: name, value: name });
                added.add(name);
            }
        }
    }
    return options;
};
