import { getProductData } from '../store/vehicleSelectors';
import type { SheetData, VehicleParameter } from '../types';
import { parseVehicleInstanceKey } from './vehicleInstance';

export type VehicleSelectionStatus = 'ready' | 'pending' | 'missing';

export interface VehicleSelectionState {
    key: string;
    data: VehicleParameter[];
    status: VehicleSelectionStatus;
}

export const getVehicleSelectionState = (
    uploadedFiles: SheetData[],
    instanceKey: string,
    assetFiles: SheetData[] = [],
    activeAssets: string[] = []
): VehicleSelectionState => {
    const data = getProductData(uploadedFiles, instanceKey, assetFiles);
    if (data.length > 0) {
        return { key: instanceKey, data, status: 'ready' };
    }

    const parsed = parseVehicleInstanceKey(instanceKey);
    const loadedAssetFiles = new Set(assetFiles.map((file) => file.fileName));
    const isPendingAsset =
        !!parsed &&
        parsed.source === 'asset' &&
        activeAssets.includes(parsed.fileName) &&
        !loadedAssetFiles.has(parsed.fileName);

    return {
        key: instanceKey,
        data,
        status: isPendingAsset ? 'pending' : 'missing',
    };
};

export const getVehicleSelectionStates = (
    uploadedFiles: SheetData[],
    instanceKeys: string[],
    assetFiles: SheetData[] = [],
    activeAssets: string[] = []
) => {
    const states = new Map<string, VehicleSelectionState>();
    instanceKeys.forEach((instanceKey) => {
        states.set(instanceKey, getVehicleSelectionState(uploadedFiles, instanceKey, assetFiles, activeAssets));
    });
    return states;
};
