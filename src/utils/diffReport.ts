/**
 * 参数差分报告（版本对比模块：基准文件 vs 目标文件）的 HTML / Markdown 构建。
 * 纯函数；同时收敛了 DiffResultView 使用的去重计数助手。
 */
import type { DiffResult, VehicleParameter } from '../types';
import { APP_NAME } from '../constants/app';
import { isFieldRequired } from '../assets/requiredFields';
import {
    buildMarkdownTable,
    buildReportFileBase,
    buildReportHtmlDocument,
    buildReportSection,
    buildReportTable,
    escapeHtml,
    escapeMarkdownCell,
    formatReportTimestamp,
    saveTextReport,
    type ReportFormat,
} from './reportExport';

export interface DiffReportInput {
    result: DiffResult;
    baseFileName: string;
    targetFileName: string;
    /** 对比模式说明，如「仅公告号数据对比」 */
    modeLabel?: string;
    generatedAt?: Date;
}

const EMPTY_TEXT = '-';
const text = (value: string | number | undefined): string => {
    const s = String(value ?? '').trim();
    return s === '' ? EMPTY_TEXT : s;
};

/** 透视解析可能把同一参数拆成多行（不同 Sheet/产品），按 Sheet+分组+参数名 去重后计数 */
export const countUniqueParameters = (items: VehicleParameter[]): number => {
    const keys = new Set<string>();
    items.forEach((item) => {
        keys.add(`${item.originSheet || ''}::${item.group}::${item.name}`);
    });
    return keys.size;
};

export const countUniqueModified = (
    items: { oldParam: VehicleParameter }[],
): number => countUniqueParameters(items.map((m) => m.oldParam));

export const buildDiffReportHtml = ({
    result,
    baseFileName,
    targetFileName,
    modeLabel,
    generatedAt = new Date(),
}: DiffReportInput): string => {
    const { added, removed, modified, unchanged } = result;

    const renderTable = (headers: string[], widths: (string | undefined)[], rows: string[]) =>
        buildReportTable({ headers, widths, bodyRows: rows, emptyText: '无数据' });

    const modifiedRows = modified.map((m) => {
        const nameCell = m.oldParam.name === m.newParam.name
            ? escapeHtml(m.oldParam.name)
            : `${escapeHtml(m.oldParam.name)}<br><span class="rp-val-miss">→ ${escapeHtml(m.newParam.name)}</span>`;
        const requiredMark = isFieldRequired(m.oldParam.name) || isFieldRequired(m.newParam.name)
            ? '<span class="rp-required">必填</span>'
            : '';
        return `<tr>
            <td class="rp-td-group">${escapeHtml(text(m.oldParam.productName || '通用'))}</td>
            <td class="rp-td-group">${escapeHtml(m.oldParam.group)}</td>
            <td class="rp-td-name">${nameCell}${requiredMark}</td>
            <td class="rp-val-old">${escapeHtml(text(m.oldParam.value))}</td>
            <td class="rp-val-new">${escapeHtml(text(m.newParam.value))}</td>
        </tr>`;
    });

    const addedRows = added.map((p) => `<tr>
        <td class="rp-td-group">${escapeHtml(p.group)}</td>
        <td class="rp-td-name">${escapeHtml(p.name)}</td>
        <td>${escapeHtml(text(p.value))}</td>
    </tr>`);

    const removedRows = removed.map((p) => `<tr>
        <td class="rp-td-group">${escapeHtml(p.group)}</td>
        <td class="rp-td-name">${escapeHtml(p.name)}</td>
        <td class="rp-val-old">${escapeHtml(text(p.value))}</td>
    </tr>`);

    const content = [
        buildReportSection(
            '变更参数',
            countUniqueModified(modified),
            renderTable(
                ['适用车型', '分组', '参数名', '基准值', '新版本值'],
                ['88px', '72px', '18%', undefined, undefined],
                modifiedRows,
            ),
            'warning',
        ),
        buildReportSection(
            '新增参数',
            countUniqueParameters(added),
            renderTable(['分组', '参数名', '值'], ['72px', '18%', undefined], addedRows),
            'success',
        ),
        buildReportSection(
            '移除参数',
            countUniqueParameters(removed),
            renderTable(['分组', '参数名', '值'], ['72px', '18%', undefined], removedRows),
            'danger',
        ),
    ].join('');

    return buildReportHtmlDocument({
        title: '车辆参数对比报告',
        subtitle: '基准文件与目标文件的参数差分明细',
        metaItems: [
            { label: '基准文件', value: baseFileName },
            { label: '对比文件', value: targetFileName },
            ...(modeLabel ? [{ label: '对比模式', value: modeLabel }] : []),
        ],
        stats: [
            { label: '新增参数', value: countUniqueParameters(added), tone: 'success' },
            { label: '移除参数', value: countUniqueParameters(removed), tone: 'danger' },
            { label: '变更参数', value: countUniqueModified(modified), tone: 'warning' },
            { label: '未变参数', value: countUniqueParameters(unchanged), tone: 'neutral' },
        ],
        content,
        generatedAt: formatReportTimestamp(generatedAt),
    });
};

export const buildDiffReportMarkdown = ({
    result,
    baseFileName,
    targetFileName,
    modeLabel,
    generatedAt = new Date(),
}: DiffReportInput): string => {
    const { added, removed, modified, unchanged } = result;

    const modifiedTable = buildMarkdownTable(
        ['产品', '分组', '参数名', '基准值', '新版本值'],
        modified.map((m) => [
            escapeMarkdownCell(text(m.oldParam.productName || '通用')),
            escapeMarkdownCell(m.oldParam.group),
            escapeMarkdownCell(
                m.oldParam.name === m.newParam.name ? m.oldParam.name : `${m.oldParam.name} → ${m.newParam.name}`,
            ),
            escapeMarkdownCell(text(m.oldParam.value)),
            escapeMarkdownCell(text(m.newParam.value)),
        ]),
    );

    const addedTable = buildMarkdownTable(
        ['分组', '参数名', '值'],
        added.map((p) => [
            escapeMarkdownCell(p.group),
            escapeMarkdownCell(p.name),
            escapeMarkdownCell(text(p.value)),
        ]),
    );

    const removedTable = buildMarkdownTable(
        ['分组', '参数名', '值'],
        removed.map((p) => [
            escapeMarkdownCell(p.group),
            escapeMarkdownCell(p.name),
            escapeMarkdownCell(text(p.value)),
        ]),
    );

    const lines = [
        `# 车辆参数对比报告`,
        '',
        `- 基准文件：${baseFileName}`,
        `- 对比文件：${targetFileName}`,
        ...(modeLabel ? [`- 对比模式：${modeLabel}`] : []),
        `- 生成时间：${formatReportTimestamp(generatedAt)}`,
        `- 工具：${APP_NAME}`,
        '',
        `## 统计`,
        '',
        buildMarkdownTable(['指标', '数量'], [
            ['新增参数', String(countUniqueParameters(added))],
            ['移除参数', String(countUniqueParameters(removed))],
            ['变更参数', String(countUniqueModified(modified))],
            ['未变参数', String(countUniqueParameters(unchanged))],
        ]),
        '',
        `## 变更参数（${countUniqueModified(modified)}）`,
        '',
        modified.length > 0 ? modifiedTable : '无变更。',
        '',
        `## 新增参数（${countUniqueParameters(added)}）`,
        '',
        added.length > 0 ? addedTable : '无新增。',
        '',
        `## 移除参数（${countUniqueParameters(removed)}）`,
        '',
        removed.length > 0 ? removedTable : '无移除。',
        '',
    ];
    return lines.join('\n');
};

export const exportDiffReport = async (format: ReportFormat, input: DiffReportInput): Promise<string> => {
    const generatedAt = input.generatedAt ?? new Date();
    const fileBase = buildReportFileBase(
        '车辆参数对比报告',
        `${input.baseFileName}_vs_${input.targetFileName}`,
        generatedAt,
    );
    if (format === 'md') {
        saveTextReport(`${fileBase}.md`, buildDiffReportMarkdown({ ...input, generatedAt }), 'text/markdown');
    } else {
        saveTextReport(`${fileBase}.html`, buildDiffReportHtml({ ...input, generatedAt }), 'text/html');
    }
    return format === 'md' ? `${fileBase}.md` : `${fileBase}.html`;
};
