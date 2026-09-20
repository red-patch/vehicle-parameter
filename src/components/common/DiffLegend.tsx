import React from 'react';

const ITEMS = [
    { label: '新增', bar: 'diff-added' },
    { label: '移除', bar: 'diff-removed' },
    { label: '变更', bar: 'diff-modified' },
    { label: '一致', bar: 'diff-same' },
] as const;

/**
 * 差异四态色彩图例。
 * 行业惯例（Microsoft Spreadsheet Compare 等）：结果页常驻图例，
 * 颜色含义显式可查，不靠用户猜测。色值来自 --diff-* 业务 token。
 */
const DiffLegend: React.FC = () => (
    <div className="flex items-center gap-2.5 shrink-0" aria-label="差异状态图例">
        {ITEMS.map(it => (
            <span key={it.label} className="flex items-center gap-1 text-xs text-3">
                <span className={`legend-bar ${it.bar}`} />
                {it.label}
            </span>
        ))}
    </div>
);

export default DiffLegend;
