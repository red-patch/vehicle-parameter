import type { AssetTagGroupsConfig } from './assetTagGroups';
import { DEFAULT_ASSET_TAG_GROUPS } from './assetTagGroups';

export interface AssetTagClassification {
    vehicleFamilyTags: string[];
    manufacturerTags: string[];
    otherTags: string[];
}

const buildSets = (config: AssetTagGroupsConfig) => ({
    vehicleFamilySet: new Set<string>(config.vehicleFamilyTags),
    manufacturerSet: new Set<string>(config.manufacturerTags),
});

export const classifyAssetTags = (
    tags: string[],
    config: AssetTagGroupsConfig = DEFAULT_ASSET_TAG_GROUPS
): AssetTagClassification => {
    const { vehicleFamilySet, manufacturerSet } = buildSets(config);
    const classification: AssetTagClassification = {
        vehicleFamilyTags: [],
        manufacturerTags: [],
        otherTags: [],
    };

    tags.forEach((tag) => {
        if (vehicleFamilySet.has(tag)) {
            classification.vehicleFamilyTags.push(tag);
            return;
        }

        if (manufacturerSet.has(tag)) {
            classification.manufacturerTags.push(tag);
            return;
        }

        classification.otherTags.push(tag);
    });

    return classification;
};

interface FilterAssetInfosParams<T extends { fileName: string }> {
    assets: T[];
    assetTags: Record<string, string[]>;
    selectedVehicleFamilyTag: string | null;
    selectedManufacturerTag: string | null;
    selectedOtherFilterTags: string[];
    config?: AssetTagGroupsConfig;
}

export const filterAssetInfos = <T extends { fileName: string }>({
    assets,
    assetTags,
    selectedVehicleFamilyTag,
    selectedManufacturerTag,
    selectedOtherFilterTags,
    config = DEFAULT_ASSET_TAG_GROUPS,
}: FilterAssetInfosParams<T>) => {
    buildSets(config);
    return assets.filter((asset) => {
        const tags = assetTags[asset.fileName] || [];

        if (selectedVehicleFamilyTag && !tags.includes(selectedVehicleFamilyTag)) {
            return false;
        }

        if (selectedManufacturerTag && !tags.includes(selectedManufacturerTag)) {
            return false;
        }

        if (selectedOtherFilterTags.length > 0 && !selectedOtherFilterTags.every((tag) => tags.includes(tag))) {
            return false;
        }

        return true;
    });
};

export const classifyAvailableTags = (allTags: string[]) => {
    return classifyAvailableTagsWithConfig(allTags, DEFAULT_ASSET_TAG_GROUPS);
};

export const classifyAvailableTagsWithConfig = (
    allTags: string[],
    config: AssetTagGroupsConfig
) => {
    const { vehicleFamilySet, manufacturerSet } = buildSets(config);
    const vehicleFamilyTags: string[] = [];
    const manufacturerTags: string[] = [];
    const otherTags: string[] = [];

    allTags.forEach((tag) => {
        if (vehicleFamilySet.has(tag)) {
            vehicleFamilyTags.push(tag);
        } else if (manufacturerSet.has(tag)) {
            manufacturerTags.push(tag);
        } else {
            otherTags.push(tag);
        }
    });

    return {
        vehicleFamilyTags,
        manufacturerTags,
        otherTags,
    };
};
