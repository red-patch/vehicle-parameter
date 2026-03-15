import type { AssetUpgradeDraft } from '../types';
import type { AssetUpgradePreview } from './assetUpgrade';

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

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const renderSummaryCard = (label: string, value: number, color: string, background: string, border: string) => `
    <div style="flex:1;min-width:140px;padding:12px 14px;background:${background};border:1px solid ${border};border-radius:10px;">
        <div style="font-size:26px;font-weight:700;color:${color};line-height:1;">${value}</div>
        <div style="font-size:12px;color:#666;margin-top:6px;">${label}</div>
    </div>
`;

const buildReviewHtml = (draft: AssetUpgradeDraft, preview: AssetUpgradePreview, exportedAt: string) => {
    const pendingWarning = preview.summary.pendingCount > 0
        ? `
            <div style="margin:0 0 18px;padding:12px 14px;border-radius:10px;background:#fff7e6;border:1px solid #ffd591;color:#ad6800;font-size:12px;line-height:1.7;">
                当前仍有 <strong>${preview.summary.pendingCount}</strong> 个冲突字段未决策。
                本审查单仅供预览与沟通，不建议直接执行覆盖保存。
            </div>
        `
        : '';

    const detailRows = preview.items.length > 0
        ? preview.items.map((item) => `
            <tr>
                <td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;background:#fafafa;">${escapeHtml(item.group || '-')}</td>
                <td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;font-weight:600;">${escapeHtml(item.fieldName || '-')}</td>
                <td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;">${escapeHtml(item.oldValue || '空值')}</td>
                <td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;">${escapeHtml(item.newValue || '空值')}</td>
                <td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;background:${item.changed ? '#f6ffed' : '#ffffff'};">${escapeHtml(item.finalValue || '空值')}</td>
                <td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;">${CATEGORY_LABELS[item.category]}</td>
                <td style="padding:6px 8px;border:1px solid #d9d9d9;font-size:11px;">${DECISION_LABELS[item.decision]}</td>
            </tr>
        `).join('')
        : `
            <tr>
                <td colspan="7" style="padding:16px;border:1px solid #d9d9d9;font-size:12px;text-align:center;color:#999;">
                    当前无需要审查的变更明细
                </td>
            </tr>
        `;

    return `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB',sans-serif;padding:28px;background:#fff;width:1100px;color:#1f2937;">
            <h1 style="margin:0 0 6px;font-size:22px;text-align:center;color:#111827;">资产升级审查单</h1>
            <p style="margin:0 0 20px;text-align:center;color:#6b7280;font-size:12px;">导出时间：${exportedAt}</p>

            <div style="display:flex;gap:16px;margin-bottom:18px;">
                <div style="flex:1;padding:14px;border:1px solid #e5e7eb;border-radius:10px;background:#f8fafc;">
                    <div style="font-size:12px;color:#64748b;margin-bottom:6px;">基线资产</div>
                    <div style="font-size:14px;font-weight:700;color:#111827;">${escapeHtml(draft.assetFileName)}</div>
                    <div style="font-size:12px;color:#475569;margin-top:6px;">车型：${escapeHtml(draft.assetProductName)}</div>
                </div>
                <div style="flex:1;padding:14px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;">
                    <div style="font-size:12px;color:#2563eb;margin-bottom:6px;">导入新版文件</div>
                    <div style="font-size:14px;font-weight:700;color:#1d4ed8;">${escapeHtml(draft.importedFileName)}</div>
                    <div style="font-size:12px;color:#475569;margin-top:6px;">建议保存标签：资产升级 / 厂商更新</div>
                </div>
            </div>

            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
                ${renderSummaryCard('总字段项', preview.summary.totalItems, '#111827', '#f8fafc', '#e5e7eb')}
                ${renderSummaryCard('使用新版', preview.summary.useNewCount, '#166534', '#f0fdf4', '#bbf7d0')}
                ${renderSummaryCard('保留旧值', preview.summary.keepOldCount, '#1d4ed8', '#eff6ff', '#bfdbfe')}
                ${renderSummaryCard('仍待决策', preview.summary.pendingCount, '#b45309', '#fffbeb', '#fde68a')}
                ${renderSummaryCard('实际发生变更', preview.summary.changedCount, '#7c3aed', '#f5f3ff', '#ddd6fe')}
            </div>

            ${pendingWarning}

            <div style="margin-bottom:12px;font-size:14px;font-weight:700;color:#111827;">变更审查明细</div>
            <table style="border-collapse:collapse;width:100%;table-layout:fixed;">
                <thead>
                    <tr>
                        <th style="padding:8px;border:1px solid #d9d9d9;background:#f8fafc;font-size:12px;">分组</th>
                        <th style="padding:8px;border:1px solid #d9d9d9;background:#f8fafc;font-size:12px;">字段</th>
                        <th style="padding:8px;border:1px solid #d9d9d9;background:#f8fafc;font-size:12px;">旧值</th>
                        <th style="padding:8px;border:1px solid #d9d9d9;background:#f8fafc;font-size:12px;">新值</th>
                        <th style="padding:8px;border:1px solid #d9d9d9;background:#f8fafc;font-size:12px;">最终值</th>
                        <th style="padding:8px;border:1px solid #d9d9d9;background:#f8fafc;font-size:12px;">分类</th>
                        <th style="padding:8px;border:1px solid #d9d9d9;background:#f8fafc;font-size:12px;">决策</th>
                    </tr>
                </thead>
                <tbody>${detailRows}</tbody>
            </table>
        </div>
    `;
};

export const exportAssetUpgradeReviewPdf = async (draft: AssetUpgradeDraft, preview: AssetUpgradePreview) => {
    const { default: html2canvas } = await import('html2canvas');
    const { default: jsPDF } = await import('jspdf');

    const now = new Date();
    const exportedAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const reportHtml = buildReviewHtml(draft, preview, exportedAt);

    const container = document.createElement('div');
    container.innerHTML = reportHtml;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    try {
        const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
            scale: 1.5,
            useCORS: true,
            backgroundColor: '#ffffff',
        });

        const imgWidth = 277;
        const pageHeightMm = 190;
        const ratio = canvas.width / imgWidth;
        const pageHeightPx = pageHeightMm * ratio;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const totalPages = Math.ceil(canvas.height / pageHeightPx);

        for (let page = 0; page < totalPages; page += 1) {
            if (page > 0) {
                doc.addPage();
            }

            const cropY = page * pageHeightPx;
            const cropH = Math.min(pageHeightPx, canvas.height - cropY);
            const pageCanvas = document.createElement('canvas');
            pageCanvas.width = canvas.width;
            pageCanvas.height = cropH;
            const ctx = pageCanvas.getContext('2d');
            if (!ctx) {
                throw new Error('无法创建 PDF 页面上下文');
            }

            ctx.drawImage(canvas, 0, cropY, canvas.width, cropH, 0, 0, canvas.width, cropH);
            const pageImg = pageCanvas.toDataURL('image/jpeg', 0.78);
            const pageImgHeight = (cropH * imgWidth) / canvas.width;
            doc.addImage(pageImg, 'JPEG', 10, 10, imgWidth, pageImgHeight);
        }

        const fileName = `资产升级审查单_${draft.assetProductName}_${now.toISOString().slice(0, 10)}.pdf`;
        doc.save(fileName);
        return fileName;
    } finally {
        document.body.removeChild(container);
    }
};
