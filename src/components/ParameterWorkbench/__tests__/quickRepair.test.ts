import { describe, expect, it } from 'vitest';
import { buildRepairContext, getAssetBackedSourceFile } from '../quickRepair';

describe('getAssetBackedSourceFile', () => {
    it('returns the matching asset file for a product', () => {
        const result = getAssetBackedSourceFile([
            {
                fileName: 'demo.json',
                rawHeaders: [],
                data: [
                    { id: '1', group: '基础', name: '快充', value: '有', productName: '车型A' },
                ],
            },
        ], '车型A');

        expect(result).toBe('demo.json');
    });
});

describe('buildRepairContext', () => {
    it('creates compare repair payload with source label', () => {
        expect(buildRepairContext('compare', '车型A', 'demo.json', 'diff', '快充')).toEqual({
            productName: '车型A',
            sourceFileName: 'demo.json',
            fieldName: '快充',
            sourceModule: 'compare',
            reason: 'diff',
            sourceLabel: '版本对比',
        });
    });
});
