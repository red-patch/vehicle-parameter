import { describe, expect, it } from 'vitest';
import {
    composeRuleValue,
    createDefaultBidScheme,
    defaultTemplateFor,
    moveRuleToFront,
    normalizeBidMappingsConfig,
    renderCombineTemplate,
    resolveRuleSources,
} from '../bidFieldMapping';
import type { VehicleParameter } from '../../types';

const makeParam = (name: string, value: string | number): VehicleParameter => ({
    id: name,
    group: 'default',
    name,
    value,
});

describe('renderCombineTemplate', () => {
    it('replaces placeholders with source values', () => {
        expect(renderCombineTemplate('{0}×{1}×{2}', ['5495', '1830', '1980'])).toBe('5495×1830×1980');
    });

    it('keeps literal text around placeholders', () => {
        expect(renderCombineTemplate('{0}×{1}×{2} mm', ['1', '2', '3'])).toBe('1×2×3 mm');
    });

    it('renders missing or empty values as ? placeholders', () => {
        expect(renderCombineTemplate('{0}×{1}', ['5495', undefined])).toBe('5495×?');
        expect(renderCombineTemplate('{0}×{1}', ['5495', '  '])).toBe('5495×?');
    });

    it('renders out-of-range placeholders as ?', () => {
        expect(renderCombineTemplate('{0}/{5}', ['a'])).toBe('a/?');
    });

    it('passes through templates without placeholders', () => {
        expect(renderCombineTemplate('以公告为准', ['a', 'b'])).toBe('以公告为准');
    });
});

describe('defaultTemplateFor', () => {
    it('joins placeholders with ×', () => {
        expect(defaultTemplateFor(3)).toBe('{0}×{1}×{2}');
    });
});

describe('composeRuleValue', () => {
    const resolutions = (values: (string | number | undefined)[]) =>
        values.map((value) => ({
            source: 'x',
            status: 'auto' as const,
            resolvedName: 'x',
            value,
        }));

    it('returns the raw value for a single source', () => {
        const rule = { id: 'r1', target: '电池品牌', sources: ['动力电池包厂商'] };
        const result = composeRuleValue(rule, resolutions(['宁德时代']));
        expect(result).toEqual({ text: '宁德时代', ready: true, missingCount: 0 });
    });

    it('returns empty text when the single source has no value', () => {
        const rule = { id: 'r1', target: '电池品牌', sources: ['动力电池包厂商'] };
        const result = composeRuleValue(rule, resolutions([undefined]));
        expect(result).toEqual({ text: '', ready: false, missingCount: 1 });
    });

    it('composes multiple sources with the configured template', () => {
        const rule = {
            id: 'r1',
            target: '外扩尺寸',
            sources: ['外形尺寸长', '外形尺寸宽', '外形尺寸高'],
            template: '{0}×{1}×{2}',
        };
        const result = composeRuleValue(rule, resolutions(['5495', '1830', '1980']));
        expect(result).toEqual({ text: '5495×1830×1980', ready: true, missingCount: 0 });
    });

    it('falls back to the default × template when template is empty', () => {
        const rule = { id: 'r1', target: '外扩尺寸', sources: ['长', '宽', '高'] };
        const result = composeRuleValue(rule, resolutions(['1', '2', '3']));
        expect(result.text).toBe('1×2×3');
        expect(result.ready).toBe(true);
    });

    it('marks partial results with ? placeholders', () => {
        const rule = {
            id: 'r1',
            target: '外扩尺寸',
            sources: ['长', '宽', '高'],
            template: '{0}×{1}×{2}',
        };
        const result = composeRuleValue(rule, resolutions(['5495', undefined, '1980']));
        expect(result).toEqual({ text: '5495×?×1980', ready: false, missingCount: 1 });
    });

    it('treats unbound rules (no sources) as not ready with empty text', () => {
        const rule = { id: 'r1', target: '充电能力', sources: [] };
        const result = composeRuleValue(rule, []);
        expect(result).toEqual({ text: '', ready: false, missingCount: 0 });
    });
});

describe('resolveRuleSources', () => {
    it('auto-resolves exact and normalized matches', () => {
        const candidates = [makeParam('电机额定功率（kW）', 60)];
        const rule = { id: 'r1', target: '电机额定功率(kw)', sources: ['电机额定功率（kW）'] };
        const exact = resolveRuleSources(rule, candidates);
        expect(exact[0].status).toBe('auto');
        expect(exact[0].value).toBe(60);

        const normalized = resolveRuleSources(
            { id: 'r2', target: 'x', sources: ['电机额定功率(kW)'] },
            candidates
        );
        expect(normalized[0].status).toBe('auto');
        expect(normalized[0].matchType).toBe('normalized');
    });

    it('auto-resolves across naming variants via the alias dictionary', () => {
        const candidates = [makeParam('外廓长度（mm）', 5495)];
        const rule = { id: 'r1', target: '外扩尺寸', sources: ['外形尺寸长'] };
        const [resolution] = resolveRuleSources(rule, candidates);
        expect(resolution.status).toBe('auto');
        expect(resolution.matchType).toBe('alias');
        expect(resolution.resolvedName).toBe('外廓长度（mm）');
        expect(resolution.value).toBe(5495);
    });

    it('keeps fuzzy matches unresolved with alternatives for manual picking', () => {
        const candidates = [makeParam('Battery1234', 'ok')];
        const rule = { id: 'r1', target: 'x', sources: ['Battery123'] };
        const [resolution] = resolveRuleSources(rule, candidates);
        expect(resolution.status).toBe('fuzzy');
        expect(resolution.value).toBeUndefined();
    });

    it('reports missing when nothing matches', () => {
        const candidates = [makeParam('驱动电机数量', 2)];
        const rule = { id: 'r1', target: 'x', sources: ['三电质保承诺'] };
        const [resolution] = resolveRuleSources(rule, candidates);
        expect(resolution.status).toBe('missing');
    });

    it('prefers session picks over automatic matching', () => {
        const candidates = [makeParam('整备质量', 1800), makeParam('总质量', 3500)];
        const rule = { id: 'r1', target: '车辆重量（kg）', sources: ['整备质量'] };
        const [resolution] = resolveRuleSources(rule, candidates, {
            0: { name: '总质量', value: 3500 },
        });
        expect(resolution.status).toBe('picked');
        expect(resolution.resolvedName).toBe('总质量');
        expect(resolution.value).toBe(3500);
    });
});

describe('normalizeBidMappingsConfig', () => {
    it('returns null for empty or malformed configs', () => {
        expect(normalizeBidMappingsConfig(null)).toBeNull();
        expect(normalizeBidMappingsConfig({ schemes: [] })).toBeNull();
        expect(normalizeBidMappingsConfig({ schemes: [{ name: ' ' }] })).toBeNull();
    });

    it('normalizes schemes: trims, dedups sources, fills missing ids, keeps unbound rules', () => {
        const schemes = normalizeBidMappingsConfig({
            schemes: [
                {
                    name: ' 物流车投标 ',
                    rules: [
                        { target: ' 外扩尺寸 ', sources: [' 长 ', '宽', '长'], template: ' {0}×{1}×{2} ' },
                        { target: '电池品牌', sources: [] },
                        { target: '', sources: ['x'] },
                    ],
                },
            ],
        });
        expect(schemes).not.toBeNull();
        expect(schemes).toHaveLength(1);
        const scheme = schemes![0];
        expect(scheme.name).toBe('物流车投标');
        expect(scheme.id).toBeTruthy();
        expect(scheme.rules).toHaveLength(2);
        expect(scheme.rules[0].target).toBe('外扩尺寸');
        expect(scheme.rules[0].sources).toEqual(['长', '宽']);
        expect(scheme.rules[0].template).toBe('{0}×{1}×{2}');
        expect(scheme.rules[1].sources).toEqual([]);
    });
});

describe('moveRuleToFront', () => {
    const rules = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    it('moves a middle rule to the front, keeping the rest in order', () => {
        expect(moveRuleToFront(rules, 'b').map((r) => r.id)).toEqual(['b', 'a', 'c']);
    });

    it('moves the last rule to the front', () => {
        expect(moveRuleToFront(rules, 'c').map((r) => r.id)).toEqual(['c', 'a', 'b']);
    });

    it('returns the same reference when the rule is already first', () => {
        expect(moveRuleToFront(rules, 'a')).toBe(rules);
    });

    it('returns the same reference when the id is unknown', () => {
        expect(moveRuleToFront(rules, 'nope')).toBe(rules);
    });

    it('handles an empty list', () => {
        const empty: { id: string }[] = [];
        expect(moveRuleToFront(empty, 'a')).toBe(empty);
    });

    it('does not mutate the input array', () => {
        const input = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
        moveRuleToFront(input, 'c');
        expect(input.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('keeps rule objects (sources/template) attached to their position', () => {
        const scheme = createDefaultBidScheme();
        const moved = moveRuleToFront(scheme.rules, scheme.rules[4].id);
        expect(moved[0].target).toBe('电机额定功率(kw)');
        expect(moved[1].target).toBe('外扩尺寸');
        expect(moved[1].sources).toEqual(['外形尺寸长', '外形尺寸宽', '外形尺寸高']);
    });
});

describe('createDefaultBidScheme', () => {
    it('ships the 13 bidding targets with stable ids', () => {
        const scheme = createDefaultBidScheme();
        expect(scheme.name).toBe('常用投标字段');
        expect(scheme.rules).toHaveLength(13);
        expect(scheme.rules.map((r) => r.target)).toEqual([
            '外扩尺寸',
            '车辆重量（kg）',
            '载质量',
            '容积（方）',
            '电机额定功率(kw)',
            '电机峰值功率(kw)',
            '续航里程(km)实测',
            '续航里程(km)工况',
            '电池品牌',
            '电池容量(kwh)',
            '电池能量密度(wh/kg)',
            '充电能力',
            '三电质保',
        ]);
        const dims = scheme.rules[0];
        expect(dims.sources).toEqual(['外形尺寸长', '外形尺寸宽', '外形尺寸高']);
        expect(dims.template).toBe('{0}×{1}×{2}');
    });
});
