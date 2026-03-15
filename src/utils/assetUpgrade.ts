import type { AssetUpgradeCategory, AssetUpgradeDraft, AssetUpgradeItem, SheetData, VehicleParameter } from '../types';

export interface AssetUpgradePreviewSummary {
    totalItems: number;
    keepOldCount: number;
    useNewCount: number;
    pendingCount: number;
    changedCount: number;
    newFieldCount: number;
    fillEmptyCount: number;
    conflictResolvedCount: number;
    oldOnlyCount: number;
}

export interface AssetUpgradePreviewItem {
    key: string;
    group: string;
    fieldName: string;
    oldValue: string;
    newValue: string;
    finalValue: string;
    category: AssetUpgradeCategory;
    decision: AssetUpgradeItem['decision'];
    changed: boolean;
}

export interface AssetUpgradePreview {
    summary: AssetUpgradePreviewSummary;
    items: AssetUpgradePreviewItem[];
}

const normalizeValue = (value: unknown) => String(value ?? '').trim();

const buildFieldKey = (group: string, name: string) => `${group}::${name}`;

const getCategoryDecision = (category: AssetUpgradeCategory): AssetUpgradeItem['decision'] => {
    switch (category) {
        case 'new_field':
        case 'fill_empty':
            return 'use_new';
        case 'conflict':
            return 'pending';
        case 'same':
        case 'old_only':
        default:
            return 'keep_old';
    }
};

const cloneParameter = (parameter: VehicleParameter | null): VehicleParameter | null => {
    if (!parameter) return null;
    return { ...parameter };
};

const toProductName = (data: SheetData) =>
    data.data.find((row) => row.productName?.trim())?.productName?.trim() || data.fileName.replace(/\.[^.]+$/u, '');

const buildIndex = (parameters: VehicleParameter[]) => {
    const index = new Map<string, VehicleParameter>();

    parameters.forEach((parameter) => {
        const key = buildFieldKey(parameter.group || '', parameter.name || '');
        if (!index.has(key)) {
            index.set(key, parameter);
        }
    });

    return index;
};

const createItem = (
    key: string,
    category: AssetUpgradeCategory,
    oldParameter: VehicleParameter | null,
    newParameter: VehicleParameter | null,
): AssetUpgradeItem => ({
    key,
    fieldName: newParameter?.name || oldParameter?.name || '',
    group: newParameter?.group || oldParameter?.group || '',
    oldValue: normalizeValue(oldParameter?.value),
    newValue: normalizeValue(newParameter?.value),
    category,
    decision: getCategoryDecision(category),
    required: category === 'conflict',
    oldParameter: cloneParameter(oldParameter),
    newParameter: cloneParameter(newParameter),
});

export const buildAssetUpgradeDraft = (
    assetData: SheetData,
    importedData: SheetData
): AssetUpgradeDraft => {
    const assetIndex = buildIndex(assetData.data);
    const importedIndex = buildIndex(importedData.data);
    const items: AssetUpgradeItem[] = [];
    const summary = {
        same: 0,
        newField: 0,
        fillEmpty: 0,
        conflict: 0,
        oldOnly: 0,
    };

    importedIndex.forEach((newParameter, key) => {
        const oldParameter = assetIndex.get(key) || null;
        const oldValue = normalizeValue(oldParameter?.value);
        const newValue = normalizeValue(newParameter.value);

        let category: AssetUpgradeCategory;
        if (!oldParameter) {
            category = 'new_field';
            summary.newField += 1;
        } else if (oldValue === newValue) {
            category = 'same';
            summary.same += 1;
        } else if (!oldValue && newValue) {
            category = 'fill_empty';
            summary.fillEmpty += 1;
        } else {
            category = 'conflict';
            summary.conflict += 1;
        }

        items.push(createItem(key, category, oldParameter, newParameter));
    });

    assetIndex.forEach((oldParameter, key) => {
        if (importedIndex.has(key)) {
            return;
        }

        summary.oldOnly += 1;
        items.push(createItem(key, 'old_only', oldParameter, null));
    });

    return {
        assetFileName: assetData.fileName,
        assetProductName: toProductName(assetData),
        importedFileName: importedData.fileName,
        items,
        summary,
    };
};

const materializeMergedParameter = (
    item: AssetUpgradeItem,
    assetProductName: string
): VehicleParameter | null => {
    if (item.decision === 'use_new' && item.newParameter) {
        if (item.oldParameter) {
            return {
                ...item.oldParameter,
                value: item.newParameter.value,
                rowCheck: item.newParameter.rowCheck ?? item.oldParameter.rowCheck,
                originSheet: item.newParameter.originSheet ?? item.oldParameter.originSheet,
                productName: assetProductName,
            };
        }

        return {
            ...item.newParameter,
            productName: assetProductName,
        };
    }

    if (item.oldParameter) {
        return {
            ...item.oldParameter,
            productName: assetProductName,
        };
    }

    if (item.newParameter) {
        return {
            ...item.newParameter,
            productName: assetProductName,
        };
    }

    return null;
};

export const applyAssetUpgradeDraft = (draft: AssetUpgradeDraft): VehicleParameter[] =>
    draft.items
        .map((item) => materializeMergedParameter(item, draft.assetProductName))
        .filter((parameter): parameter is VehicleParameter => Boolean(parameter));

const resolveFinalValue = (item: AssetUpgradeItem) => {
    if (item.decision === 'use_new') {
        return item.newValue;
    }

    return item.oldValue;
};

export const buildAssetUpgradePreview = (draft: AssetUpgradeDraft): AssetUpgradePreview => {
    const summary: AssetUpgradePreviewSummary = {
        totalItems: draft.items.length,
        keepOldCount: 0,
        useNewCount: 0,
        pendingCount: 0,
        changedCount: 0,
        newFieldCount: 0,
        fillEmptyCount: 0,
        conflictResolvedCount: 0,
        oldOnlyCount: 0,
    };

    draft.items.forEach((item) => {
        const finalValue = resolveFinalValue(item);
        const changed = finalValue !== item.oldValue;

        if (item.decision === 'use_new') summary.useNewCount += 1;
        if (item.decision === 'keep_old') summary.keepOldCount += 1;
        if (item.decision === 'pending') summary.pendingCount += 1;
        if (changed) summary.changedCount += 1;
        if (item.category === 'new_field') summary.newFieldCount += 1;
        if (item.category === 'fill_empty') summary.fillEmptyCount += 1;
        if (item.category === 'old_only') summary.oldOnlyCount += 1;
        if (item.category === 'conflict' && item.decision !== 'pending') summary.conflictResolvedCount += 1;
    });

    const items = draft.items
        .filter((item) => item.category !== 'same')
        .map((item) => {
            const finalValue = resolveFinalValue(item);
            const changed = finalValue !== item.oldValue;

            return {
                key: item.key,
                group: item.group,
                fieldName: item.fieldName,
                oldValue: item.oldValue,
                newValue: item.newValue,
                finalValue,
                category: item.category,
                decision: item.decision,
                changed,
            };
        });

    return {
        summary,
        items,
    };
};
