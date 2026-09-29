/**
 * 报告导出共享基础设施：自包含 HTML 文档（曜蓝 Obsidian Blue 主题，内联 CSS、零外部依赖、
 * 自带打印样式可直接在浏览器里另存为 PDF）、Markdown 助手、文件保存。
 *
 * 三份报告共用本模块，报告本体见 compareReport.ts / diffReport.ts / assetUpgradeReport.ts。
 * 色值来源：docs/design-v4-obsidian-blue/tailwind.tokens.js（勿随意改）。
 */

export type ReportFormat = 'html' | 'md';

export const escapeHtml = (value: unknown): string =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

/** Markdown 表格单元格转义：竖线与换行会让表格断裂 */
export const escapeMarkdownCell = (value: unknown): string =>
    String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, '<br>');

const pad2 = (n: number) => String(n).padStart(2, '0');

export const formatReportTimestamp = (date: Date): string =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

export const formatReportDateSlug = (date: Date): string =>
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** 去掉文件系统非法字符（含控制字符），用于把车型名等拼进文件名 */
export const sanitizeFileName = (name: string): string =>
    Array.from(name)
        .filter((ch) => ch.charCodeAt(0) > 0x1f)
        .join('')
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

/** 拼文件名用的细节串，超长截断，避免多车型对比时超出文件系统上限 */
export const truncateFileNamePart = (part: string, max = 60): string => {
    const clean = sanitizeFileName(part);
    return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

export const buildReportFileBase = (prefix: string, detail: string, date: Date): string =>
    `${sanitizeFileName(prefix)}_${truncateFileNamePart(detail)}_${formatReportDateSlug(date)}`;

/**
 * 浏览器标准下载，Tauri WKWebView / WebView2 均可用（与 downloadCsv.ts 同一机制）。
 * HTML/MD 不加 BOM（那是给 Excel 识别 CSV 用的）。
 */
export const saveTextReport = (fileName: string, content: string, mime: string): void => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 100);
};

/** 生成 Markdown 表格；cells 需已用 escapeMarkdownCell 转义 */
export const buildMarkdownTable = (headers: string[], rows: string[][]): string => {
    const headerLine = `| ${headers.join(' | ')} |`;
    const divider = `| ${headers.map(() => '---').join(' | ')} |`;
    const bodyLines = rows.map((row) => `| ${headers.map((_, i) => row[i] ?? '').join(' | ')} |`);
    return [headerLine, divider, ...bodyLines].join('\n');
};

export interface ReportStatItem {
    label: string;
    value: number;
    /** 语义色：brand 曜蓝 / success 松绿 / warning 琥珀 / danger 茜红 / asset 资产紫 / neutral 岩灰 */
    tone?: 'brand' | 'success' | 'warning' | 'danger' | 'asset' | 'neutral';
}

export interface ReportDocOptions {
    title: string;
    subtitle?: string;
    metaItems: { label: string; value: string }[];
    stats?: ReportStatItem[];
    /** 各 <section class="rp-section">…</section>，由调用方完成转义 */
    content: string;
    generatedAt: string;
    footerNote?: string;
}

export const buildReportStatCards = (stats: ReportStatItem[]): string => {
    if (stats.length === 0) return '';
    const cards = stats
        .map((s) => `
        <div class="rp-stat-card is-${s.tone ?? 'neutral'}">
            <div class="rp-stat-value">${s.value}</div>
            <div class="rp-stat-label">${escapeHtml(s.label)}</div>
        </div>`)
        .join('');
    return `<div class="rp-stats">${cards}</div>`;
};

/** 章节标题，accent 用语义图形色（tokens 里的 500 阶） */
export const buildReportSection = (
    title: string,
    count: number,
    body: string,
    accent: 'brand' | 'success' | 'warning' | 'danger' | 'asset' | 'info' = 'brand',
): string => {
    const accents = {
        brand: '#4D64E9', success: '#0C9A68', warning: '#E8930C',
        danger: '#E5484D', asset: '#7048C8', info: '#0E7C8C',
    } as const;
    return `
    <section class="rp-section" style="--rp-accent:${accents[accent]}">
        <h2 class="rp-section-title">${escapeHtml(title)}<span class="rp-count">${count}</span></h2>
        ${body}
    </section>`;
};

/** 表格统一包上横向滚动容器：桌面端无变化，窄屏（手机）可左右滑动而不撑破页面 */
export const wrapReportTable = (tableHtml: string): string =>
    `<div class="rp-table-scroll">${tableHtml}</div>`;

export interface ReportTableSpec {
    headers: string[];
    /** 每列宽度（CSS 值，如 '72px'、'18%'）；undefined 的列平分剩余宽度 */
    widths: (string | undefined)[];
    /** 已转义的 <tr> 行 */
    bodyRows: string[];
    emptyText?: string;
}

/**
 * 固定布局表格：table-layout fixed + colgroup 显式列宽，
 * 避免长表头/长值把某些列撑爆、其余列被挤成竖排（auto 布局的通病）。
 */
export const buildReportTable = (spec: ReportTableSpec): string => {
    const colgroup = `<colgroup>${spec.widths
        .map((w) => `<col${w ? ` style="width:${w}"` : ''}>`)
        .join('')}</colgroup>`;
    const head = spec.headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('');
    const body = spec.bodyRows.length > 0
        ? spec.bodyRows.join('')
        : `<tr><td class="rp-empty-cell" colspan="${spec.headers.length}">${escapeHtml(spec.emptyText ?? '无数据')}</td></tr>`;
    return wrapReportTable(`<table class="rp-table">
        ${colgroup}
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
    </table>`);
};

/**
 * 车型列显示名：超长的公告全名编号为「车型 N」，避免表头占满整行。
 * 返回每列显示名、编号映射（仅超长者）与整体是否启用编号。
 */
export const VEHICLE_LABEL_MAX = 14;
export const buildVehicleDisplayHeaders = (labels: string[]): {
    display: string[];
    numbered: (string | null)[];
    hasNumbered: boolean;
} => {
    const numbered = labels.map((l, i) => (l.length > VEHICLE_LABEL_MAX ? `车型 ${i + 1}` : null));
    return {
        display: labels.map((l, i) => numbered[i] ?? l),
        numbered,
        hasNumbered: numbered.some(Boolean),
    };
};

const REPORT_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
    margin: 0; background: #F1F3F6; color: #262B38;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
    font-size: 14px; line-height: 1.65; -webkit-font-smoothing: antialiased;
}
.rp-page { max-width: 1080px; margin: 24px auto; background: #fff; border: 1px solid #E4E7EC; border-radius: 12px; padding: 40px 48px 28px; }
.rp-header { border-bottom: 3px solid #2F44D8; padding-bottom: 18px; margin-bottom: 20px; }
.rp-brand { display: inline-block; font-size: 11px; font-weight: 600; color: #2F44D8; background: #EFF3FE; border: 1px solid #E2E8FD; border-radius: 999px; padding: 2px 10px; letter-spacing: .06em; margin-bottom: 12px; }
.rp-title { margin: 0; font-size: 25px; font-weight: 700; color: #1A1D26; letter-spacing: .01em; }
.rp-subtitle { margin: 6px 0 0; color: #6B7280; font-size: 13px; }
.rp-meta { display: flex; flex-wrap: wrap; gap: 6px 20px; margin-top: 14px; font-size: 12px; color: #4B5261; }
.rp-meta-label { color: #9AA1AF; margin-right: 6px; }
.rp-meta-item b { color: #262B38; font-weight: 600; word-break: break-all; }
.rp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 12px; margin: 18px 0 4px; }
.rp-stat-card { border-radius: 10px; padding: 13px 16px; border: 1px solid #E4E7EC; background: #F7F8FA; }
.rp-stat-value { font-size: 26px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; color: #262B38; }
.rp-stat-label { font-size: 12px; margin-top: 3px; color: #6B7280; }
.rp-stat-card.is-brand { background: #EFF3FE; border-color: #E2E8FD; } .rp-stat-card.is-brand .rp-stat-value { color: #2F44D8; }
.rp-stat-card.is-success { background: #E9F7F0; border-color: #CDEBDD; } .rp-stat-card.is-success .rp-stat-value { color: #0A7A52; }
.rp-stat-card.is-warning { background: #FEF4E2; border-color: #F6E3C3; } .rp-stat-card.is-warning .rp-stat-value { color: #9A5806; }
.rp-stat-card.is-danger { background: #FDECEC; border-color: #F5D4D4; } .rp-stat-card.is-danger .rp-stat-value { color: #C92A2A; }
.rp-stat-card.is-asset { background: #F0EBFB; border-color: #DDD2F2; } .rp-stat-card.is-asset .rp-stat-value { color: #7048C8; }
.rp-section { margin-top: 28px; }
.rp-section-title { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; font-size: 15px; font-weight: 700; color: #1A1D26; }
.rp-section-title::before { content: ''; width: 4px; height: 15px; border-radius: 2px; background: var(--rp-accent, #2F44D8); }
.rp-count { font-size: 11px; font-weight: 600; color: #4B5261; background: #F1F3F6; border: 1px solid #E4E7EC; border-radius: 999px; padding: 0 8px; line-height: 18px; }
.rp-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12.5px; min-width: 640px; table-layout: fixed; }
/* 手机端：表格放在可横向滚动的容器里，不撑破页面 */
.rp-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.rp-table th { background: #F7F8FA; color: #4B5261; font-size: 11.5px; font-weight: 600; text-align: left; padding: 7px 10px; border: 1px solid #E4E7EC; word-break: break-word; }
.rp-table td { padding: 6px 10px; border: 1px solid #E4E7EC; vertical-align: top; word-break: break-word; white-space: pre-wrap; }
.rp-table tbody tr:nth-child(even) { background: #FAFBFC; }
.rp-td-group { color: #6B7280; white-space: nowrap; }
.rp-td-name { font-weight: 600; color: #1A1D26; }
.rp-cell-diff { background: #FEF4E2; }
.rp-val-old { color: #9AA1AF; text-decoration: line-through; text-decoration-color: #E5484D; }
.rp-val-new { color: #0A7A52; font-weight: 600; }
.rp-val-miss { color: #9AA1AF; }
.rp-required { display: inline-block; margin-left: 6px; font-size: 10.5px; font-weight: 600; color: #9A5806; background: #FEF4E2; border: 1px solid #F6E3C3; border-radius: 4px; padding: 0 5px; vertical-align: 1px; }
.rp-banner { margin: 16px 0 0; padding: 10px 14px; border-radius: 8px; background: #FEF4E2; border: 1px solid #F6E3C3; color: #9A5806; font-size: 12.5px; }
.rp-banner strong { color: #B96F07; }
.rp-legend { margin: 14px 0 0; padding: 10px 14px; background: #F7F8FA; border: 1px solid #E4E7EC; border-radius: 8px; font-size: 12px; color: #4B5261; display: flex; flex-direction: column; gap: 4px; }
.rp-legend-item { display: flex; gap: 10px; align-items: baseline; }
.rp-legend-item b { color: #2F44D8; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.rp-legend-item span { word-break: break-all; }
.rp-empty-cell { text-align: center; color: #9AA1AF; padding: 18px; }
.rp-footer { margin-top: 36px; padding-top: 12px; border-top: 1px solid #E4E7EC; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; color: #9AA1AF; font-size: 11px; }
@media print {
    @page { size: A4; margin: 12mm; }
    body { background: #fff; }
    .rp-page { max-width: none; margin: 0; border: 0; border-radius: 0; padding: 0; }
    .rp-table-scroll { overflow-x: visible; }
    .rp-table thead { display: table-header-group; }
    .rp-table tr, .rp-stat-card { break-inside: avoid; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
@media (max-width: 640px) {
    body { background: #fff; }
    .rp-page { margin: 0; border: 0; border-radius: 0; padding: 24px 16px 20px; }
    .rp-title { font-size: 21px; }
    .rp-meta { gap: 4px 14px; }
    .rp-stats { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .rp-stat-value { font-size: 22px; }
    .rp-footer { flex-direction: column; }
}
`;

export const buildReportHtmlDocument = (options: ReportDocOptions): string => {
    const meta = options.metaItems
        .map((m) => `<span class="rp-meta-item"><span class="rp-meta-label">${escapeHtml(m.label)}</span><b>${escapeHtml(m.value)}</b></span>`)
        .join('');
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<article class="rp-page">
    <header class="rp-header">
        <div class="rp-brand">DST 车型参数管理工具</div>
        <h1 class="rp-title">${escapeHtml(options.title)}</h1>
        ${options.subtitle ? `<p class="rp-subtitle">${escapeHtml(options.subtitle)}</p>` : ''}
        <div class="rp-meta">${meta}</div>
    </header>
    ${buildReportStatCards(options.stats ?? [])}
    ${options.content}
    <footer class="rp-footer">
        <span>${escapeHtml(options.footerNote ?? 'DST 车型参数管理工具')}</span>
        <span>生成时间 ${escapeHtml(options.generatedAt)} · 自包含单文件，可直接用浏览器打开或打印为 PDF</span>
    </footer>
</article>
</body>
</html>`;
};
