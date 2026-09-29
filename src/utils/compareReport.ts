/**
 * 车型参数对比报告（参数工作台 · 对比视图）的 HTML / Markdown 构建。
 * 纯函数，方便测试；文件保存走 reportExport.saveTextReport。
 */
import { isFieldRequired } from '../assets/requiredFields';
import {
    buildMarkdownTable,
    buildReportFileBase,
    buildReportHtmlDocument,
    buildReportSection,
    buildReportTable,
    buildVehicleDisplayHeaders,
    escapeHtml,
    escapeMarkdownCell,
    formatReportTimestamp,
    saveTextReport,
    type ReportFormat,
} from './reportExport';

export interface CompareReportColumn {
    /** 车型实例键，即行对象上的动态值字段名 */
    key: string;
    /** 车型显示名（短标签） */
    label: string;
}

export type CompareReportRow = {
    key: string;
    group: string;
    name: string;
    hasDiff: boolean;
} & Record<string, unknown>;

export interface CompareReportInput {
    rows: CompareReportRow[];
    columns: CompareReportColumn[];
    generatedAt?: Date;
}

const EMPTY_TEXT = '-';
const cellText = (value: unknown): string => {
    const text = String(value ?? '').trim();
    return text === '' ? EMPTY_TEXT : text;
};

const diffCount = (rows: CompareReportRow[]) => rows.filter((r) => r.hasDiff).length;

/** 全空行（所有车型列都无值）不进报告 */
const isEmptyRow = (row: CompareReportRow, columns: CompareReportColumn[]) =>
    columns.every((c) => String(row[c.key] ?? '').trim() === '');

export const buildCompareReportHtml = ({ rows, columns, generatedAt = new Date() }: CompareReportInput): string => {
    const visible = rows.filter((r) => !isEmptyRow(r, columns));
    const total = visible.length;
    const diff = diffCount(visible);
    const same = total - diff;

    const { display, numbered, hasNumbered } = buildVehicleDisplayHeaders(columns.map((c) => c.label));

    const renderTable = (items: CompareReportRow[]) => buildReportTable({
        headers: ['分组', '参数名', ...display],
        // 分组/参数名收窄为固定宽度，车型列平分剩余宽度，两两对齐便于逐列对比
        widths: ['72px', '18%', ...columns.map(() => undefined)],
        bodyRows: items.map((row) => {
            const required = isFieldRequired(row.name)
                ? '<span class="rp-required">必填</span>'
                : '';
            const cells = columns
                .map((c) => {
                    const text = cellText(row[c.key]);
                    const miss = text === EMPTY_TEXT ? ' rp-val-miss' : '';
                    const cls = row.hasDiff ? ` class="rp-cell-diff${miss}"` : '';
                    return `<td${cls}>${escapeHtml(text)}</td>`;
                })
                .join('');
            return `<tr>
                <td class="rp-td-group">${escapeHtml(row.group)}</td>
                <td class="rp-td-name">${escapeHtml(row.name)}${required}</td>
                ${cells}
            </tr>`;
        }),
    });

    const diffItems = visible.filter((r) => r.hasDiff);
    const sameItems = visible.filter((r) => !r.hasDiff);

    // 超长车型名在表头里编号，完整名称在表格上方的对照图例中给出
    const legend = hasNumbered
        ? `<div class="rp-legend">${columns
            .map((c, i) => (numbered[i]
                ? `<div class="rp-legend-item"><b>${escapeHtml(numbered[i])}</b><span>${escapeHtml(c.label)}</span></div>`
                : ''))
            .join('')}</div>`
        : '';

    const content = `
    ${legend}
    ${buildReportSection(`差异项`, diff, renderTable(diffItems), 'warning')}
    ${buildReportSection(`一致项`, same, renderTable(sameItems), 'success')}`;

    return buildReportHtmlDocument({
        title: '车型参数对比分析报告',
        subtitle: '同一参数在所选车型间的取值对比，差异单元格以琥珀色标出',
        metaItems: [
            { label: '对比车型', value: hasNumbered ? `${columns.length} 款（车型对照见下）` : display.join(' vs ') },
        ],
        stats: [
            { label: '总参数', value: total, tone: 'brand' },
            { label: '差异项', value: diff, tone: 'warning' },
            { label: '一致项', value: same, tone: 'success' },
        ],
        content,
        generatedAt: formatReportTimestamp(generatedAt),
    });
};

export const buildCompareReportMarkdown = ({ rows, columns, generatedAt = new Date() }: CompareReportInput): string => {
    const visible = rows.filter((r) => !isEmptyRow(r, columns));
    const total = visible.length;
    const diff = diffCount(visible);
    const same = total - diff;

    const { display, numbered, hasNumbered } = buildVehicleDisplayHeaders(columns.map((c) => c.label));
    const headers = ['分组', '参数名', ...display];

    const renderTable = (items: CompareReportRow[]) => {
        if (items.length === 0) return '无数据。';
        const tableRows = items.map((row) => [
            escapeMarkdownCell(row.group),
            escapeMarkdownCell(isFieldRequired(row.name) ? `${row.name}（必填）` : row.name),
            ...columns.map((c) => escapeMarkdownCell(cellText(row[c.key]))),
        ]);
        return buildMarkdownTable(headers, tableRows);
    };

    const lines = [
        `# 车型参数对比分析报告`,
        '',
        `- 对比车型：${hasNumbered ? `${columns.length} 款` : display.join(' vs ')}`,
        ...columns
            .map((c, i) => (numbered[i] ? `  - ${numbered[i]}：${c.label}` : ''))
            .filter(Boolean),
        `- 生成时间：${formatReportTimestamp(generatedAt)}`,
        `- 工具：DST 车型参数管理工具`,
        '',
        `## 统计`,
        '',
        buildMarkdownTable(['指标', '数量'], [
            ['总参数', String(total)],
            ['差异项', String(diff)],
            ['一致项', String(same)],
        ]),
        '',
        `## 差异项（${diff}）`,
        '',
        renderTable(visible.filter((r) => r.hasDiff)),
        '',
        `## 一致项（${same}）`,
        '',
        renderTable(visible.filter((r) => !r.hasDiff)),
        '',
    ];
    return lines.join('\n');
};

export const exportCompareReport = async (format: ReportFormat, input: CompareReportInput): Promise<string> => {
    const generatedAt = input.generatedAt ?? new Date();
    const fileBase = buildReportFileBase(
        '车型参数对比报告',
        input.columns.map((c) => c.label).join('_vs_'),
        generatedAt,
    );
    if (format === 'md') {
        saveTextReport(`${fileBase}.md`, buildCompareReportMarkdown({ ...input, generatedAt }), 'text/markdown');
    } else {
        saveTextReport(`${fileBase}.html`, buildCompareReportHtml({ ...input, generatedAt }), 'text/html');
    }
    return format === 'md' ? `${fileBase}.md` : `${fileBase}.html`;
};
