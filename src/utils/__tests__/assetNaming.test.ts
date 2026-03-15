import { describe, expect, it } from 'vitest';
import { getAssetBaseName, getAssetDisplayName, toAssetFileName } from '../assetNaming';

describe('assetNaming', () => {
    it('strips json suffix to produce the base name', () => {
        expect(getAssetBaseName('车型A.json')).toBe('车型A');
        expect(getAssetBaseName('车型A')).toBe('车型A');
    });

    it('prefers product name for display when present', () => {
        expect(getAssetDisplayName('old-name.json', '统一车型名')).toBe('统一车型名');
        expect(getAssetDisplayName('old-name.json', '')).toBe('old-name');
    });

    it('normalizes any rename input into a json file name', () => {
        expect(toAssetFileName(' 车型B ')).toBe('车型B.json');
        expect(toAssetFileName('车型B.json')).toBe('车型B.json');
    });
});
