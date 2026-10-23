import { describe, expect, it } from 'vitest';
import { resolveRequiredBaseline } from '../requiredBaseline';
import type { FieldGroupConfigItem } from '../fieldLists';

const groups: FieldGroupConfigItem[] = [
    { id: 'g1', name: '准入模板', fields: ['车厢材质', '车辆型号', '冷厢品牌'], required: ['车厢材质', '冷厢品牌'] },
    { id: 'g2', name: '空必填组', fields: ['车辆型号'] },
];

describe('resolveRequiredBaseline', () => {
    it('未选字段组（null / all / 不存在的 id）时没有基准', () => {
        expect(resolveRequiredBaseline(groups, null)).toBeNull();
        expect(resolveRequiredBaseline(groups, undefined)).toBeNull();
        expect(resolveRequiredBaseline(groups, 'all')).toBeNull();
        expect(resolveRequiredBaseline(groups, '不存在的组')).toBeNull();
    });

    it('只把组内勾了必填的字段判为必填', () => {
        const baseline = resolveRequiredBaseline(groups, 'g1');
        expect(baseline?.groupName).toBe('准入模板');
        expect(baseline?.has('车厢材质')).toBe(true);
        expect(baseline?.has('冷厢品牌')).toBe(true);
        // 组里有、但没勾必填
        expect(baseline?.has('车辆型号')).toBe(false);
        // 组外字段
        expect(baseline?.has('尾板型号')).toBe(false);
    });

    it('组里没有 required 数组时等于没有必填字段（不是退回内置清单）', () => {
        expect(resolveRequiredBaseline(groups, 'g2')?.has('车辆型号')).toBe(false);
    });

    it('匹配忽略空白、全角括号与大小写', () => {
        const baseline = resolveRequiredBaseline(
            [{ id: 'g1', name: 'x', fields: [], required: ['动力电池包电量（kWh）', 'DST 尾标'] }],
            'g1',
        );
        expect(baseline?.has('动力电池包电量(kWh)')).toBe(true);
        expect(baseline?.has('dst尾标')).toBe(true);
        expect(baseline?.has('')).toBe(false);
        expect(baseline?.has(null)).toBe(false);
    });
});
