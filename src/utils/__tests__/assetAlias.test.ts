import { describe, expect, it } from 'vitest';
import {
    normalizeAlias,
    getOwnAlias,
    resolveAssetAlias,
    resolveAssetDisplayName,
    parseCapacityKwh,
    suggestAssetAlias,
    buildAliasSuggestions,
    type AliasSource,
} from '../assetAlias';
import type { AssetMetaMap } from '../assetManager';

const meta = (map: Record<string, { alias?: string; groupName?: string }>): AssetMetaMap =>
    map as AssetMetaMap;

/** 身份解析桩：fileName → 身份键；身份键 → 同车文件（最新在前） */
const source = (
    metaMap: AssetMetaMap,
    identity: Record<string, string> = {},
    siblings: Record<string, string[]> = {},
): AliasSource => ({
    metaMap,
    identityKeyOf: (fileName) => identity[fileName] ?? null,
    siblingsOf: (key) => siblings[key] ?? [],
});

describe('assetAlias · normalizeAlias', () => {
    it('trims and treats blank as unset', () => {
        expect(normalizeAlias('  V8E  ')).toBe('V8E');
        expect(normalizeAlias('   ')).toBe('');
        expect(normalizeAlias(undefined)).toBe('');
        expect(normalizeAlias(null)).toBe('');
    });
});

describe('assetAlias · getOwnAlias', () => {
    it('returns the file-level alias, null when unset or blank', () => {
        expect(getOwnAlias('a.json', meta({ 'a.json': { alias: 'V8E' } }))).toBe('V8E');
        expect(getOwnAlias('a.json', meta({ 'a.json': {} }))).toBeNull();
        expect(getOwnAlias('a.json', meta({ 'a.json': { alias: '   ' } }))).toBeNull();
        expect(getOwnAlias('missing.json', meta({}))).toBeNull();
    });
});

describe('assetAlias · resolveAssetAlias (自身 → 同身份键继承)', () => {
    it('prefers the asset own alias', () => {
        const src = source(meta({ 'v2.json': { alias: '我的短名' } }));
        expect(resolveAssetAlias('v2.json', src)).toBe('我的短名');
    });

    it('inherits the alias of a sibling version when自身无别名', () => {
        const src = source(
            meta({ 'v1.json': { alias: 'V8E' } }),
            { 'v2.json': 'A:1', 'v1.json': 'A:1' },
            { 'A:1': ['v2.json', 'v1.json'] },
        );
        // v2 是当前（无别名），v1 是旧版本（有别名）→ 继承
        expect(resolveAssetAlias('v2.json', src)).toBe('V8E');
    });

    it('own alias wins over an inherited one', () => {
        const src = source(
            meta({ 'v1.json': { alias: '旧别名' }, 'v2.json': { alias: '新别名' } }),
            { 'v2.json': 'A:1', 'v1.json': 'A:1' },
            { 'A:1': ['v2.json', 'v1.json'] },
        );
        expect(resolveAssetAlias('v2.json', src)).toBe('新别名');
    });

    it('does not inherit across different identity keys', () => {
        const src = source(
            meta({ 'other.json': { alias: '别的车' } }),
            { 'v2.json': 'A:1', 'other.json': 'A:2' },
            { 'A:1': ['v2.json'] },
        );
        expect(resolveAssetAlias('v2.json', src)).toBeNull();
    });

    it('does not self-inherit when itself is the only member', () => {
        const src = source(meta({}), { 'v2.json': 'A:1' }, { 'A:1': ['v2.json'] });
        expect(resolveAssetAlias('v2.json', src)).toBeNull();
    });

    it('skips siblings without an alias and takes the newest one that has it', () => {
        const src = source(
            meta({ 'v1.json': { alias: '最早的别名' } }),
            { 'v3.json': 'A:1', 'v2.json': 'A:1', 'v1.json': 'A:1' },
            { 'A:1': ['v3.json', 'v2.json', 'v1.json'] },
        );
        expect(resolveAssetAlias('v3.json', src)).toBe('最早的别名');
    });

    it('returns null when no identity resolver is supplied', () => {
        expect(resolveAssetAlias('v2.json', { metaMap: meta({}) })).toBeNull();
    });
});

describe('assetAlias · resolveAssetDisplayName (别名 → 组名 → 派生名)', () => {
    it('uses the alias first', () => {
        const src = source(meta({ 'a.json': { alias: 'V8E', groupName: '组名' } }));
        expect(resolveAssetDisplayName({ fileName: 'a.json', productName: '超长产品名' }, src)).toBe('V8E');
    });

    it('falls back to the group display name when no alias', () => {
        const src = source(meta({ 'a.json': { groupName: '星享V6E' } }));
        expect(resolveAssetDisplayName({ fileName: 'a.json', productName: '超长产品名' }, src)).toBe('星享V6E');
    });

    it('falls back to the derived product name when neither is set', () => {
        const src = source(meta({ 'a.json': {} }));
        expect(resolveAssetDisplayName({ fileName: 'a.json', productName: '长名' }, src)).toBe('长名');
    });

    it('falls back to the file base name when productName is empty', () => {
        const src = source(meta({}));
        expect(resolveAssetDisplayName({ fileName: 'V6E.json', productName: '' }, src)).toBe('V6E');
    });

    it('treats a blank alias as unset and does not shadow the fallbacks', () => {
        const src = source(meta({ 'a.json': { alias: '  ', groupName: '组名' } }));
        expect(resolveAssetDisplayName({ fileName: 'a.json', productName: '长名' }, src)).toBe('组名');
    });
});

describe('assetAlias · parseCapacityKwh', () => {
    it('extracts the leading number from noisy raw values', () => {
        expect(parseCapacityKwh('50.23')).toBe('50.23');
        expect(parseCapacityKwh('50.23kWh')).toBe('50.23');
        expect(parseCapacityKwh('储能装置 41.86 度')).toBe('41.86');
        expect(parseCapacityKwh('66.67/66.67')).toBe('66.67');
    });

    it('returns null when no number is present', () => {
        expect(parseCapacityKwh('')).toBeNull();
        expect(parseCapacityKwh(null)).toBeNull();
        expect(parseCapacityKwh(undefined)).toBeNull();
        expect(parseCapacityKwh('未知')).toBeNull();
    });
});

describe('assetAlias · suggestAssetAlias', () => {
    it('derives 车型组 + 电量 from parsed facets', () => {
        expect(suggestAssetAlias('V8E', '50.23')).toBe('V8E 50.23');
    });

    it('returns null when the group name is missing', () => {
        expect(suggestAssetAlias('', '50.23')).toBeNull();
        expect(suggestAssetAlias('   ', '50.23')).toBeNull();
    });

    it('returns null when the capacity is missing or unparsable', () => {
        expect(suggestAssetAlias('V8E', null)).toBeNull();
        expect(suggestAssetAlias('V8E', '未知')).toBeNull();
    });

    it('returns null when the suggestion would exceed the max length', () => {
        expect(suggestAssetAlias('一个非常非常非常长的车型组名称', '50.23', 10)).toBeNull();
    });
});

describe('assetAlias · buildAliasSuggestions (批量建议)', () => {
    const infos = [
        { fileName: 'v8e-a.json', productName: 'V8E 宁德时代… 50.23 DNC…', capacityRaw: '50.23' },
        { fileName: 'v8e-b.json', productName: 'V8E 宁德时代… 41.86 DNC…', capacityRaw: '41.86' },
        { fileName: 'v8e-c.json', productName: 'V8E 宁德时代… 无电量 DNC…', capacityRaw: null },
    ];
    const groupNameOf = () => 'V8E';

    it('marks derivable assets with a suggestion', () => {
        const out = buildAliasSuggestions(infos, groupNameOf, meta({}));
        expect(out.find(s => s.fileName === 'v8e-a.json')!.suggestedAlias).toBe('V8E 50.23');
        expect(out.find(s => s.fileName === 'v8e-a.json')!.derivable).toBe(true);
    });

    it('lists non-derivable assets with an empty suggestion, unchecked', () => {
        const out = buildAliasSuggestions(infos, groupNameOf, meta({}));
        const c = out.find(s => s.fileName === 'v8e-c.json')!;
        expect(c.suggestedAlias).toBe('');
        expect(c.derivable).toBe(false);
        expect(c.selected).toBe(false);
    });

    it('defaults derivable rows to selected so batch confirm is one click', () => {
        const out = buildAliasSuggestions(infos, groupNameOf, meta({}));
        expect(out.find(s => s.fileName === 'v8e-a.json')!.selected).toBe(true);
    });

    it('never overwrites an asset that already has an alias', () => {
        const out = buildAliasSuggestions(infos, groupNameOf, meta({ 'v8e-a.json': { alias: '已有别名' } }));
        const a = out.find(s => s.fileName === 'v8e-a.json')!;
        expect(a.suggestedAlias).toBe('已有别名');
        expect(a.selected).toBe(false);
        expect(a.derivable).toBe(false);
    });
});
