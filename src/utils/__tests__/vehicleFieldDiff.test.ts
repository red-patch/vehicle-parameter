import { describe, it, expect } from 'vitest';
import {
    normalizeFieldKey,
    buildReferenceIndex,
    matchReference,
    computeRowDiff,
    buildSyncPatch,
    diffCount,
} from '../vehicleFieldDiff';
import type { VehicleParameter } from '../../types';

const p = (over: Partial<VehicleParameter> & { id: string }): VehicleParameter => ({
    group: '',
    name: '',
    value: '',
    ...over,
});

describe('normalizeFieldKey', () => {
    it('去首尾空白', () => {
        expect(normalizeFieldKey('  倒车影像  ')).toBe('倒车影像');
    });

    it('全角括号与半角括号等价', () => {
        expect(normalizeFieldKey('前视行车记录仪（DVR）')).toBe(normalizeFieldKey('前视行车记录仪(DVR)'));
    });

    it('括号与内外部空白等价', () => {
        expect(normalizeFieldKey('前视行车记录仪 ( DVR )')).toBe(normalizeFieldKey('前视行车记录仪(DVR)'));
    });

    it('全角空格等价于半角空格并被移除', () => {
        expect(normalizeFieldKey('货厢容积　（m³）')).toBe(normalizeFieldKey('货厢容积(m³)'));
    });
});

describe('buildReferenceIndex / matchReference', () => {
    const ref = [
        p({ id: 'r1', name: '前视行车记录仪（DVR）', value: '标配（上海智驾）', group: '智能化配置' }),
        p({ id: 'r2', name: '货厢容积（m³）', value: '12.5', group: '货厢配置' }),
    ];
    const index = buildReferenceIndex(ref);

    it('精确名命中', () => {
        expect(matchReference(p({ id: 'a', name: '货厢容积（m³）' }), index)?.id).toBe('r2');
    });

    it('括号全半角差异仍命中（容错匹配）', () => {
        expect(matchReference(p({ id: 'a', name: '前视行车记录仪(DVR)' }), index)?.id).toBe('r1');
    });

    it('参考车型没有同名字段则不命中', () => {
        expect(matchReference(p({ id: 'a', name: '完全不相关的字段' }), index)).toBeNull();
    });

    it('精确名压过归一化名：字面命中时取字面那条', () => {
        const dup = buildReferenceIndex([
            p({ id: 'first', name: 'A（B）', value: '1' }),
            p({ id: 'second', name: 'A(B)', value: '2' }),
        ]);
        expect(matchReference(p({ id: 'x', name: 'A(B)' }), dup)?.id).toBe('second');
    });

    it('精确未命中时归一化索引同键冲突取先出现者', () => {
        const dup = buildReferenceIndex([
            p({ id: 'first', name: 'A（B）', value: '1' }),
            p({ id: 'second', name: 'A(B)', value: '2' }),
        ]);
        expect(matchReference(p({ id: 'x', name: 'A（ B ）' }), dup)?.id).toBe('first');
    });
});

describe('computeRowDiff', () => {
    const ref = p({ id: 'r1', name: '倒车影像', value: '标配', group: '智能化配置' });

    it('无参考值 → 非差异', () => {
        expect(computeRowDiff(p({ id: 'a', name: '倒车影像', value: '标配' }), null)).toBeNull();
    });

    it('参考值为空字符串 → 永不算差异（不覆盖参考车型也没填的字段）', () => {
        const emptyRef = p({ id: 'r1', name: '倒车影像', value: '', group: '智能化配置' });
        expect(computeRowDiff(p({ id: 'a', name: '倒车影像', value: '', group: '别的组' }), emptyRef)).toBeNull();
    });

    it('值不同 → 差异（valueDiffers）', () => {
        const d = computeRowDiff(p({ id: 'a', name: '倒车影像', value: '选装', group: '智能化配置' }), ref);
        expect(d?.valueDiffers).toBe(true);
        expect(d?.nameDiffers).toBe(false);
        expect(d?.groupDiffers).toBe(false);
    });

    it('当前值为空 → 差异', () => {
        const d = computeRowDiff(p({ id: 'a', name: '倒车影像', value: '', group: '智能化配置' }), ref);
        expect(d?.valueDiffers).toBe(true);
    });

    it('值相同但名字带空格 → 仅 nameDiffers', () => {
        const d = computeRowDiff(p({ id: 'a', name: '倒车影像 ', value: '标配', group: '智能化配置' }), ref);
        expect(d).not.toBeNull();
        expect(d?.valueDiffers).toBe(false);
        expect(d?.nameDiffers).toBe(true);
    });

    it('分组不同 → 仅 groupDiffers', () => {
        const d = computeRowDiff(p({ id: 'a', name: '倒车影像', value: '标配', group: '其他配置' }), ref);
        expect(d?.groupDiffers).toBe(true);
        expect(d?.valueDiffers).toBe(false);
        expect(d?.nameDiffers).toBe(false);
    });

    it('三项全同 → 非差异', () => {
        const d = computeRowDiff(p({ id: 'a', name: '倒车影像', value: '标配', group: '智能化配置' }), ref);
        expect(d).toBeNull();
    });
});

describe('buildSyncPatch', () => {
    const ref = p({ id: 'r1', name: '倒车影像', value: '标配（地上铁设备具备能力）', group: '智能化配置' });

    it('三字段齐全 + updatedAt', () => {
        const row = p({ id: 'a', name: '倒车影像 ', value: '', group: '新增参数' });
        const now = '10/15 14:30';
        expect(buildSyncPatch(row, ref, now)).toEqual({
            name: '倒车影像',
            value: '标配（地上铁设备具备能力）',
            group: '智能化配置',
            updatedAt: now,
        });
    });

    it('不改动 id', () => {
        const patch = buildSyncPatch(p({ id: 'a', name: 'x', value: '' }), ref, 'now');
        expect('id' in patch).toBe(false);
    });
});

describe('diffCount', () => {
    it('统计非空差异的行数', () => {
        const ref = p({ id: 'r1', name: '倒车影像', value: '标配', group: 'g' });
        const d1 = computeRowDiff(p({ id: 'a', name: '倒车影像', value: '', group: 'g' }), ref);
        const d2 = computeRowDiff(p({ id: 'b', name: '倒车影像', value: '标配', group: 'g' }), ref);
        const d3 = computeRowDiff(p({ id: 'c', name: '倒车影像', value: '标配', group: 'g' }), ref);
        expect(diffCount([d1, d2, d3])).toBe(1);
    });
});
