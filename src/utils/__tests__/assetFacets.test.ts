import { describe, it, expect } from 'vitest';
import {
    DEFAULT_FACET_VOCAB,
    resolveByAlias,
    collectUnmappedValues,
    resolveAssetFacets,
    normalizeCapacity,
    normalizeAdmissionLevel,
    setGroupFacetValue,
    setAssetFacetOverride,
    addVocabValue,
    EMPTY_FACET_VALUES,
    type FacetValues,
} from '../assetFacets';

describe('resolveByAlias', () => {
    it('命中规范名/别名（忽略空白与大小写），返回规范名', () => {
        const entries = DEFAULT_FACET_VOCAB.manufacturer;
        expect(resolveByAlias(entries, '上汽大通汽车有限公司南京分公司')).toBe('上汽大通汽车有限公司');
        expect(resolveByAlias(entries, ' 上汽大通 ')).toBe('上汽大通汽车有限公司');
        expect(resolveByAlias(entries, '北汽福田')).toBe('北汽福田汽车股份有限公司');
    });

    it('词表外写法返回 null（进待归类，不猜测合并）', () => {
        expect(resolveByAlias(DEFAULT_FACET_VOCAB.manufacturer, 'Ample Forwarding Limited')).toBeNull();
        expect(resolveByAlias(DEFAULT_FACET_VOCAB.batteryBrand, '重创新航科技集团股份有限公司')).toBe('中创新航科技集团股份有限公司');
    });
});

describe('collectUnmappedValues', () => {
    it('收集词表外新写法', () => {
        const out = collectUnmappedValues(DEFAULT_FACET_VOCAB.batteryBrand, ['宁德时代', '某某电池', ' ', '某某电池']);
        expect(out).toEqual(['某某电池']);
    });
});

describe('normalizeCapacity（裁定①②）', () => {
    it('分号双值取首值', () => {
        expect(normalizeCapacity('100.07;120.27')).toBe(100.07);
    });
    it('剥离括号注记与 kWh 后缀', () => {
        expect(normalizeCapacity('15.456（1/3C）')).toBe(15.456);
        expect(normalizeCapacity('50kWh')).toBe(50);
    });
    it('解析失败返回 null', () => {
        expect(normalizeCapacity('CB320')).toBeNull();
        expect(normalizeCapacity(null)).toBeNull();
    });
});

describe('normalizeAdmissionLevel（裁定④）', () => {
    it('ASCII VI 修正为 Ⅳ', () => {
        expect(normalizeAdmissionLevel('VI')).toBe('Ⅳ');
    });
    it('其余原样', () => {
        expect(normalizeAdmissionLevel('Ⅲ1')).toBe('Ⅲ1');
        expect(normalizeAdmissionLevel('')).toBeNull();
    });
});

describe('resolveAssetFacets 优先级', () => {
    const base = {
        fileName: 'a.json',
        groupKey: 'V6E',
        info: { announceNos: ['AAA111'], vehicleModel: null as string | null },
        values: EMPTY_FACET_VALUES,
        vocab: DEFAULT_FACET_VOCAB,
    };

    it('人工修正 > 派生 > 组级 > 标签', () => {
        const values: FacetValues = {
            groupLevel: { V6E: { manufacturer: '上汽大通汽车有限公司', vehicleFamily: '大面' } },
            assetLevel: { 'a.json': { manufacturer: '北汽福田汽车股份有限公司' } },
        };
        const r = resolveAssetFacets({
            ...base,
            values,
            info: { ...base.info, manufacturerRaw: '陕西汽车集团股份有限公司' },
            tags: ['金旅'],
        });
        expect(r.manufacturer).toBe('北汽福田汽车股份有限公司'); // override 赢
        expect(r.vehicleFamily).toBe('大面'); // 组级
    });

    it('无修正时派生赢组级；派生缺省回落标签', () => {
        const values: FacetValues = { groupLevel: { V6E: { manufacturer: '上汽大通汽车有限公司' } }, assetLevel: {} };
        const derived = resolveAssetFacets({ ...base, values, info: { ...base.info, manufacturerRaw: '陕汽' } });
        expect(derived.manufacturer).toBe('陕西汽车集团股份有限公司');

        const fromTag = resolveAssetFacets({ ...base, values: EMPTY_FACET_VALUES, info: base.info, tags: ['金旅'] });
        expect(fromTag.manufacturer).toBe('厦门金龙旅行车有限公司');
    });

    it('公告号含车辆型号；override 可整体替换', () => {
        const r = resolveAssetFacets({ ...base, info: { announceNos: ['AAA111'], vehicleModel: 'BBB222' } });
        expect(r.announceNos).toEqual(['BBB222', 'AAA111']);
        const o = resolveAssetFacets({
            ...base,
            values: { groupLevel: {}, assetLevel: { 'a.json': { announceNos: ['CCC333'] } } },
        });
        expect(o.announceNos).toEqual(['CCC333']);
    });
});

describe('addVocabValue（就地收词）', () => {
    it('词表外新族群直接收进词表', () => {
        const r = addVocabValue(DEFAULT_FACET_VOCAB, 'vehicleFamily', '重卡');
        expect(r.value).toBe('重卡');
        expect(r.vocab.vehicleFamily).toContain('重卡');
        expect(DEFAULT_FACET_VOCAB.vehicleFamily).not.toContain('重卡'); // 原词表不被修改
    });

    it('别名命中返回既有规范值，不产生重复条目', () => {
        const r = addVocabValue(DEFAULT_FACET_VOCAB, 'manufacturer', '上汽大通');
        expect(r.value).toBe('上汽大通汽车有限公司');
        expect(r.vocab).toBe(DEFAULT_FACET_VOCAB);
    });

    it('新主机厂新增条目（group 同名起步）', () => {
        const r = addVocabValue(DEFAULT_FACET_VOCAB, 'manufacturer', ' 重卡 ');
        expect(r.value).toBe('重卡');
        expect(r.vocab.manufacturer.some(e => e.name === '重卡')).toBe(true);
    });

    it('空值不收', () => {
        const r = addVocabValue(DEFAULT_FACET_VOCAB, 'batteryBrand', '   ');
        expect(r.vocab).toBe(DEFAULT_FACET_VOCAB);
        expect(r.value).toBe('');
    });
});

describe('setGroupFacetValue / setAssetFacetOverride', () => {
    it('写入、合并、空值清除', () => {
        let v = setGroupFacetValue(EMPTY_FACET_VALUES, 'V6E', { manufacturer: '新石器', vehicleFamily: '无人车' });
        expect(v.groupLevel.V6E).toEqual({ manufacturer: '新石器', vehicleFamily: '无人车' });
        v = setGroupFacetValue(v, 'V6E', { vehicleFamily: '' });
        expect(v.groupLevel.V6E).toEqual({ manufacturer: '新石器' });
        v = setGroupFacetValue(v, 'V6E', { manufacturer: undefined });
        expect(v.groupLevel.V6E).toBeUndefined();
    });

    it('资产级覆盖同语义', () => {
        let v = setAssetFacetOverride(EMPTY_FACET_VALUES, 'a.json', { capacityKwh: 38.64 });
        expect(v.assetLevel['a.json']).toEqual({ capacityKwh: 38.64 });
        v = setAssetFacetOverride(v, 'a.json', { capacityKwh: undefined as unknown as number });
        expect(v.assetLevel['a.json']).toBeUndefined();
    });
});
