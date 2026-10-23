import { describe, expect, it } from 'vitest';
import {
    applyImportedFields,
    matchTypeConfidence,
    appendField,
    appendFields,
    reorderFields,
    buildExportRows,
    computeSyncDiff,
    setRequiredFor,
    withRequired,
    createId,
    isFormatUsable,
    pruneGroupSources,
    renderFileName,
    resolveGroupFields,
    summarizeResolved,
    withSingleSource,
    withSource,
} from '../fieldMapping';
import type { ExportFormat, FieldGroupConfigItem } from '../fieldLists';
import type { VehicleParameter } from '../../types';

const p = (name: string, value: string): VehicleParameter => ({ id: name, group: '基础信息', name, value });

const group = (fields: string[], sources?: FieldGroupConfigItem['sources']): FieldGroupConfigItem => ({
    id: 'g1', name: '测试组', fields, ...(sources ? { sources } : {}),
});

const format: ExportFormat = {
    id: 'f1',
    name: '货运格式',
    fieldGroupId: 'g1',
    sheetName: '产品准入导入模版',
    fileNamePattern: '车上云系统导入_{车型}_{日期}',
};

describe('resolveGroupFields · 1 对 N 候选', () => {
    it('候选按顺序取第一个存在的：A 车叫「颜色」，先命中', () => {
        const g = group(['车型颜色'], { 车型颜色: { candidates: ['颜色', '车颜色'] } });
        const rows = resolveGroupFields(g, [p('颜色', '白色'), p('车颜色', '白色')], () => []);
        expect(rows[0].sources).toEqual(['颜色']);
        expect(rows[0].value).toBe('白色');
    });

    it('B 车没有「颜色」但叫「车颜色」：同一个字段组自动换候选', () => {
        const g = group(['车型颜色'], { 车型颜色: { candidates: ['颜色', '车颜色'] } });
        const rows = resolveGroupFields(g, [p('车颜色', '黑色')], () => []);
        expect(rows[0].sources).toEqual(['车颜色']);
        expect(rows[0].value).toBe('黑色');
    });

    it('候选全不在时落到自动匹配（不把整行判死）', () => {
        const g = group(['轴距'], { 轴距: { candidates: ['不存在'] } });
        const rows = resolveGroupFields(g, [p('轴距', '3100')], () => []);
        expect(rows[0].sources).toEqual(['轴距']);
        expect(rows[0].status).not.toBe('unmapped');
    });
});

describe('resolveGroupFields · 1 对 N 组合', () => {
    it('多个候选同时命中且给了模板 → 拼接', () => {
        const g = group(['外扩尺寸'], {
            外扩尺寸: { candidates: ['外形尺寸长', '外形尺寸宽', '外形尺寸高'], template: '{0}×{1}×{2}' },
        });
        const rows = resolveGroupFields(
            g,
            [p('外形尺寸长', '5495'), p('外形尺寸宽', '1830'), p('外形尺寸高', '1980')],
            () => [],
        );
        expect(rows[0].value).toBe('5495×1830×1980');
        expect(rows[0].sources).toEqual(['外形尺寸长', '外形尺寸宽', '外形尺寸高']);
    });

    it('未给模板时只取第一个命中候选（候选是备选名，不是组合来源）', () => {
        const g = group(['外扩尺寸'], { 外扩尺寸: { candidates: ['长', '宽'] } });
        const rows = resolveGroupFields(g, [p('长', '1'), p('宽', '2')], () => []);
        expect(rows[0].value).toBe('1');
        expect(rows[0].sources).toEqual(['长']);
    });

    it('要组合必须显式给 template——否则一车两名的数据会被拼成「白色×白色」', () => {
        const g = group(['车型颜色'], { 车型颜色: { candidates: ['颜色', '车颜色'] } });
        const rows = resolveGroupFields(g, [p('颜色', '白色'), p('车颜色', '白色')], () => []);
        expect(rows[0].value).toBe('白色');
    });

    it('单候命中照旧直取值，不拼接', () => {
        const g = group(['车身颜色'], { 车身颜色: { candidates: ['出厂车身颜色'] } });
        const rows = resolveGroupFields(g, [p('出厂车身颜色', '白色')], () => []);
        expect(rows[0].value).toBe('白色');
    });
});

describe('resolveGroupFields · 状态分档', () => {
    it('未配置时自动精确匹配并判 ok', () => {
        const rows = resolveGroupFields(group(['车身颜色']), [p('车身颜色', '白色')], () => ['白色']);
        expect(rows[0].matchType).toBe('exact');
        expect(rows[0].status).toBe('ok');
    });

    it('值不在词表 → enum_invalid（精确比较，270 不等于 270°）', () => {
        const rows = resolveGroupFields(
            group(['尾门开启度数（°）']),
            [p('尾门开启度数（°）', '270')],
            () => ['180°', '270°'],
        );
        expect(rows[0].status).toBe('enum_invalid');
    });

    it('词表未收录 → no_enum（不判错）', () => {
        const rows = resolveGroupFields(group(['车身颜色']), [p('车身颜色', '白色')], () => []);
        expect(rows[0].status).toBe('no_enum');
    });

    it('模糊建议 → low_confidence（值再合法也不静默采用）', () => {
        const rows = resolveGroupFields(
            group(['车辆外廓尺寸']),
            [p('车辆外廓尺寸长', '5495')],
            () => [],
        );
        expect(rows[0].suggested).toBe(true);
        expect(rows[0].status).toBe('low_confidence');
    });

    it('无候选 → unmapped', () => {
        const rows = resolveGroupFields(group(['完全不存在的字段']), [p('车身颜色', '白色')], () => []);
        expect(rows[0].status).toBe('unmapped');
        expect(rows[0].sources).toEqual([]);
    });

    it('汇总：红项只含 unmapped 与 enum_invalid；模糊不计入已确定', () => {
        const g = group(['车身颜色', '侧门帘', '缺失字段', '车辆外廓尺寸']);
        const rows = resolveGroupFields(
            g,
            [p('车身颜色', '白色'), p('侧门帘', '右侧滑门'), p('车辆外廓尺寸长', '1')],
            field => (field === '侧门帘' ? ['标配', '无', '/'] : []),
        );
        const summary = summarizeResolved(rows);
        expect(summary.total).toBe(4);
        expect(summary.unmapped).toBe(1);
        expect(summary.enumInvalid).toBe(1);
        expect(summary.blocking).toBe(2);
        expect(summary.lowConfidence).toBe(1);
        expect(summary.resolved).toBe(2);
    });
});

describe('字段组编辑', () => {
    it('withSource 写入候选规则，null 删除', () => {
        const next = withSource(group(['A']), 'A', { candidates: ['a1', 'a2'], template: '{0}/{1}' });
        expect(next.sources?.A).toEqual({ candidates: ['a1', 'a2'], template: '{0}/{1}' });
        expect(withSource(next, 'A', null).sources?.A).toBeUndefined();
    });

    it('withSingleSource 只写一个候选', () => {
        expect(withSingleSource(group(['A']), 'A', 'a1').sources?.A).toEqual({ candidates: ['a1'] });
    });

    it('pruneGroupSources 只保留仍在组内的字段', () => {
        const g = group(['A', 'B'], { A: { candidates: ['a'] }, B: { candidates: ['b'] } });
        expect(pruneGroupSources(g, ['A']).sources).toEqual({ A: { candidates: ['a'] } });
    });
});

describe('必填标记', () => {
    const g = group(['A', 'B', 'C'], {});

    it('withRequired 单字段设置与取消', () => {
        const on = withRequired(g, 'A', true);
        expect(on.required).toEqual(['A']);
        expect(withRequired(on, 'A', false).required).toEqual([]);
    });

    it('setRequiredFor 批量设置，忽略不在组内的字段', () => {
        const next = setRequiredFor(g, ['A', 'C', '不存在'], true);
        expect(next.required?.sort()).toEqual(['A', 'C']);
        expect(setRequiredFor(next, ['A'], false).required).toEqual(['C']);
    });

    it('解析结果带上必填标记', () => {
        const withReq = setRequiredFor(g, ['A'], true);
        const rows = resolveGroupFields(withReq, [p('A', '1'), p('B', '2'), p('C', '3')], () => []);
        expect(rows.find(r => r.field === 'A')?.required).toBe(true);
        expect(rows.find(r => r.field === 'B')?.required).toBe(false);
    });

    it('汇总：必填总数与必填未填（空值或未映射）', () => {
        const withReq = setRequiredFor(g, ['A', 'B'], true);
        const rows = resolveGroupFields(withReq, [p('A', '1'), p('B', '')], () => []);
        const summary = summarizeResolved(rows);
        expect(summary.required).toBe(2);
        // B 有来源但值为空；C 未映射但非必填 → 不计入
        expect(summary.requiredMissing).toBe(1);
    });

    it('覆盖导入：必填标记按字段名保留（核心诉求）', () => {
        const before = setRequiredFor(group(['A', 'B'], { A: { candidates: ['a'] } }), ['A'], true);
        const after = applyImportedFields(before, ['A', 'B', 'C'], 'replace');
        expect(after.fields).toEqual(['A', 'B', 'C']);
        expect(after.required).toEqual(['A']);
        expect(after.sources?.A).toEqual({ candidates: ['a'] });
    });

    it('覆盖导入移除字段时，该字段的必填标记一并消失（不留幽灵）', () => {
        const before = setRequiredFor(group(['A', 'B'], {}), ['A', 'B'], true);
        const after = applyImportedFields(before, ['A'], 'replace');
        expect(after.required).toEqual(['A']);
    });

    it('合并导入：保留现有顺序与必填，只把新字段追加到末尾', () => {
        const before = setRequiredFor(group(['B', 'A'], {}), ['A'], true);
        const after = applyImportedFields(before, ['C', 'A'], 'merge');
        // 不重排：现有顺序 B、A 原样保留，C 追加到末尾
        expect(after.fields).toEqual(['B', 'A', 'C']);
        expect(after.required).toEqual(['A']);
    });
});

describe('视同（跨车型复制已矫正的值）', () => {
    const g = group(['车身颜色', '货厢长度', '空字段']);

    it('参考车型有值且与当前不同 → 记为差异', () => {
        const fields = resolveGroupFields(g, [p('车身颜色', '白色'), p('货厢长度', '3280'), p('空字段', '')], () => []);
        const diff = computeSyncDiff(fields, {
            manualValues: { 车身颜色: '黑色' },
            library: [p('车身颜色', '黑色'), p('货厢长度', '3280')],
        });
        expect(diff).toEqual([{ field: '车身颜色', referenceValue: '黑色', currentValue: '白色' }]);
    });

    it('参考车型也没值 → 不作差异（不把空覆盖进来）', () => {
        const fields = resolveGroupFields(g, [p('车身颜色', '白色'), p('货厢长度', '3280'), p('空字段', '')], () => []);
        const diff = computeSyncDiff(fields, { manualValues: {}, library: [p('车身颜色', ''), p('货厢长度', '3280')] });
        expect(diff).toEqual([]);
    });

    it('人工修正值优先于参考车型的资产原值', () => {
        const fields = resolveGroupFields(g, [p('车身颜色', '白色')], () => []);
        const diff = computeSyncDiff(fields, {
            manualValues: { 车身颜色: '银色' },
            library: [p('车身颜色', '白色')],
        });
        expect(diff[0].referenceValue).toBe('银色');
    });

    it('当前车型已有相同修正值 → 不重复列出', () => {
        const fields = resolveGroupFields(g, [p('车身颜色', '白色')], () => [], { 车身颜色: '黑色' });
        const diff = computeSyncDiff(fields, {
            manualValues: { 车身颜色: '黑色' },
            library: [p('车身颜色', '黑色')],
        });
        expect(diff).toEqual([]);
    });

    it('本车未映射、但参考车型有同名字段 → 仍算差异（否则参考字段看不到）', () => {
        const g = group(['A'], {});   // 没有 sources → 若资产里也没有 A，则 unmapped
        const fields = resolveGroupFields(g, [], () => []);
        expect(fields[0].status).toBe('unmapped');
        const diff = computeSyncDiff(fields, {
            manualValues: {},
            library: [p('A', '参考值')],
        });
        expect(diff).toEqual([{ field: 'A', referenceValue: '参考值', currentValue: '' }]);
    });

    it('优先用来源字段名取值；来源对不上时退回输出字段名', () => {
        const g = group(['车型颜色'], { 车型颜色: { candidates: ['颜色'] } });
        const fields = resolveGroupFields(g, [p('颜色', '白色')], () => []);
        // 参考车型没有「颜色」，只有「车型颜色」
        const diff = computeSyncDiff(fields, {
            manualValues: {},
            library: [p('车型颜色', '黑色')],
        });
        expect(diff[0].referenceValue).toBe('黑色');
    });

    it('组合字段按第一个来源比对（组合值以第一来源在参考车型的值近似判断）', () => {
        const g2 = group(['外扩尺寸'], { 外扩尺寸: { candidates: ['长', '宽'], template: '{0}×{1}' } });
        const fields = resolveGroupFields(g2, [p('长', '1'), p('宽', '2')], () => []);
        const diff = computeSyncDiff(fields, {
            manualValues: {},
            library: [p('长', '1'), p('宽', '2')],
        });
        // 参考值 1 ≠ 当前组合值 1×2 → 列为差异（宁可多提示，不静默漏）
        expect(diff).toHaveLength(1);
    });
});

describe('导出格式', () => {
    it('导出行：表头 + 每字段一行，顺序 = 字段组顺序', () => {
        const rows = resolveGroupFields(group(['B', 'A']), [p('A', '1'), p('B', '2')], () => []);
        expect(buildExportRows(rows)).toEqual([
            ['参数项名称', '参数值'],
            ['B', '2'],
            ['A', '1'],
        ]);
    });

    it('文件名模板替换车型与日期', () => {
        expect(renderFileName(format, { vehicle: 'V8E', date: '20261019' }))
            .toBe('车上云系统导入_V8E_20261019');
    });

    it('格式引用的字段组不存在 → 不可用', () => {
        const groups = [group(['A'])];
        expect(isFormatUsable(format, groups)).toBe(true);
        expect(isFormatUsable({ ...format, fieldGroupId: 'gone' }, groups)).toBe(false);
    });

    it('createId 同参数稳定且带前缀', () => {
        expect(createId('fmt', 1, 0.5)).toBe(createId('fmt', 1, 0.5));
        expect(createId('fmt', 1, 0.5).startsWith('fmt-')).toBe(true);
    });
});


describe('字段顺序（模板顺序即导出行号，不得被打乱）', () => {
    it('appendField 追加到末尾，不重排整组', () => {
        const g = group(['Z字段', 'A字段']);
        expect(appendField(g, 'M字段').fields).toEqual(['Z字段', 'A字段', 'M字段']);
    });

    it('appendField 重复字段不改变顺序', () => {
        const g = group(['Z', 'A']);
        expect(appendField(g, 'A').fields).toEqual(['Z', 'A']);
    });

    it('appendFields 保持传入顺序，跳过已存在的', () => {
        const g = group(['B', 'A']);
        expect(appendFields(g, ['C', 'A', 'D']).fields).toEqual(['B', 'A', 'C', 'D']);
    });

    it('合并导入保留原顺序，新字段按文件顺序追加', () => {
        const g = group(['Z字段', 'A字段']);
        const next = applyImportedFields(g, ['A字段', 'Y字段', 'Z字段', 'B字段'], 'merge');
        expect(next.fields).toEqual(['Z字段', 'A字段', 'Y字段', 'B字段']);
    });

    it('覆盖导入严格采用文件顺序（哪怕与字母序相反）', () => {
        const next = applyImportedFields(group(['A', 'B', 'C']), ['C', 'A', 'B'], 'replace');
        expect(next.fields).toEqual(['C', 'A', 'B']);
    });

    it('reorderFields 按给定顺序重排，未列出的按原序追加', () => {
        const g = group(['A', 'B', 'C', 'D']);
        expect(reorderFields(g, ['D', 'B']).fields).toEqual(['D', 'B', 'A', 'C']);
    });
});


describe('回执里的「必填未填」→ 标进字段组', () => {
    it('批量标记只作用于组内字段，且可重复调用', () => {
        const g = group(['冷机品牌', '冷机型号', '尾板类型'], {});
        const once = setRequiredFor(g, ['冷机品牌', '冷机型号'], true);
        expect(once.required?.sort()).toEqual(['冷机品牌', '冷机型号']);
        // 再来一次（用户点了「全部设为必填」两次）不应重复或报错
        expect(setRequiredFor(once, ['冷机品牌'], true).required?.sort())
            .toEqual(['冷机品牌', '冷机型号']);
    });

    it('标记后解析结果带上 required，便于下一次提前提示', () => {
        const g = setRequiredFor(group(['尾板类型'], {}), ['尾板类型'], true);
        const rows = resolveGroupFields(g, [p('尾板类型', '')], () => ['标配', '无']);
        expect(rows[0].required).toBe(true);
        expect(rows[0].status).toBe('empty');
    });
});


describe('匹配度不能再「有来源就是 100%」', () => {
    it('精确 / 人工 = 1', () => {
        expect(matchTypeConfidence('exact', true)).toBe(1);
        expect(matchTypeConfidence('manual', true)).toBe(1);
    });

    it('归一化 / 别名次之', () => {
        expect(matchTypeConfidence('normalized', true)).toBe(0.95);
        expect(matchTypeConfidence('alias', true)).toBe(0.9);
    });

    it('模糊匹配必须低于 100%（驾驶室宽度 ← 货厢内部宽度 属于此类）', () => {
        expect(matchTypeConfidence('fuzzy', true)).toBeLessThan(1);
    });

    it('没有来源 = 0', () => {
        expect(matchTypeConfidence(undefined, false)).toBe(0);
        expect(matchTypeConfidence('exact', false)).toBe(0);
    });

    it('模糊匹配的行在解析结果里带 suggested 标记', () => {
        const rows = resolveGroupFields(
            group(['驾驶室宽度（mm）']),
            [p('货厢内部宽度（mm）', '1700')],
            () => [],
        );
        expect(rows[0].suggested).toBe(true);
        expect(matchTypeConfidence(rows[0].matchType, true)).toBeLessThan(1);
    });
});
