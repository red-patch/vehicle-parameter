import type { SheetData, VehicleParameter } from '../types';

export type VehicleSource = 'excel' | 'asset';

const INSTANCE_SEPARATOR = '::';

export interface VehicleInstanceMeta {
    source: VehicleSource;
    fileName: string;
    productName: string;
    key: string;
}

export interface VehicleDisplayLabel {
    shortLabel: string;
    fullLabel: string;
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
    // 同名时只显示产品名，避免重复显示（如"新石器_X3 · 新石器_X3.json"）
    const fileNameBase = parsed.fileName.replace(/\.json$/i, '');
    if (parsed.productName === fileNameBase) return parsed.productName;
    return `${parsed.productName} · ${parsed.fileName}`;
};

const compareVehicleInstanceMeta = (left: VehicleInstanceMeta, right: VehicleInstanceMeta) => {
    const fileNameCompare = left.fileName.localeCompare(right.fileName, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
    if (fileNameCompare !== 0) return fileNameCompare;

    const sourceOrder = (source: VehicleSource) => (source === 'asset' ? 0 : 1);
    const sourceCompare = sourceOrder(left.source) - sourceOrder(right.source);
    if (sourceCompare !== 0) return sourceCompare;

    return left.key.localeCompare(right.key, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' });
};

/**
 * 计算某实例键的显示基名。资产实例（source='asset'）且提供解析器时走别名解析
 * （设计 docs/plans/2026-10-13-asset-alias-design.md）；其余回落产品名。
 * 注意：别名只影响这个**显示基名**，实例键本身仍是 fileName+productName，身份不受影响。
 */
const resolveInstanceBaseName = (
    meta: VehicleInstanceMeta,
    aliasResolver?: (fileName: string, productName: string) => string | null,
): string => {
    if (meta.source === 'asset' && aliasResolver) {
        return aliasResolver(meta.fileName, meta.productName) || meta.productName;
    }
    return meta.productName;
};

export const buildVehicleDisplayLabels = (
    instanceKeys: string[],
    aliasResolver?: (fileName: string, productName: string) => string | null,
): Map<string, VehicleDisplayLabel> => {
    const labels = new Map<string, VehicleDisplayLabel>();
    const metas = Array.from(new Set(instanceKeys))
        .map((instanceKey) => parseVehicleInstanceKey(instanceKey))
        .filter((meta): meta is VehicleInstanceMeta => meta !== null);

    const grouped = new Map<string, VehicleInstanceMeta[]>();
    metas.forEach((meta) => {
        const bucket = grouped.get(meta.productName);
        if (bucket) {
            bucket.push(meta);
        } else {
            grouped.set(meta.productName, [meta]);
        }
    });

    grouped.forEach((group) => {
        const sorted = [...group].sort(compareVehicleInstanceMeta);
        sorted.forEach((meta, index) => {
            const baseName = resolveInstanceBaseName(meta, aliasResolver);
            labels.set(meta.key, {
                shortLabel: sorted.length > 1 ? `${baseName}（${index + 1}）` : baseName,
                fullLabel: buildVehicleOptionLabel(meta.key),
            });
        });
    });

    instanceKeys.forEach((instanceKey) => {
        if (!labels.has(instanceKey)) {
            labels.set(instanceKey, {
                shortLabel: getVehicleProductName(instanceKey),
                fullLabel: buildVehicleOptionLabel(instanceKey),
            });
        }
    });

    return labels;
};

export const matchesVehicleSelection = (selection: string, instanceKey: string): boolean => {
    if (selection === instanceKey) return true;
    return getVehicleProductName(selection) === getVehicleProductName(instanceKey);
};
