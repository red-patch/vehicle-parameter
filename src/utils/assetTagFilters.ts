import type { AssetTagGroupsConfig } from './assetTagGroups';

interface ClassificationResult {
    vehicleFamilyTags: string[];
    manufacturerTags: string[];
    otherTags: string[];
}

function buildSets(config: AssetTagGroupsConfig): { vehicleFamilySet: Set<string>; manufacturerSet: Set<string> } {
    // 支持新旧两种格式
    const groups = config as any;
    const vehicleFamilyTags: string[] = groups.vehicleFamilyTags || groups.groups?.find((g: any) => g.name === '车型族群')?.tags || [];
    const manufacturerTags: string[] = groups.manufacturerTags || groups.groups?.find((g: any) => g.name === '厂商')?.tags || [];
    return {
        vehicleFamilySet: new Set(vehicleFamilyTags),
        manufacturerSet: new Set(manufacturerTags),
    };
}

export interface FilterAssetInfosParams<T> {
    assets: T[];
    assetTags: Record<string, string[]>;
    selectedVehicleFamilyTag: string | null;
    selectedManufacturerTag: string | null;
    selectedOtherFilterTags: string[];
    config?: AssetTagGroupsConfig;
}

export function filterAssetInfos<T extends { fileName: string }>({
    assets,
    assetTags,
    selectedVehicleFamilyTag,
    selectedManufacturerTag,
    selectedOtherFilterTags,
    config = { groups: [], exclusiveGroups: [] },
}: FilterAssetInfosParams<T>) {
    buildSets(config);
    return assets.filter((asset) => {
        const tags = assetTags[asset.fileName] || [];
        if (selectedVehicleFamilyTag && !tags.includes(selectedVehicleFamilyTag)) return false;
        if (selectedManufacturerTag && !tags.includes(selectedManufacturerTag)) return false;
        if (selectedOtherFilterTags.length > 0 && !selectedOtherFilterTags.every((tag) => tags.includes(tag))) return false;
        return true;
    });
}

export const classifyAvailableTagsWithConfig = (
    allTags: string[],
    config: AssetTagGroupsConfig
): ClassificationResult => {
    const { vehicleFamilySet, manufacturerSet } = buildSets(config);
    const vehicleFamilyTags: string[] = [];
    const manufacturerTags: string[] = [];
    const otherTags: string[] = [];
    allTags.forEach((tag) => {
        if (vehicleFamilySet.has(tag)) vehicleFamilyTags.push(tag);
        else if (manufacturerSet.has(tag)) manufacturerTags.push(tag);
        else otherTags.push(tag);
    });
    return { vehicleFamilyTags, manufacturerTags, otherTags };
};

export const classifyAvailableTags = (allTags: string[]): ClassificationResult => {
    return classifyAvailableTagsWithConfig(allTags, { groups: [], exclusiveGroups: [] });
};
