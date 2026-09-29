import { describe, expect, it } from 'vitest';
import {
    buildMarkdownTable,
    buildReportFileBase,
    escapeHtml,
    escapeMarkdownCell,
    formatReportDateSlug,
    sanitizeFileName,
    truncateFileNamePart,
} from '../reportExport';
import { buildCompareReportHtml, buildCompareReportMarkdown } from '../compareReport';
import { buildDiffReportHtml, buildDiffReportMarkdown, countUniqueParameters } from '../diffReport';
import { buildAssetUpgradeReviewHtml, buildAssetUpgradeReviewMarkdown } from '../assetUpgradeReport';
import { buildVehicleDisplayHeaders } from '../reportExport';
import type { DiffResult, VehicleParameter } from '../../types';

const param = (overrides: Partial<VehicleParameter>): VehicleParameter => ({
    id: 'x',
    group: '基本参数',
    name: '车辆型号',
    value: 'X500',
    ...overrides,
});

describe('reportExport 基础设施', () => {
    it('escapeHtml 转义全部危险字符', () => {
        expect(escapeHtml(`<img src="x" onerror='a()'>&`)).toBe(
            '&lt;img src=&quot;x&quot; onerror=&#39;a()&#39;&gt;&amp;',
        );
        expect(escapeHtml(undefined)).toBe('');
    });

    it('escapeMarkdownCell 处理竖线、反斜杠与换行', () => {
        expect(escapeMarkdownCell('a|b')).toBe('a\\|b');
        expect(escapeMarkdownCell('a\nb')).toBe('a<br>b');
        expect(escapeMarkdownCell('a\\b')).toBe('a\\\\b');
    });

    it('sanitizeFileName / truncateFileNamePart 清理非法字符并截断', () => {
        expect(sanitizeFileName('A/B\\C:D*E?"F<>|G')).toBe('ABCDEFG');
        expect(truncateFileNamePart('x'.repeat(70), 60)).toHaveLength(61); // 60 + 省略号
    });

    it('formatReportDateSlug 使用本地时区', () => {
        expect(formatReportDateSlug(new Date(2026, 8, 26, 23, 59))).toBe('2026-09-26');
    });

    it('buildReportFileBase 拼接前缀、细节与日期', () => {
        expect(buildReportFileBase('报告', '车型A_vs_车型B', new Date(2026, 8, 26))).toBe(
            '报告_车型A_vs_车型B_2026-09-26',
        );
    });

    it('buildMarkdownTable 生成表头、分隔线与数据行', () => {
        const md = buildMarkdownTable(['A', 'B'], [['1', '2'], ['3']]);
        expect(md.split('\n')).toEqual([
            '| A | B |',
            '| --- | --- |',
            '| 1 | 2 |',
            '| 3 |  |',
        ]);
    });
});

describe('车型参数对比报告', () => {
    const input = {
        rows: [
            { key: 'k1', group: '基本参数', name: '车辆型号', hasDiff: true, a: 'X500', b: 'X600' },
            { key: 'k2', group: '基本参数', name: '车辆品牌', hasDiff: false, a: 'DST', b: 'DST' },
            { key: 'k3', group: '其他', name: '备注', hasDiff: true, a: '带|竖线', b: '' },
        ],
        columns: [
            { key: 'a', label: '车型甲' },
            { key: 'b', label: '车型乙' },
        ],
        generatedAt: new Date(2026, 8, 26, 14, 30),
    };

    it('HTML 含统计、章节与差异单元格高亮，且转义用户值', () => {
        const html = buildCompareReportHtml(input);
        expect(html).toContain('<title>车型参数对比分析报告</title>');
        expect(html).toContain('差异项');
        expect(html).toContain('一致项');
        expect(html).toContain('rp-cell-diff');
        expect(html).toContain('rp-table-scroll'); // 手机端横向滚动容器
        expect(html).toContain('X600');
        expect(html).toContain('带|竖线'); // 已转义后原文不出现尖括号注入
        expect(html).not.toContain('<script');
    });

    it('HTML 统计数字正确', () => {
        const html = buildCompareReportHtml(input);
        expect(html).toContain('>2</div>'); // 差异项 2
        expect(html).toContain('>3</div>'); // 总参数 3
    });

    it('Markdown 含转义后的表格与统计', () => {
        const md = buildCompareReportMarkdown(input);
        expect(md).toContain('# 车型参数对比分析报告');
        expect(md).toContain('车型甲 vs 车型乙');
        expect(md).toContain('## 差异项（2）');
    });

    it('Markdown 单元格竖线被转义', () => {
        const md = buildCompareReportMarkdown({
            ...input,
            rows: [{ key: 'k1', group: '动|力', name: '发动机', hasDiff: true, a: 'V6', b: 'V8' }],
        });
        expect(md).toContain('动\\|力');
    });

    it('超长车型名编号为「车型 N」，完整名进对照图例，meta 不再拼全名', () => {
        const longA = '龙耀8S 宁德时代新能源科技股份有限公司 53.58 XMQ5035XXYBEVL02 III';
        const longB = '龙耀8S 宁德时代新能源科技股份有限公司 53.58 XMQ5035XXYBEVL02 II';
        const html = buildCompareReportHtml({
            rows: [{ key: 'k1', group: '基本参数', name: '车辆型号', hasDiff: true, a: 'X500', b: 'X600' }],
            columns: [{ key: 'a', label: longA }, { key: 'b', label: longB }],
        });
        expect(html).toContain('<th>车型 1</th>');
        expect(html).toContain('<th>车型 2</th>');
        expect(html).not.toContain(`<th>${longA}`);
        expect(html).toContain('rp-legend');
        expect(html).toContain(longA); // 图例中保留完整名
        expect(html).toContain('2 款（车型对照见下）');
    });

    it('短车型名直接作为表头，不出现图例', () => {
        const html = buildCompareReportHtml(input);
        expect(html).toContain('<th>车型甲</th>');
        expect(html).not.toContain('<div class="rp-legend">');
    });

    it('buildVehicleDisplayHeaders 按长度阈值编号', () => {
        const r = buildVehicleDisplayHeaders(['X500', 'x'.repeat(15)]);
        expect(r.display).toEqual(['X500', '车型 2']);
        expect(r.hasNumbered).toBe(true);
        expect(buildVehicleDisplayHeaders(['A', 'B']).hasNumbered).toBe(false);
    });

    it('表格为固定布局并带 colgroup 列宽', () => {
        const html = buildCompareReportHtml(input);
        expect(html).toContain('table-layout: fixed');
        expect(html).toContain('<colgroup>');
    });

    it('全空行不进报告且统计同步缩小，半空行保留', () => {
        const rows = [
            ...input.rows,
            { key: 'k4', group: '其他', name: '全空参数', hasDiff: false, a: '', b: '  ' },
            { key: 'k5', group: '其他', name: '半空参数', hasDiff: true, a: '有值', b: '' },
        ];
        const html = buildCompareReportHtml({ ...input, rows });
        expect(html).not.toContain('全空参数');
        expect(html).toContain('半空参数');
        expect(html).toContain('>4</div>'); // 总参数 = 5 - 1 全空

        const md = buildCompareReportMarkdown({ ...input, rows });
        expect(md).not.toContain('全空参数');
        expect(md).toContain('半空参数');
    });
});

describe('车辆参数对比报告（版本差分）', () => {
    const result: DiffResult = {
        added: [param({ id: 'a1', name: '新增项', value: 1, originSheet: 'S1' })],
        removed: [param({ id: 'r1', name: '移除项', value: 'x' })],
        modified: [
            {
                id: 'm1',
                oldParam: param({ id: 'o1', name: '车身颜色', value: '红', productName: 'X500' }),
                newParam: param({ id: 'n1', name: '车身颜色', value: '蓝' }),
            },
        ],
        unchanged: [param({ id: 'u1', name: '车辆品牌', value: 'DST', originSheet: 'S1' })],
    };

    it('countUniqueParameters 按 Sheet+分组+参数名 去重', () => {
        expect(countUniqueParameters([
            param({ originSheet: 'S1', name: 'A' }),
            param({ originSheet: 'S2', name: 'A' }),
            param({ originSheet: 'S1', name: 'A' }),
            param({ name: 'B' }),
        ])).toBe(3);
    });

    it('HTML 含四类统计、变更行旧值删除线与必填标记', () => {
        const html = buildDiffReportHtml({
            result,
            baseFileName: '基准.xlsx',
            targetFileName: '新版.xlsx',
            generatedAt: new Date(2026, 8, 26),
        });
        expect(html).toContain('变更参数');
        expect(html).toContain('新增参数');
        expect(html).toContain('移除参数');
        expect(html).toContain('rp-val-old');
        expect(html).toContain('rp-val-new');
        expect(html).toContain('必填'); // 车身颜色在必填清单中
        expect(html).toContain('基准.xlsx');
    });

    it('参数名变更时展示 旧名 → 新名', () => {
        const html = buildDiffReportHtml({
            result: {
                ...result,
                modified: [{
                    id: 'm1',
                    oldParam: param({ id: 'o1', name: '旧名', value: '红' }),
                    newParam: param({ id: 'n1', name: '新名', value: '红' }),
                }],
            },
            baseFileName: 'a.xlsx',
            targetFileName: 'b.xlsx',
        });
        expect(html).toContain('旧名');
        expect(html).toContain('新名');
    });

    it('Markdown 含元信息与统计表', () => {
        const md = buildDiffReportMarkdown({
            result,
            baseFileName: '基准.xlsx',
            targetFileName: '新版.xlsx',
            modeLabel: '仅公告号数据对比',
        });
        expect(md).toContain('# 车辆参数对比报告');
        expect(md).toContain('- 基准文件：基准.xlsx');
        expect(md).toContain('- 对比模式：仅公告号数据对比');
        expect(md).toContain('| 变更参数 | 1 |');
    });
});

describe('资产升级审查单', () => {
    const draft = {
        assetFileName: '旧资产.json',
        assetProductName: 'X500',
        importedFileName: '新版.xlsx',
        items: [],
        summary: { same: 0, newField: 0, fillEmpty: 0, conflict: 0, oldOnly: 0 },
    };

    const preview = {
        summary: {
            totalItems: 4, keepOldCount: 1, useNewCount: 2, pendingCount: 1,
            changedCount: 2, newFieldCount: 0, fillEmptyCount: 0,
            conflictResolvedCount: 0, oldOnlyCount: 0,
        },
        items: [
            {
                key: 'i1', group: '基本参数', fieldName: '车身颜色', oldValue: '红', newValue: '蓝',
                finalValue: '蓝', category: 'conflict' as const, decision: 'use_new' as const, changed: true,
            },
            {
                key: 'i2', group: '基本参数', fieldName: '车辆品牌', oldValue: 'DST', newValue: 'DST',
                finalValue: 'DST', category: 'same' as const, decision: 'keep_old' as const, changed: false,
            },
        ],
    };

    it('HTML 含统计卡、待决策横幅与明细表', () => {
        const html = buildAssetUpgradeReviewHtml({ draft, preview, generatedAt: new Date(2026, 8, 26) });
        expect(html).toContain('资产升级审查单');
        expect(html).toContain('冲突字段未决策');
        expect(html).toContain('冲突字段'); // 分类列
        expect(html).toContain('旧资产.json');
    });

    it('无待决策时不出现横幅', () => {
        const html = buildAssetUpgradeReviewHtml({
            draft,
            preview: { ...preview, summary: { ...preview.summary, pendingCount: 0 } },
        });
        expect(html).not.toContain('冲突字段未决策');
    });

    it('Markdown 含统计与明细', () => {
        const md = buildAssetUpgradeReviewMarkdown({ draft, preview });
        expect(md).toContain('# 资产升级审查单');
        expect(md).toContain('| 使用新版 | 2 |');
        expect(md).toContain('使用新版'); // 决策列取值
        expect(md).toContain('| 保留旧值 |');
    });
});
