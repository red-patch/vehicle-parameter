/**
 * 资产升级审查单（资产库 · 升级流程）的 HTML / Markdown 构建与导出。
 */
import type { AssetUpgradeDraft } from '../types';
import { APP_NAME } from '../constants/app';
import type { AssetUpgradePreview } from './assetUpgrade';
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

const CATEGORY_LABELS = {
    same: '一致',
    new_field: '新增字段',
    fill_empty: '空值补全',
    conflict: '冲突字段',
    old_only: '仅旧资产存在',
} as const;

const DECISION_LABELS = {
    keep_old: '保留旧值',
    use_new: '使用新版',
    pending: '稍后处理',
} as const;

const EMPTY_TEXT = '-';
const text = (value: string | undefined): string => {
    const s = String(value ?? '').trim();
    return s === '' ? EMPTY_TEXT : s;
};

export interface AssetUpgradeReviewInput {
    draft: AssetUpgradeDraft;
    preview: AssetUpgradePreview;
    generatedAt?: Date;
}

export const buildAssetUpgradeReviewHtml = ({
    draft,
    preview,
    generatedAt = new Date(),
}: AssetUpgradeReviewInput): string => {
    const { summary, items } = preview;

    const pendingWarning = summary.pendingCount > 0
        ? `<p class="rp-banner">当前仍有 <strong>${summary.pendingCount}</strong> 个冲突字段未决策。本审查单仅供预览与沟通，不建议直接执行覆盖保存。</p>`
        : '';

    const detailRows = items.map((item) => `<tr>
            <td class="rp-td-group">${escapeHtml(text(item.group))}</td>
            <td class="rp-td-name">${escapeHtml(text(item.fieldName))}</td>
            <td class="rp-val-old">${escapeHtml(text(item.oldValue))}</td>
            <td>${escapeHtml(text(item.newValue))}</td>
            <td class="${item.changed ? 'rp-val-new' : ''}">${escapeHtml(text(item.finalValue))}</td>
            <td>${escapeHtml(CATEGORY_LABELS[item.category])}</td>
            <td>${escapeHtml(DECISION_LABELS[item.decision])}</td>
        </tr>`);

    const detailTable = buildReportTable({
        headers: ['分组', '字段', '旧值', '新值', '最终值', '分类', '决策'],
        widths: ['72px', '18%', undefined, undefined, undefined, '72px', '72px'],
        bodyRows: detailRows,
        emptyText: '当前无需要审查的变更明细',
    });

    const content = `
    ${pendingWarning}
    ${buildReportSection('变更审查明细', items.length, detailTable, 'asset')}`;

    return buildReportHtmlDocument({
        title: '资产升级审查单',
        subtitle: '资产与厂商新版文件的字段级差异审查',
        metaItems: [
            { label: '基线资产', value: draft.assetFileName },
            { label: '车型', value: draft.assetProductName },
            { label: '导入新版', value: draft.importedFileName },
            { label: '建议保存标签', value: '资产升级 / 厂商更新' },
        ],
        stats: [
            { label: '总字段项', value: summary.totalItems, tone: 'neutral' },
            { label: '使用新版', value: summary.useNewCount, tone: 'success' },
            { label: '保留旧值', value: summary.keepOldCount, tone: 'brand' },
            { label: '仍待决策', value: summary.pendingCount, tone: 'warning' },
            { label: '实际发生变更', value: summary.changedCount, tone: 'asset' },
        ],
        content,
        generatedAt: formatReportTimestamp(generatedAt),
    });
};

export const buildAssetUpgradeReviewMarkdown = ({
    draft,
    preview,
    generatedAt = new Date(),
}: AssetUpgradeReviewInput): string => {
    const { summary, items } = preview;

    const detailTable = buildMarkdownTable(
        ['分组', '字段', '旧值', '新值', '最终值', '分类', '决策'],
        items.map((item) => [
            escapeMarkdownCell(text(item.group)),
            escapeMarkdownCell(text(item.fieldName)),
            escapeMarkdownCell(text(item.oldValue)),
            escapeMarkdownCell(text(item.newValue)),
            escapeMarkdownCell(text(item.finalValue)),
            CATEGORY_LABELS[item.category],
            DECISION_LABELS[item.decision],
        ]),
    );

    const lines = [
        `# 资产升级审查单`,
        '',
        `- 基线资产：${draft.assetFileName}`,
        `- 车型：${draft.assetProductName}`,
        `- 导入新版：${draft.importedFileName}`,
        `- 生成时间：${formatReportTimestamp(generatedAt)}`,
        `- 工具：${APP_NAME}`,
        '',
        `## 统计`,
        '',
        buildMarkdownTable(['指标', '数量'], [
            ['总字段项', String(summary.totalItems)],
            ['使用新版', String(summary.useNewCount)],
            ['保留旧值', String(summary.keepOldCount)],
            ['仍待决策', String(summary.pendingCount)],
            ['实际发生变更', String(summary.changedCount)],
        ]),
        '',
        ...(summary.pendingCount > 0
            ? [`> 当前仍有 ${summary.pendingCount} 个冲突字段未决策。本审查单仅供预览与沟通，不建议直接执行覆盖保存。`, '']
            : []),
        `## 变更审查明细（${items.length}）`,
        '',
        items.length > 0 ? detailTable : '当前无需要审查的变更明细。',
        '',
    ];
    return lines.join('\n');
};

export const exportAssetUpgradeReviewReport = async (
    draft: AssetUpgradeDraft,
    preview: AssetUpgradePreview,
    format: ReportFormat,
): Promise<string> => {
    const generatedAt = new Date();
    const fileBase = buildReportFileBase('资产升级审查单', draft.assetProductName, generatedAt);
    if (format === 'md') {
        saveTextReport(`${fileBase}.md`, buildAssetUpgradeReviewMarkdown({ draft, preview, generatedAt }), 'text/markdown');
    } else {
        saveTextReport(`${fileBase}.html`, buildAssetUpgradeReviewHtml({ draft, preview, generatedAt }), 'text/html');
    }
    return format === 'md' ? `${fileBase}.md` : `${fileBase}.html`;
};
