import type { RepairContext, RepairReason, RepairSourceModule, SheetData } from '../../types';

export const getAssetBackedSourceFile = (
    assetFiles: SheetData[],
    productName: string
): string | null => {
    for (const file of assetFiles) {
        for (const param of file.data) {
            if ((param.productName || file.fileName) === productName) {
                return file.fileName;
            }
        }
    }
    return null;
};

export const buildRepairContext = (
    sourceModule: RepairSourceModule,
    productName: string,
    sourceFileName: string,
    reason: RepairReason,
    fieldName?: string
): RepairContext => {
    const sourceLabelMap: Record<RepairSourceModule, string> = {
        compare: '版本对比',
        smart_fill: '智能填报',
        multi_vehicle: '多车型管理',
    };

    return {
        productName,
        sourceFileName,
        fieldName,
        sourceModule,
        reason,
        sourceLabel: sourceLabelMap[sourceModule],
    };
};
