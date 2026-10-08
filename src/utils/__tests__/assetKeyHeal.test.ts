import { describe, expect, it } from 'vitest';
import { deriveCanonicalAssetProductNames, remapAssetSelectionKeys } from '../assetKeyHeal';
import type { SheetData } from '../../types';

const makeAssetFile = (fileName: string, productName: string | null, values: string[]): SheetData => ({
    fileName,
    rawHeaders: [],
    data: values.map((value, i) => ({
        id: `${fileName}-${i}`,
        group: '基础信息',
        name: '整备质量',
        value,
        ...(productName !== null ? { productName } : {}),
    })),
});

describe('deriveCanonicalAssetProductNames', () => {
    it('derives the productName the data rows actually carry', () => {
        const files = [makeAssetFile('白犀牛R3_20260309.json', '白犀牛R3', ['1000', '1200'])];
        expect(deriveCanonicalAssetProductNames(files)).toEqual({
            '白犀牛R3_20260309.json': '白犀牛R3',
        });
    });

    it('falls back to the full file name when rows carry no productName (matches index keys)', () => {
        const files = [makeAssetFile('foo.json', null, ['1000'])];
        expect(deriveCanonicalAssetProductNames(files)).toEqual({ 'foo.json': 'foo.json' });
    });

    it('falls back to the file base name for empty files', () => {
        const files = [makeAssetFile('bar.json', '任意', [])];
        expect(deriveCanonicalAssetProductNames(files)).toEqual({ 'bar.json': 'bar' });
    });

    it('skips files whose rows disagree on productName', () => {
        const files: SheetData[] = [
            {
                fileName: 'multi.json',
                rawHeaders: [],
                data: [
                    { id: '1', group: 'g', name: 'n', value: '1', productName: '车型A' },
                    { id: '2', group: 'g', name: 'n', value: '2', productName: '车型B' },
                ],
            },
        ];
        expect(deriveCanonicalAssetProductNames(files)).toEqual({});
    });
});

describe('remapAssetSelectionKeys', () => {
    const canonical = { '白犀牛R3_20260309.json': '白犀牛R3' };

    it('heals a drifted asset key to the canonical productName', () => {
        expect(remapAssetSelectionKeys(['asset::白犀牛R3_20260309.json::白犀牛R3_20260309'], canonical))
            .toEqual(['asset::白犀牛R3_20260309.json::白犀牛R3']);
    });

    it('keeps excel keys, unknown files and already-canonical keys untouched', () => {
        const keys = [
            'excel::first.xlsx::V6E小卡车',
            'asset::missing.json::任意名',
            'asset::白犀牛R3_20260309.json::白犀牛R3',
            '纯名字',
        ];
        expect(remapAssetSelectionKeys(keys, canonical)).toEqual(keys);
    });

    it('returns the original reference when nothing changed', () => {
        const keys = ['asset::白犀牛R3_20260309.json::白犀牛R3'];
        expect(remapAssetSelectionKeys(keys, canonical)).toBe(keys);
    });

    it('dedupes when both the drifted and the canonical key are selected', () => {
        expect(remapAssetSelectionKeys([
            'asset::白犀牛R3_20260309.json::白犀牛R3_20260309',
            'asset::白犀牛R3_20260309.json::白犀牛R3',
        ], canonical)).toEqual(['asset::白犀牛R3_20260309.json::白犀牛R3']);
    });
});
