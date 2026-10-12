import { describe, expect, it } from 'vitest';
import { findUniqueMatch } from '../matchingEngine';
import type { VehicleParameter } from '../../types';

const p = (name: string, group = '基础信息'): VehicleParameter => ({
    id: `${group}-${name}`,
    group,
    name,
    value: '1',
});

describe('findUniqueMatch', () => {
    it('完全一致时返回该参数', () => {
        const candidates = [p('轴距'), p('整备质量')];
        expect(findUniqueMatch('轴距', candidates)?.name).toBe('轴距');
    });

    it('归一化后一致（单位/括号/空格差异）', () => {
        const candidates = [p('整备质量(kg)')];
        expect(findUniqueMatch('整备质量', candidates)?.name).toBe('整备质量(kg)');
        expect(findUniqueMatch(' 整 备 质 量 ', candidates)?.name).toBe('整备质量(kg)');
    });

    it('别名命中唯一候选', () => {
        const candidates = [p('外形尺寸长')];
        expect(findUniqueMatch('车长', candidates)?.name).toBe('外形尺寸长');
        expect(findUniqueMatch('外形尺寸长', candidates)?.name).toBe('外形尺寸长');
    });

    it('完全一致优先于同组别名（精确命中最强）', () => {
        // 「外形尺寸长」与它的别名「车长」同为候选时，精确同名的那条胜出
        const candidates = [p('车长'), p('外形尺寸长')];
        expect(findUniqueMatch('外形尺寸长', candidates)?.name).toBe('外形尺寸长');
    });

    it('别名组内出现多个候选时判为不确定', () => {
        // 用别名查询，而组内标准名与别名候选同时存在 → 无法判定用户要哪个
        const candidates = [p('外形尺寸长'), p('车长')];
        expect(findUniqueMatch('整车长', candidates)).toBeUndefined();
    });

    it('跨组别名（状态）判为不确定', () => {
        // 「状态」同时是「停产日期」和「停售日期」的别名
        const candidates = [p('停产日期'), p('停售日期')];
        expect(findUniqueMatch('状态', candidates)).toBeUndefined();
        // 只有其中一族存在时也不自动绑：名字本身有歧义
        expect(findUniqueMatch('状态', [p('停产日期')])).toBeUndefined();
    });

    it('跨组别名（乘员数）判为不确定', () => {
        const candidates = [p('驾驶室准乘人数'), p('额定载客(含驾驶员)')];
        expect(findUniqueMatch('乘员数', candidates)).toBeUndefined();
    });

    it('归一化撞名时判为不确定', () => {
        // 两个候选去掉单位后同名 → normalizedMap 只留首个，不能当作唯一
        const candidates = [p('轴距(mm)'), p('轴距(cm)')];
        expect(findUniqueMatch('轴距', candidates)).toBeUndefined();
        expect(findUniqueMatch('轴距(mm)', candidates)?.name).toBe('轴距(mm)');
    });

    it('模糊相近但不精确时不自动绑', () => {
        const candidates = [p('轴距')];
        // 「轴距长」与「轴距」只是相似，未命中精确/别名
        expect(findUniqueMatch('轴距长', candidates)).toBeUndefined();
    });

    it('无候选 / 空查询返回 undefined', () => {
        expect(findUniqueMatch('轴距', [])).toBeUndefined();
        expect(findUniqueMatch('   ', [p('轴距')])).toBeUndefined();
    });
});
