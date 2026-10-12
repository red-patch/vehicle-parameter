import { describe, expect, it } from 'vitest';
import { findBestMatch } from '../matchingEngine';
import type { VehicleParameter } from '../../types';

const p = (name: string, group = '基础信息'): VehicleParameter => ({
    id: `${group}-${name}`,
    group,
    name,
    value: '1',
});

// 每个用例必须用独立数组：Fuse 索引按数组身份缓存，共享数组会让前一个用例
// 的阈值污染后一个用例，从而掩盖缺陷（这正是本缺陷难被察觉的原因）。
const makeCandidates = (): VehicleParameter[] => [p('车辆厂'), p('轴距'), p('整备质量'), p('车辆')];

// Fuse 的 threshold 参与 Bitap 搜索的早期剪枝，不只是事后过滤；而 findBestMatch
// 在 fuse 之后还有一道按调用方阈值复检。因此只有「先窄后宽」才会暴露缓存缺陷——
// 先建索引的窄阈值已把候选剪掉，复检无从施展。
describe('findBestMatch 阈值缓存', () => {
    it('先窄后宽：窄阈值建索引后，宽阈值仍须命中', () => {
        const candidates = makeCandidates();

        const narrow = findBestMatch('轴距长', candidates, 0.3);
        expect(narrow.matchType).toBe('none');

        // 0.3333 落在 (0.3, 0.4]，正确实现应命中；若复用窄阈值索引则会被剪掉
        const wide = findBestMatch('轴距长', candidates, 0.4);
        expect(wide.matchType).toBe('fuzzy');
        expect(wide.matchedParam?.name).toBe('轴距');
    });

    it('同一数组上两个阈值互不干扰', () => {
        const candidates = makeCandidates();
        expect(findBestMatch('车辆长', candidates, 0.3).matchType).toBe('none');
        expect(findBestMatch('车辆长', candidates, 0.4).matchType).toBe('fuzzy');
        // 再次用窄阈值，仍须无匹配
        expect(findBestMatch('车辆长', candidates, 0.3).matchType).toBe('none');
    });

    it('精确匹配与规范化匹配不受阈值影响', () => {
        const candidates = makeCandidates();
        const exact = findBestMatch('轴距', candidates, 0.3);
        expect(exact.matchType).toBe('exact');
        expect(exact.score).toBe(0);
    });
});
