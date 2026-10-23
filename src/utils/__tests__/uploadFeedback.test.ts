import { describe, expect, it } from 'vitest';
import {
    fieldFromRowNumber,
    mergeIssuesByField,
    matchIssuesToFields,
    parseIssueLine,
    parseUploadFeedback,
    summarizeIssues,
} from '../uploadFeedback';
import type { ResolvedField } from '../fieldMapping';

/** 构造一条已解析的字段行（只填与回执匹配相关的字段） */
const field = (name: string, value: string): ResolvedField => ({
    field: name,
    sources: [name],
    matchType: 'exact',
    value,
    enums: [],
    status: 'ok',
    required: false,
});

describe('parseIssueLine', () => {
    it('「商品属性[…]不存在」→ attribute_missing（属性库没有，与模板无关）', () => {
        const issue = parseIssueLine('第[285]行 商品属性[前装易流温度监测设备]不存在');
        expect(issue).toMatchObject({
            rowNumber: 285,
            field: '前装易流温度监测设备',
            kind: 'attribute_missing',
        });
    });

    it('「属性[…]的取值[…]有误」→ value_invalid，并取出非法值', () => {
        const issue = parseIssueLine('第[288]行 属性[燃料类型]的取值[/]有误');
        expect(issue).toMatchObject({
            rowNumber: 288,
            field: '燃料类型',
            value: '/',
            kind: 'value_invalid',
        });
    });

    it('「属性[…]必填」→ required_missing', () => {
        const issue = parseIssueLine('第[309]行 属性[尾板类型]必填');
        expect(issue).toMatchObject({
            rowNumber: 309,
            field: '尾板类型',
            kind: 'required_missing',
        });
    });

    it('容忍序号前缀与全角括号', () => {
        const issue = parseIssueLine('36  第[312]行  商品属性[尾门开启度数（°）]不存在');
        expect(issue.rowNumber).toBe(312);
        expect(issue.field).toBe('尾门开启度数（°）');
    });

    it('读不出行号时仍按字段名解析', () => {
        const issue = parseIssueLine('属性[尾门帘]的取值[对开门]有误');
        expect(issue.rowNumber).toBeUndefined();
        expect(issue.field).toBe('尾门帘');
    });
});

describe('无方括号版（新版回执「列不属于该模版」）', () => {
    it('「车辆数据监控方式 列不属于该模版」→ column_not_in_template，字段名取行号后面的那段', () => {
        const issue = parseIssueLine('第[25]行 车辆数据监控方式 列不属于该模版');
        expect(issue).toMatchObject({
            rowNumber: 25,
            field: '车辆数据监控方式',
            kind: 'column_not_in_template',
        });
    });

    it('带空格的字段名（车身 侧门 → 车身（货厢）侧门 这类）只取到第一个空格', () => {
        const issue = parseIssueLine('第[26]行 车身（货厢）侧门列不属于该模版');
        expect(issue.field).toBe('车身（货厢）侧门');
        expect(issue.rowNumber).toBe(26);
    });

    it('「燃料类型 的取值[/]有误」→ value_invalid，值仍从方括号取', () => {
        const issue = parseIssueLine('第[288]行 燃料类型 的取值[/]有误');
        expect(issue).toMatchObject({ rowNumber: 288, field: '燃料类型', value: '/', kind: 'value_invalid' });
    });

    it('「尾板类型必填」→ required_missing', () => {
        const issue = parseIssueLine('第[309]行 尾板类型必填');
        expect(issue).toMatchObject({ rowNumber: 309, field: '尾板类型', kind: 'required_missing' });
    });

    it('整段无方括号回执可解析（截图里的形态）', () => {
        const issues = parseUploadFeedback(`
1 第[25]行 车辆数据监控方式 列不属于该模版
2 第[26]行 车身（货厢）侧门列不属于该模版
3 第[29]行 车身颜色 列不属于该模版
`);
        expect(issues).toHaveLength(3);
        expect(issues.map(i => i.field)).toEqual(['车辆数据监控方式', '车身（货厢）侧门', '车身颜色']);
        expect(issues.every(i => i.kind === 'column_not_in_template')).toBe(true);
    });
});

describe('抓取脚本的真实输出格式', () => {
    // 脚本产出形如 `第[25]行 车辆数据监控方式 列不属于该模版`，需能被解析
    it('脚本产出的四类行都能解析', () => {
        const text = [
            '第[25]行 车辆数据监控方式 列不属于该模版',
            '第[26]行 车身（货厢）侧门列不属于该模版',
            '第[288]行 燃料类型 的取值[/]有误',
            '第[309]行 尾板类型必填',
        ].join('\n');
        const issues = parseUploadFeedback(text);
        expect(issues).toHaveLength(4);
        expect(issues.map(i => [i.rowNumber, i.field, i.kind])).toEqual([
            [25, '车辆数据监控方式', 'column_not_in_template'],
            [26, '车身（货厢）侧门', 'column_not_in_template'],
            [288, '燃料类型', 'value_invalid'],
            [309, '尾板类型', 'required_missing'],
        ]);
    });
});

describe('parseUploadFeedback', () => {
    it('解析多行回执，跳过空行与表头行', () => {
        const text = `
序号  行号  提示
33  第[285]行  商品属性[前装易流温度监测设备]不存在

34  第[288]行  属性[燃料类型]的取值[/]有误
`;
        const issues = parseUploadFeedback(text);
        expect(issues).toHaveLength(2);
        expect(issues[0].kind).toBe('attribute_missing');
        expect(issues[1].kind).toBe('value_invalid');
    });
});

describe('fieldFromRowNumber', () => {
    const fields = [field('A', '1'), field('B', '2'), field('C', '3')];

    it('第 1 行是表头，第 N 行对应 fields[N-2]', () => {
        expect(fieldFromRowNumber(2, fields)).toBe('A');
        expect(fieldFromRowNumber(4, fields)).toBe('C');
    });

    it('越界或非法行号返回 undefined', () => {
        expect(fieldFromRowNumber(1, fields)).toBeUndefined();
        expect(fieldFromRowNumber(99, fields)).toBeUndefined();
        expect(fieldFromRowNumber(undefined, fields)).toBeUndefined();
    });
});

describe('matchIssuesToFields', () => {
    const fields = [field('前装易流温度监测设备', ''), field('燃料类型', '/')];

    it('优先按字段名匹配', () => {
        const matched = matchIssuesToFields(
            [parseIssueLine('第[2]行 属性[燃料类型]的取值[/]有误')],
            fields,
        );
        expect(matched[0].resolvedField).toBe('燃料类型');
        expect(matched[0].currentValue).toBe('/');
    });

    it('名字对不上时用行号反查', () => {
        const matched = matchIssuesToFields(
            [parseIssueLine('第[2]行 商品属性[旧名字]不存在')],
            fields,
        );
        expect(matched[0].field).toBe('旧名字');
        expect(matched[0].resolvedField).toBe('前装易流温度监测设备');
    });

    it('都对不上时保留原字段名，交给人工判断', () => {
        const matched = matchIssuesToFields(
            [parseIssueLine('第[99]行 商品属性[完全不认识]不存在')],
            fields,
        );
        expect(matched[0].resolvedField).toBe('完全不认识');
        expect(matched[0].currentValue).toBeUndefined();
    });
});

describe('summarizeIssues', () => {
    it('按类型计数，并判断行号是否与带表头的导出对齐', () => {
        const issues = matchIssuesToFields(
            parseUploadFeedback(`
第[285]行 商品属性[A]不存在
第[288]行 属性[B]的取值[/]有误
第[309]行 属性[C]必填
`),
            [field('A', ''), field('B', '/'), field('C', '')],
        );
        const summary = summarizeIssues(issues);
        expect(summary).toMatchObject({
            total: 3,
            attributeMissing: 1,
            valueInvalid: 1,
            requiredMissing: 1,
            rowAligned: true,
        });
    });
});


describe('两层校验要分开（用户反馈：标签与文字对不上）', () => {
    it('「列不属于该模版」与「商品属性[…]不存在」是两种类型，不能合并', () => {
        const issues = parseUploadFeedback([
            '第[19]行 车厢类型 列不属于该模版',
            '第[19]行 商品属性[车厢类型]不存在',
        ].join('\n'));
        expect(issues.map(i => i.kind)).toEqual(['column_not_in_template', 'attribute_missing']);
        expect(issues.map(i => i.field)).toEqual(['车厢类型', '车厢类型']);
    });

    it('同一字段的多条报错合并成一行，保留全部类型', () => {
        const issues = mergeIssuesByField(
            parseUploadFeedback([
                '第[19]行 车厢类型 列不属于该模版',
                '第[19]行 商品属性[车厢类型]不存在',
                '第[29]行 属性[车厢材质]必填',
            ].join('\n')),
        );
        expect(issues).toHaveLength(2);
        const first = issues.find(i => i.field === '车厢类型')!;
        expect(first.kinds).toEqual(['column_not_in_template', 'attribute_missing']);
        expect(first.raws).toHaveLength(2);
    });

    it('汇总按新类型分别计数', () => {
        const issues = mergeIssuesByField(
            parseUploadFeedback([
                '第[19]行 车厢类型 列不属于该模版',
                '第[19]行 商品属性[车厢类型]不存在',
                '第[86]行 属性[冷机型号]的取值[X]有误',
            ].join('\n')),
        );
        const summary = summarizeIssues(issues);
        expect(summary.columnNotInTemplate).toBe(1);
        expect(summary.attributeMissing).toBe(1);
        expect(summary.valueInvalid).toBe(1);
    });
});
