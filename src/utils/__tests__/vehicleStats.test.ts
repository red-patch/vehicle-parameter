import { describe, expect, it } from 'vitest';
import { buildVehicleStats } from '../vehicleStats';
import type { VehicleParameter } from '../../types';

const p = (id: string, group: string, name: string, value: string | undefined): VehicleParameter =>
    ({ id, group, name, value } as VehicleParameter);

describe('buildVehicleStats', () => {
    it('computes fill rate, empty count and group stats from params', () => {
        const stats = buildVehicleStats([
            p('1', '基础信息', '整备质量', '1000'),
            p('2', '基础信息', '轴距', ''),
            p('3', '基础信息', '车辆型号', 'DXA5030XXYBEV1'),
            p('4', '电池', '电芯品牌', undefined),
        ]);

        expect(stats.totalParams).toBe(4);
        expect(stats.filledParams).toBe(2);
        expect(stats.emptyParams).toBe(2);
        expect(stats.fillRate).toBe(50);
        // 分组按 total 降序（沿用旧抽屉口径）
        expect(stats.groups.map(g => g.name)).toEqual(['基础信息', '电池']);
        expect(stats.groups[0]).toMatchObject({ total: 3, filled: 2, pct: 67 });
        expect(stats.groups[1]).toMatchObject({ total: 1, filled: 0, pct: 0 });
    });

    it('falls back to scan counts when params are empty', () => {
        const stats = buildVehicleStats([], { totalParams: 300, filledParams: 240 });
        expect(stats.totalParams).toBe(300);
        expect(stats.filledParams).toBe(240);
        expect(stats.fillRate).toBe(80);
        expect(stats.groups).toEqual([]);
    });

    it('collects required-missing params by required field registry', () => {
        const stats = buildVehicleStats([
            p('1', '电池', '动力电池包电量（kWh）', ''),
            p('2', '基础信息', '车辆型号', 'DXA5030XXYBEV1'),
        ]);
        // 「动力电池包电量（kWh）」是必填字段且值为空 → 进缺失清单；「车辆型号」已填 → 不进
        const missingNames = stats.requiredMissing.map(param => param.name);
        expect(missingNames).toContain('动力电池包电量（kWh）');
        expect(missingNames).not.toContain('车辆型号');
    });

    it('handles all-empty params without dividing by zero', () => {
        const stats = buildVehicleStats([p('1', '基础信息', '整备质量', '')]);
        expect(stats.fillRate).toBe(0);
        expect(stats.emptyParams).toBe(1);
    });
});
