import type { SheetData, VehicleParameter } from '../types';

export type VehicleSource = 'excel' | 'asset';

const INSTANCE_SEPARATOR = '::';

export interface VehicleInstanceMeta {
    source: VehicleSource;
    fileName: string;
    productName: string;
    key: string;
}

export const buildVehicleInstanceKey = (
    source: VehicleSource,
    fileName: string,
    productName: string
): string => `${source}${INSTANCE_SEPARATOR}${fileName}${INSTANCE_SEPARATOR}${productName}`;

export const parseVehicleInstanceKey = (value: string): VehicleInstanceMeta | null => {
    const firstSep = value.indexOf(INSTANCE_SEPARATOR);
    if (firstSep === -1) return null;
    const secondSep = value.indexOf(INSTANCE_SEPARATOR, firstSep + INSTANCE_SEPARATOR.length);
    if (secondSep === -1) return null;

    const source = value.slice(0, firstSep) as VehicleSource;
    if (source !== 'excel' && source !== 'asset') return null;

    const fileName = value.slice(firstSep + INSTANCE_SEPARATOR.length, secondSep);
    const productName = value.slice(secondSep + INSTANCE_SEPARATOR.length);
    if (!fileName || !productName) return null;

    return {
        source,
        fileName,
        productName,
        key: value,
    };
};

export const getVehicleProductName = (value: string): string => {
    const parsed = parseVehicleInstanceKey(value);
    return parsed ? parsed.productName : value;
};

export const getVehicleSourceFileName = (value: string): string | null => {
    const parsed = parseVehicleInstanceKey(value);
    return parsed ? parsed.fileName : null;
};

export const buildVehicleInstanceMeta = (
    source: VehicleSource,
    fileName: string,
    productName: string
): VehicleInstanceMeta => ({
    source,
    fileName,
    productName,
    key: buildVehicleInstanceKey(source, fileName, productName),
});

export const getVehicleInstanceMetaFromParam = (
    source: VehicleSource,
    file: Pick<SheetData, 'fileName'>,
    param: Pick<VehicleParameter, 'productName' | 'instanceKey'>
): VehicleInstanceMeta => {
    const existing = param.instanceKey ? parseVehicleInstanceKey(param.instanceKey) : null;
    if (existing) return existing;

    const productName = param.productName || file.fileName;
    return buildVehicleInstanceMeta(source, file.fileName, productName);
};

export const buildVehicleOptionLabel = (instanceKey: string): string => {
    const parsed = parseVehicleInstanceKey(instanceKey);
    if (!parsed) return instanceKey;
    return `${parsed.productName} · ${parsed.fileName}`;
};

export const matchesVehicleSelection = (selection: string, instanceKey: string): boolean => {
    if (selection === instanceKey) return true;
    return getVehicleProductName(selection) === getVehicleProductName(instanceKey);
};
