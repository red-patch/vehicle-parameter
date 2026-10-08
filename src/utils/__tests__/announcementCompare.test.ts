import { describe, expect, it } from 'vitest';
import { compareAssetWithAnnouncement, compareBatchParams } from '../announcementCompare';
import type { VehicleParameter } from '../../types';

const p = (name: string, value: string | number, group = '基础信息'): VehicleParameter => ({
    id: `${group}-${name}`,
    group,
    name,
    value,
});

describe('compareAssetWithAnnouncement', () => {
    it('pairs params by exact name and flags mismatches', () => {
        const result = compareAssetWithAnnouncement(
            [p('轴距', '3360'), p('整备质量', '2800'), p('电池容量', '55.23')],
            [p('轴距', '3360'), p('整备质量', '2795'), p('电池容量', '55.23')],
        );
        expect(result.comparedCount).toBe(3);
        expect(result.mismatchCount).toBe(1);
        const mismatch = result.rows.find(r => r.name === '整备质量');
        expect(mismatch).toMatchObject({ assetValue: '2800', announceValue: '2795', match: false });
        expect(result.rows.find(r => r.name === '轴距')?.match).toBe(true);
    });

    it('separates params only present on one side', () => {
        const result = compareAssetWithAnnouncement(
            [p('轴距', '3360'), p('驱动形式', '4x2')],
            [p('轴距', '3360'), p('准乘人数', '3')],
        );
        expect(result.onlyInAsset).toEqual([{ name: '驱动形式', value: '4x2' }]);
        expect(result.onlyInAnnounce).toEqual([{ name: '准乘人数', value: '3' }]);
        expect(result.comparedCount).toBe(1);
    });

    it('trims and collapses whitespace before pairing', () => {
        const result = compareAssetWithAnnouncement(
            [p('  轴  距 ', ' 3360 ')],
            [p('轴距', '3360')],
        );
        expect(result.comparedCount).toBe(1);
        expect(result.rows[0].match).toBe(true);
    });

    it('uses last-wins for duplicate names on one side', () => {
        const result = compareAssetWithAnnouncement(
            [p('轴距', '3300', '外观'), p('轴距', '3360', '底盘')],
            [p('轴距', '3360')],
        );
        expect(result.rows[0]).toMatchObject({ assetValue: '3360', match: true });
    });

    it('treats empty vs non-empty as mismatch', () => {
        const result = compareAssetWithAnnouncement(
            [p('轴距', '')],
            [p('轴距', '3360')],
        );
        expect(result.mismatchCount).toBe(1);
        expect(result.rows[0]).toMatchObject({ assetValue: '', announceValue: '3360', match: false });
    });

    it('handles empty inputs', () => {
        expect(compareAssetWithAnnouncement([], [])).toMatchObject({
            rows: [], onlyInAsset: [], onlyInAnnounce: [], comparedCount: 0, mismatchCount: 0,
        });
    });
});

describe('compareBatchParams（批次 vs 批次）', () => {
    it('new batch as baseline, changed values flagged', () => {
        const oldBatch = [p('整备质量', '1580'), p('轴距', '3100'), p('储能装置种类/生产企业', '宁德时代')];
        const newBatch = [p('整备质量', '1620'), p('轴距', '3100'), p('储能装置种类/生产企业', '比亚迪')];
        const r = compareBatchParams(oldBatch, newBatch);
        expect(r.rows).toHaveLength(3);
        expect(r.sameCount).toBe(1);
        expect(r.changedCount).toBe(2);
        expect(r.rows[0]).toMatchObject({ name: '整备质量', oldValue: '1580', newValue: '1620', changed: true });
        expect(r.rows[1]).toMatchObject({ name: '轴距', changed: false });
    });

    it('one-sided params are changes with empty other side', () => {
        const r = compareBatchParams(
            [p('旧配置', 'X')],
            [p('新配置', 'Y')],
        );
        expect(r.rows).toEqual([
            { name: '新配置', oldValue: '', newValue: 'Y', changed: true },
            { name: '旧配置', oldValue: 'X', newValue: '', changed: true },
        ]);
        expect(r.sameCount).toBe(0);
    });

    it('matches names ignoring inner whitespace, last-wins on duplicates', () => {
        const r = compareBatchParams(
            [p('储 能装置种类/生产企业', 'A'), p('其它', '1.驱动电机额定功率/峰值功率:35kW/70kW')],
            [p('储能装置种类/生产企业', 'B'), p('其它', '1.驱动电机额定功率/峰值功率:35kW/70kW')],
        );
        // 「其它」原文整格两侧相同 → 算一致；子项不在原始 params 里——归一由 readAnnouncementRecord 负责
        expect(r.rows.find(row => row.name === '驱动电机额定功率/峰值功率')).toBeUndefined();
        expect(r.sameCount).toBe(1);
        expect(r.changedCount).toBe(1);
    });

    it('empty inputs', () => {
        expect(compareBatchParams([], [])).toEqual({ rows: [], sameCount: 0, changedCount: 0 });
        expect(compareBatchParams([p('A', '1')], []).changedCount).toBe(1);
    });
});
