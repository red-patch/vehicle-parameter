import { describe, expect, it } from 'vitest';
import type { VehicleParameter } from '../../types';
import type { ResolvedFacets } from '../assetFacets';
import {
    applyParamFieldEdit,
    buildFacetBatchPatch,
    buildFieldEditPlan,
    isEmptyFieldValue,
    isSameFieldValue,
    isWritableTarget,
    readFieldValue,
    type FieldEditSourceRow,
    type FieldTarget,
} from '../assetFieldEdit';

const NOW = '2026-10-13T10:00:00.000Z';

const p = (name: string, value: string | number, group = '整车参数'): VehicleParameter =>
    ({ id: `${group}::${name}`, group, name, value });

const row = (over: Partial<FieldEditSourceRow> & { fileName: string }): FieldEditSourceRow => ({
    productName: over.fileName.replace(/\.json$/, ''),
    isLatest: true,
    params: [],
    ...over,
});

const facets = (over: Partial<ResolvedFacets> = {}): ResolvedFacets => ({
    manufacturer: null,
    vehicleFamily: null,
    batteryBrand: null,
    capacityKwh: null,
    admissionLevel: null,
    announceNos: [],
    ...over,
});

const PARAM: FieldTarget = { layer: 'param', name: '整备质量', group: '质量参数' };

describe('空值/等值判定', () => {
    it('null/undefined/纯空白算空', () => {
        expect(isEmptyFieldValue(null)).toBe(true);
        expect(isEmptyFieldValue(undefined)).toBe(true);
        expect(isEmptyFieldValue('   ')).toBe(true);
        expect(isEmptyFieldValue('')).toBe(true);
        expect(isEmptyFieldValue(0)).toBe(false);
        expect(isEmptyFieldValue('x')).toBe(false);
    });

    it('按去空白字符串比较（12 与 "12" 等同）', () => {
        expect(isSameFieldValue(12, '12')).toBe(true);
        expect(isSameFieldValue(' 上汽大通 ', '上汽大通')).toBe(true);
        expect(isSameFieldValue('上海大通', '上汽大通')).toBe(false);
    });
});

describe('readFieldValue', () => {
    it('参数层取首个命中行的值，并报告命中行数', () => {
        const r = row({ fileName: 'a.json', params: [p('整备质量', '1990'), p('整备质量', '2000'), p('轴距', '3000')] });
        expect(readFieldValue(r, PARAM)).toEqual({ value: '1990', hitCount: 2 });
    });

    it('参数层无命中时值为 null、hitCount 为 0', () => {
        const r = row({ fileName: 'a.json', params: [p('轴距', '3000')] });
        expect(readFieldValue(r, PARAM)).toEqual({ value: null, hitCount: 0 });
    });

    it('facet 层读解析值', () => {
        const r = row({ fileName: 'a.json', facets: facets({ manufacturer: '上汽大通' }) });
        expect(readFieldValue(r, { layer: 'facet', dim: 'manufacturer' })).toEqual({ value: '上汽大通', hitCount: 1 });
        expect(readFieldValue(r, { layer: 'facet', dim: 'batteryBrand' })).toEqual({ value: null, hitCount: 1 });
    });
});

describe('buildFieldEditPlan', () => {
    const rows: FieldEditSourceRow[] = [
        row({ fileName: 'v6e-empty.json', params: [] }),
        row({ fileName: 'v6e-same.json', params: [p('整备质量', '1990')] }),
        row({ fileName: 'v6e-diff.json', isLatest: false, params: [p('整备质量', '1980')] }),
    ];

    it('未填新值时所有行 verdict 为 null（尚无计划）', () => {
        const plan = buildFieldEditPlan(rows, PARAM, null);
        expect(plan.map(r => r.verdict)).toEqual([null, null, null]);
    });

    it('空值行判 fill、缺字段行判 addRow、一致行判 same、不同行判 overwrite', () => {
        const plan = buildFieldEditPlan(rows, PARAM, '1990');
        expect(plan.map(r => [r.fileName, r.verdict])).toEqual([
            ['v6e-empty.json', 'addRow'],   // 参数层根本没有该字段 → 新增行
            ['v6e-same.json', 'same'],
            ['v6e-diff.json', 'overwrite'],
        ]);
    });

    it('已存在但值为空的字段判 fill（不是 addRow）', () => {
        const withEmpty = [row({ fileName: 'a.json', params: [p('整备质量', '')] })];
        expect(buildFieldEditPlan(withEmpty, PARAM, '1990')[0].verdict).toBe('fill');
    });

    it('facet 目标值相同判 same、不同判 overwrite、空判 fill', () => {
        const frows = [
            row({ fileName: 'a.json', facets: facets({ manufacturer: '上汽大通' }) }),
            row({ fileName: 'b.json', facets: facets({ manufacturer: '上海大通' }) }),
            row({ fileName: 'c.json', facets: facets({ manufacturer: null }) }),
        ];
        const plan = buildFieldEditPlan(frows, { layer: 'facet', dim: 'manufacturer' }, '上汽大通');
        expect(plan.map(r => r.verdict)).toEqual(['same', 'overwrite', 'fill']);
    });

    it('facet 维度不存在 addRow 概念（永远命中该维度）', () => {
        const frows = [row({ fileName: 'a.json', facets: facets({ batteryBrand: null }) })];
        expect(buildFieldEditPlan(frows, { layer: 'facet', dim: 'batteryBrand' }, '宁德时代')[0].verdict).toBe('fill');
    });

    it('保留 isLatest 与命中行数，供预览表展示', () => {
        const r = [row({ fileName: 'a.json', isLatest: false, params: [p('整备质量', '1'), p('整备质量', '2')] })];
        const plan = buildFieldEditPlan(r, PARAM, '1990');
        expect(plan[0].isLatest).toBe(false);
        expect(plan[0].hitCount).toBe(2);
    });
});

describe('applyParamFieldEdit', () => {
    it('命中则改 value 与 updatedAt，保留 id/group/rowCheck', () => {
        const params: VehicleParameter[] = [{ ...p('整备质量', '1980'), rowCheck: '是' }];
        const next = applyParamFieldEdit(params, { layer: 'param', name: '整备质量' }, '1990', NOW);
        expect(next).not.toBe(params);
        expect(next[0]).toMatchObject({ id: '整车参数::整备质量', group: '整车参数', name: '整备质量', value: '1990', rowCheck: '是', updatedAt: NOW });
    });

    it('同名多行全部更新', () => {
        const params = [p('整备质量', '1980'), p('轴距', '3000'), p('整备质量', '1981')];
        const next = applyParamFieldEdit(params, { layer: 'param', name: '整备质量' }, '1990', NOW);
        expect(next.filter(x => x.name === '整备质量').map(x => x.value)).toEqual(['1990', '1990']);
        expect(next.find(x => x.name === '轴距')!.value).toBe('3000');
    });

    it('未命中则新增一行，用目标 group，id 为 group::name', () => {
        const params = [p('轴距', '3000')];
        const next = applyParamFieldEdit(params, { layer: 'param', name: '整备质量', group: '质量参数' }, '1990', NOW);
        expect(next).toHaveLength(2);
        expect(next[1]).toEqual({ id: '质量参数::整备质量', group: '质量参数', name: '整备质量', value: '1990', updatedAt: NOW });
    });

    it('新增行无 group 时回落默认分组', () => {
        const next = applyParamFieldEdit([], { layer: 'param', name: '整备质量' }, '1990', NOW);
        expect(next[0].group).toBe('批量维护');
    });

    it('全部 same 时返回原引用（调用方可据此跳过写盘）', () => {
        const params = [p('整备质量', '1990')];
        expect(applyParamFieldEdit(params, { layer: 'param', name: '整备质量' }, '1990', NOW)).toBe(params);
    });

    it('不修改入参数组', () => {
        const params = [p('整备质量', '1980')];
        applyParamFieldEdit(params, { layer: 'param', name: '整备质量' }, '1990', NOW);
        expect(params[0].value).toBe('1980');
    });
});

describe('buildFacetBatchPatch / isWritableTarget', () => {
    it('生成单维度覆盖 patch', () => {
        expect(buildFacetBatchPatch('capacityKwh', 50.5)).toEqual({ capacityKwh: 50.5 });
    });

    it('字段名非空、维度合法才算可写', () => {
        expect(isWritableTarget({ layer: 'param', name: '整备质量' })).toBe(true);
        expect(isWritableTarget({ layer: 'param', name: '  ' })).toBe(false);
        expect(isWritableTarget({ layer: 'facet', dim: 'manufacturer' })).toBe(true);
        expect(isWritableTarget(null)).toBe(false);
    });
});
