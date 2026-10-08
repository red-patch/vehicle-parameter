import { describe, it, expect } from 'vitest';
import type { ResolvedFacets } from '../assetFacets';
import {
    FACET_NONE,
    EMPTY_FACET_SELECTION,
    matchFacets,
    filterByFacets,
    countFacetValues,
    countCapacity,
    toggleFacetValue,
    isFacetSelectionActive,
    type FacetSelection,
} from '../facetFilters';

const facets = (over: Partial<ResolvedFacets> = {}): ResolvedFacets => ({
    manufacturer: '上汽大通汽车有限公司',
    vehicleFamily: '大面',
    batteryBrand: '宁德时代新能源科技股份有限公司',
    capacityKwh: 38.64,
    admissionLevel: 'Ⅱ',
    announceNos: ['AAA111'],
    ...over,
});

const item = (over: Partial<ResolvedFacets> = {}) => ({ facets: facets(over) });

describe('matchFacets（维度内 OR、维度间 AND）', () => {
    it('空选择全过', () => {
        expect(matchFacets(facets(), EMPTY_FACET_SELECTION)).toBe(true);
    });

    it('维度内 OR', () => {
        const sel: FacetSelection = { ...EMPTY_FACET_SELECTION, manufacturers: ['北汽福田汽车股份有限公司', '上汽大通汽车有限公司'] };
        expect(matchFacets(facets(), sel)).toBe(true);
    });

    it('维度间 AND', () => {
        const sel: FacetSelection = {
            ...EMPTY_FACET_SELECTION,
            manufacturers: ['上汽大通汽车有限公司'],
            families: ['小卡'],
        };
        expect(matchFacets(facets(), sel)).toBe(false);
    });

    it('「(无)」匹配缺值，缺值默认不被过滤', () => {
        const noneFacets = facets({ manufacturer: null, announceNos: [] });
        // 默认（未勾选）不被过滤
        expect(matchFacets(noneFacets, EMPTY_FACET_SELECTION)).toBe(true);
        // 勾具体值后缺值被收敛掉
        expect(matchFacets(noneFacets, { ...EMPTY_FACET_SELECTION, manufacturers: ['上汽大通汽车有限公司'] })).toBe(false);
        // 勾「(无)」= 只看缺值
        expect(matchFacets(noneFacets, { ...EMPTY_FACET_SELECTION, manufacturers: [FACET_NONE] })).toBe(true);
        expect(matchFacets(facets(), { ...EMPTY_FACET_SELECTION, manufacturers: [FACET_NONE] })).toBe(false);
    });

    it('公告号多值任一命中；全缺值看「(无)」', () => {
        expect(matchFacets(facets({ announceNos: ['X', 'AAA111'] }), { ...EMPTY_FACET_SELECTION, announceNos: ['AAA111'] })).toBe(true);
        expect(matchFacets(facets({ announceNos: [] }), { ...EMPTY_FACET_SELECTION, announceNos: ['AAA111'] })).toBe(false);
        expect(matchFacets(facets({ announceNos: [] }), { ...EMPTY_FACET_SELECTION, announceNos: [FACET_NONE] })).toBe(true);
    });

    it('电量区间', () => {
        expect(matchFacets(facets({ capacityKwh: 50 }), { ...EMPTY_FACET_SELECTION, capacityMin: 40, capacityMax: 60 })).toBe(true);
        expect(matchFacets(facets({ capacityKwh: 30 }), { ...EMPTY_FACET_SELECTION, capacityMin: 40 })).toBe(false);
        expect(matchFacets(facets({ capacityKwh: null }), { ...EMPTY_FACET_SELECTION, capacityMin: 40 })).toBe(false);
        expect(matchFacets(facets({ capacityKwh: null }), { ...EMPTY_FACET_SELECTION, capacityNone: true })).toBe(true);
    });
});

describe('countFacetValues（非本列收敛，本列全量带计数）', () => {
    const items = [
        item({ manufacturer: '上汽大通汽车有限公司', vehicleFamily: '大面' }),
        item({ manufacturer: '北汽福田汽车股份有限公司', vehicleFamily: '大面' }),
        item({ manufacturer: null, vehicleFamily: '小卡' }),
    ];

    it('厂商列：勾了大面后只数大面内的', () => {
        const counts = countFacetValues(items, { ...EMPTY_FACET_SELECTION, families: ['大面'] }, 'manufacturer');
        expect(counts.get('上汽大通汽车有限公司')).toBe(1);
        expect(counts.get('北汽福田汽车股份有限公司')).toBe(1);
        expect(counts.get(FACET_NONE)).toBeUndefined();
    });

    it('本列自身选择不参与收敛（可改选）', () => {
        const sel: FacetSelection = { ...EMPTY_FACET_SELECTION, manufacturers: ['上汽大通汽车有限公司'] };
        const counts = countFacetValues(items, sel, 'manufacturer');
        expect(counts.get('北汽福田汽车股份有限公司')).toBe(1);
        expect(counts.size).toBe(3);
    });

    it('缺值计入「(无)」', () => {
        const counts = countFacetValues(items, EMPTY_FACET_SELECTION, 'manufacturer');
        expect(counts.get(FACET_NONE)).toBe(1);
    });
});

describe('countCapacity', () => {
    it('区间命中数与缺值数', () => {
        const items = [item({ capacityKwh: 38.64 }), item({ capacityKwh: 86.55 }), item({ capacityKwh: null })];
        const r = countCapacity(items, { ...EMPTY_FACET_SELECTION, capacityMin: 50, capacityMax: 100 });
        expect(r).toEqual({ inRange: 1, none: 1, total: 3 });
    });
});

describe('toggleFacetValue / isFacetSelectionActive', () => {
    it('增删与激活判定', () => {
        let sel = toggleFacetValue([], '大面');
        expect(sel).toEqual(['大面']);
        sel = toggleFacetValue(sel, '大面');
        expect(sel).toEqual([]);
        expect(isFacetSelectionActive(EMPTY_FACET_SELECTION)).toBe(false);
        expect(isFacetSelectionActive({ ...EMPTY_FACET_SELECTION, capacityNone: true })).toBe(true);
    });
});

describe('filterByFacets', () => {
    it('过滤条目', () => {
        const items = [item(), item({ vehicleFamily: '小卡' })];
        expect(filterByFacets(items, { ...EMPTY_FACET_SELECTION, families: ['大面'] }).length).toBe(1);
    });
});
