import { describe, expect, it } from 'vitest';
import type { VehicleParameter } from '../../types';
import {
    analyzeEffectiveParams,
    buildContentClasses,
    compareParamKey,
    deriveFileProfile,
    diffAgainstBaseline,
    summarizeCompareFiles,
} from '../assetCompare';

const p = (name: string, value: string | number, group = '整车参数'): VehicleParameter =>
    ({ id: `${group}::${name}`, group, name, value });

/** 与真实 V6E 那 5 份同构：352 个有效值，只差「车型族群」一格 */
const nearDuplicate = (ethnic: string, extraEmptyRows = 0): VehicleParameter[] => {
    const params: VehicleParameter[] = [p('车型族群', ethnic, '基础信息')];
    for (let i = 0; i < 351; i++) params.push(p(`字段${i}`, `值${i}`));
    for (let i = 0; i < extraEmptyRows; i++) params.push(p(`模板空行${i}`, ''));
    return params;
};

describe('有效字段口径', () => {
    it('剔除纯符号占位，保留「无」', () => {
        const analysis = analyzeEffectiveParams([
            p('A', '1'),
            p('B', '/'),
            p('C', 'N/A'),
            p('D', '—'),
            p('E', '无'),
            p('F', '   '),
            p('G', '待定'),
        ]);
        expect(analysis.map.get('整车参数::E')).toBe('无');
        expect(analysis.map.has('整车参数::B')).toBe(false);
        expect(analysis.map.has('整车参数::C')).toBe(false);
        expect(analysis.map.has('整车参数::D')).toBe(false);
        expect(analysis.map.has('整车参数::F')).toBe(false);
        expect(analysis.map.has('整车参数::G')).toBe(false);
        expect(analysis.effective).toBe(2);
        expect(analysis.total).toBe(7);
        expect(analysis.filled).toBe(6);
        expect(analysis.placeholder).toBe(4);
    });

    it('同组同名的重复行保留首个非空值', () => {
        const analysis = analyzeEffectiveParams([p('型号', ''), p('型号', 'A型')]);
        expect(analysis.map.get('整车参数::型号')).toBe('A型');
        expect(analysis.effective).toBe(1);
    });

    it('分组参与配对：不同总成下的同名字段不是同一个字段', () => {
        const analysis = analyzeEffectiveParams([p('型号', 'A', '电机'), p('型号', 'B', '电池')]);
        expect(analysis.effective).toBe(2);
        expect(compareParamKey({ group: '电机', name: '型号' })).toBe('电机::型号');
    });

    it('缺失与空等价：一边没有该字段，另一边是空串 → 不算差异', () => {
        const base = analyzeEffectiveParams([p('A', '1')]).map;
        const file = analyzeEffectiveParams([p('A', '1'), p('B', '')]).map;
        const diff = diffAgainstBaseline(base, file);
        expect(diff.onlyBaseline).toEqual([]);
        expect(diff.onlyFile).toEqual([]);
        expect(diff.changed).toEqual([]);
    });
});

describe('文件维度汇总', () => {
    it('351/352 相同 + 1 格不同 → 差异 1，且不判「内容相同」', () => {
        const { rows } = summarizeCompareFiles([
            { instanceKey: 'a', params: nearDuplicate('中面', 27) },
            { instanceKey: 'b', params: nearDuplicate('小面', 27) },
        ]);
        expect(rows[0].effective).toBe(352);
        expect(rows[1].effective).toBe(352);
        expect(rows[0].isBaseline).toBe(true);
        expect(rows[0].diffCount).toBe(0);
        expect(rows[1].diffCount).toBe(1);
        expect(rows[0].identicalToBaseline).toBe(false);
        expect(rows[1].identicalToBaseline).toBe(false);
    });

    it('内容完全相同 → 差异 0、覆盖率相同、同属一个等价类', () => {
        const inputs = [
            { instanceKey: 'a', params: nearDuplicate('中面', 27) },
            { instanceKey: 'b', params: nearDuplicate('中面', 27) },
            { instanceKey: 'c', params: nearDuplicate('小面', 3) },
        ];
        const { rows, unionSize } = summarizeCompareFiles(inputs);
        expect(rows[0].isBaseline).toBe(true);
        expect(rows[0].diffCount).toBe(0);
        expect(rows[1].diffCount).toBe(0);
        // 基准与自身恒相等，不算「与基准内容相同」
        expect(rows[0].identicalToBaseline).toBe(false);
        expect(rows[1].identicalToBaseline).toBe(true);
        expect(rows[0].coverage).toBe(1);
        expect(rows[2].coverage).toBeCloseTo(352 / unionSize);

        const classes = buildContentClasses(inputs);
        expect(classes[0].size).toBe(2);
        expect(classes[0].keys).toEqual(['a', 'b']);
    });

    it('模板行数不同不影响覆盖率分母（分母是字段并集，不是各自模板）', () => {
        const { rows } = summarizeCompareFiles([
            { instanceKey: 'full', params: nearDuplicate('中面', 0) },
            { instanceKey: 'padded', params: nearDuplicate('中面', 27) },
        ]);
        // padded 多 27 个空模板行，但有效字段与覆盖率完全一样
        expect(rows[1].total).toBe(rows[0].total + 27);
        expect(rows[1].effective).toBe(rows[0].effective);
        expect(rows[1].coverage).toBe(1);
        expect(rows[1].diffCount).toBe(0);
    });

    it('字段只在一边有 → 计入差异', () => {
        const { rows } = summarizeCompareFiles([
            { instanceKey: 'a', params: [p('A', '1'), p('只有A', 'x')] },
            { instanceKey: 'b', params: [p('A', '1'), p('只有B', 'y')] },
        ]);
        expect(rows[1].diffCount).toBe(2);
        expect(rows[1].identicalToBaseline).toBe(false);
    });

    it('基准 = 有效字段最多的一份；并列取输入顺序靠前者', () => {
        const { baselineKey } = summarizeCompareFiles([
            { instanceKey: 'small', params: [p('A', '1')] },
            { instanceKey: 'big', params: [p('A', '1'), p('B', '2')] },
        ]);
        expect(baselineKey).toBe('big');
    });

    it('只有一个文件时不产生「内容相同」结论', () => {
        const { rows } = summarizeCompareFiles([{ instanceKey: 'a', params: [p('A', '1')] }]);
        expect(rows[0].isBaseline).toBe(true);
        expect(rows[0].identicalToBaseline).toBe(false);
    });
});

describe('重点字段派生', () => {
    it('主机厂按优先级取，电池品牌回退单体企业', () => {
        const profile = deriveFileProfile([
            p('企业名称', '某集团'),
            p('整车生产企业', '整车厂'),
            p('动力电池单体生产企业', '单体厂'),
            p('整车公告号', 'JL6481BEV100'),
            p('准入编号', 'ZR202609100002'),
            p('产品等级标准', 'Ⅱ'),
            p('动力电池包电量（kWh）', '41.86'),
            p('车辆型号', 'V6E客运版'),
        ]);
        expect(profile.manufacturer).toBe('整车厂');
        expect(profile.batteryBrand).toBe('单体厂');
        expect(profile.announceNo).toBe('JL6481BEV100');
        expect(profile.admissionNo).toBe('ZR202609100002');
        expect(profile.admissionLevel).toBe('Ⅱ');
        expect(profile.capacity).toBe('41.86');
        expect(profile.model).toBe('V6E客运版');
    });
});
