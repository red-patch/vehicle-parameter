import { describe, expect, it } from 'vitest';
import { buildAnomalyChips, buildDictHint, summarizePurifyAnomalies } from '../purifyAnomaly';

const row = (isNameStandard: boolean, isEnumMismatch = false) => ({ isNameStandard, isEnumMismatch });

describe('数据体检异常汇总', () => {
    it('词表为空：不判字段名，chip 为不可点的「未配置词表」，并给出配置提示', () => {
        const s = summarizePurifyAnomalies([row(true), row(true)], 0);
        expect(s.dictReady).toBe(false);
        expect(buildAnomalyChips(s)).toEqual([{ value: 'anomaly', label: '未配置词表', disabled: true }]);
        expect(buildDictHint(s)).toContain('未配置字段词表');
    });

    it('无参数时不提示', () => {
        expect(buildDictHint(summarizePurifyAnomalies([], 0))).toBeNull();
    });

    it('两类异常分开计数；重叠行只计入 total 一次', () => {
        const s = summarizePurifyAnomalies([row(false), row(false, true), row(true, true), row(true)], 20);
        expect(s).toMatchObject({ nameCount: 2, valueCount: 2, total: 3 });
        expect(buildAnomalyChips(s)).toEqual([
            { value: 'name', label: '字段名不在词表', count: 2, tone: 'warning' },
            { value: 'value', label: '枚举值不合法', count: 2, tone: 'danger' },
        ]);
    });

    it('只有一类异常时只出一个 chip', () => {
        const s = summarizePurifyAnomalies([row(true, true), row(true)], 20);
        expect(buildAnomalyChips(s).map(c => c.value)).toEqual(['value']);
    });

    it('全部合规：「完全合规」', () => {
        const s = summarizePurifyAnomalies([row(true), row(true)], 20);
        expect(buildAnomalyChips(s)).toEqual([{ value: 'anomaly', label: '完全合规' }]);
        expect(buildDictHint(s)).toBeNull();
    });

    it('真实数据回归：词表 6 个字段、503 个参数 501 个不在词表 → 判定覆盖不足并说明不是数据错', () => {
        const rows = [...Array.from({ length: 501 }, () => row(false)), row(true), row(true)];
        const s = summarizePurifyAnomalies(rows, 6);
        expect(s.lowCoverage).toBe(true);
        const hint = buildDictHint(s)!;
        expect(hint).toContain('词表仅收录 6 个字段');
        expect(hint).toContain('501/503');
        expect(hint).toContain('并非数据有误');
    });

    it('少数字段名不在词表：不算覆盖不足，不提示', () => {
        const rows = [...Array.from({ length: 3 }, () => row(false)), ...Array.from({ length: 17 }, () => row(true))];
        const s = summarizePurifyAnomalies(rows, 300);
        expect(s.lowCoverage).toBe(false);
        expect(buildDictHint(s)).toBeNull();
    });

    it('参数很少时不做覆盖率判断（样本太小）', () => {
        const s = summarizePurifyAnomalies([row(false), row(false), row(true)], 5);
        expect(s.lowCoverage).toBe(false);
    });
});
