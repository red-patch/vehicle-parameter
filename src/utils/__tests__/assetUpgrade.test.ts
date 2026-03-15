import { describe, expect, it } from 'vitest';
import type { SheetData } from '../../types';
import { applyAssetUpgradeDraft, buildAssetUpgradeDraft, buildAssetUpgradePreview } from '../assetUpgrade';

const createSheetData = (fileName: string, productName: string, rows: Array<{ id: string; group: string; name: string; value: string }>): SheetData => ({
    fileName,
    rawHeaders: [],
    data: rows.map((row) => ({
        ...row,
        productName,
    })),
});

describe('buildAssetUpgradeDraft', () => {
    it('classifies field changes and assigns safe default decisions', () => {
        const assetData = createSheetData('asset.json', '车型A', [
            { id: '1', group: '基础', name: '快充', value: '无' },
            { id: '2', group: '基础', name: '轮胎', value: '' },
            { id: '3', group: '配置', name: '音响', value: '6 扬声器' },
            { id: '4', group: '安全', name: '气囊', value: '6 个' },
        ]);
        const importedData = createSheetData('new.xlsx', '车型A', [
            { id: '10', group: '基础', name: '快充', value: '有' },
            { id: '11', group: '基础', name: '轮胎', value: '185/65R15' },
            { id: '12', group: '配置', name: '慢充', value: '支持' },
            { id: '13', group: '安全', name: '气囊', value: '6 个' },
        ]);

        const draft = buildAssetUpgradeDraft(assetData, importedData);

        expect(draft.assetFileName).toBe('asset.json');
        expect(draft.assetProductName).toBe('车型A');
        expect(draft.importedFileName).toBe('new.xlsx');
        expect(draft.summary).toEqual({
            same: 1,
            newField: 1,
            fillEmpty: 1,
            conflict: 1,
            oldOnly: 1,
        });
        expect(draft.items.map((item) => [item.key, item.category, item.decision])).toEqual([
            ['基础::快充', 'conflict', 'pending'],
            ['基础::轮胎', 'fill_empty', 'use_new'],
            ['配置::慢充', 'new_field', 'use_new'],
            ['安全::气囊', 'same', 'keep_old'],
            ['配置::音响', 'old_only', 'keep_old'],
        ]);
    });
});

describe('applyAssetUpgradeDraft', () => {
    it('merges parameters according to decisions and keeps unresolved conflicts safe', () => {
        const assetData = createSheetData('asset.json', '车型A', [
            { id: '1', group: '基础', name: '快充', value: '无' },
            { id: '2', group: '基础', name: '轮胎', value: '' },
            { id: '3', group: '配置', name: '音响', value: '6 扬声器' },
        ]);
        const importedData = createSheetData('new.xlsx', '车型B', [
            { id: '10', group: '基础', name: '快充', value: '有' },
            { id: '11', group: '基础', name: '轮胎', value: '185/65R15' },
            { id: '12', group: '配置', name: '慢充', value: '支持' },
        ]);

        const draft = buildAssetUpgradeDraft(assetData, importedData);
        const merged = applyAssetUpgradeDraft(draft);

        expect(merged.map((item) => [item.id, item.group, item.name, item.value, item.productName])).toEqual([
            ['1', '基础', '快充', '无', '车型A'],
            ['2', '基础', '轮胎', '185/65R15', '车型A'],
            ['12', '配置', '慢充', '支持', '车型A'],
            ['3', '配置', '音响', '6 扬声器', '车型A'],
        ]);
    });
});

describe('buildAssetUpgradePreview', () => {
    it('derives preview summary and hides same rows from detail review', () => {
        const assetData = createSheetData('asset.json', '车型A', [
            { id: '1', group: '基础', name: '快充', value: '无' },
            { id: '2', group: '基础', name: '轮胎', value: '' },
            { id: '3', group: '配置', name: '音响', value: '6 扬声器' },
            { id: '4', group: '安全', name: '气囊', value: '6 个' },
        ]);
        const importedData = createSheetData('new.xlsx', '车型A', [
            { id: '10', group: '基础', name: '快充', value: '有' },
            { id: '11', group: '基础', name: '轮胎', value: '185/65R15' },
            { id: '12', group: '配置', name: '慢充', value: '支持' },
            { id: '13', group: '安全', name: '气囊', value: '6 个' },
        ]);

        const draft = buildAssetUpgradeDraft(assetData, importedData);
        const preview = buildAssetUpgradePreview(draft);

        expect(preview.summary).toEqual({
            totalItems: 5,
            keepOldCount: 2,
            useNewCount: 2,
            pendingCount: 1,
            changedCount: 2,
            newFieldCount: 1,
            fillEmptyCount: 1,
            conflictResolvedCount: 0,
            oldOnlyCount: 1,
        });
        expect(preview.items.map((item) => [item.key, item.category, item.decision, item.finalValue, item.changed])).toEqual([
            ['基础::快充', 'conflict', 'pending', '无', false],
            ['基础::轮胎', 'fill_empty', 'use_new', '185/65R15', true],
            ['配置::慢充', 'new_field', 'use_new', '支持', true],
            ['配置::音响', 'old_only', 'keep_old', '6 扬声器', false],
        ]);
    });
});
