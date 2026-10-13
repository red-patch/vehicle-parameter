import React from 'react';
import { Input, Button } from 'antd';
import { SearchOutlined, ClearOutlined } from '@ant-design/icons';
import type { FacetSelection } from '../../../utils/facetFilters';
import { isFacetSelectionActive } from '../../../utils/facetFilters';

/**
 * 中间顶部筛选条（设计文档 2026-10-13-asset-panel-redesign-v2 §4.2.1）：
 * 搜索框 + facet chip（电量/准入公告/电池品牌/标签/状态）+ 清空按钮
 *
 * M1 静态骨架：渲染结构，facet 下拉面板在 M2 接入。
 */
export interface AssetFilterBarProps {
    searchKeyword: string;
    onSearchKeywordChange: (v: string) => void;
    facetSelection: FacetSelection;
    onFacetSelectionChange: (sel: FacetSelection) => void;
    onClearAll: () => void;
}

interface FilterChipProps {
    label: string;
    active?: boolean;
    count?: number;
    onClick?: () => void;
}

const FilterChip: React.FC<FilterChipProps> = ({ label, active, count, onClick }) => (
    <div
        className={`
            px-3 py-1.5 rounded-lg border text-[12px] font-medium cursor-pointer
            flex items-center gap-1.5 whitespace-nowrap transition-all
            ${active
                ? 'bg-[var(--brand-weak)] border-[var(--brand)] text-[var(--brand)] font-semibold shadow-[0_0_0_1px_var(--brand)]'
                : 'bg-[var(--surface)] border-[var(--border)] text-2 hover:border-[var(--brand)] hover:text-[var(--brand)] hover:bg-[var(--brand-weak)]'
            }
        `}
        onClick={onClick}
    >
        {label}
        {count !== undefined && count > 0 && <span>({count})</span>}
        <span className="text-[8px] transition-transform hover:translate-y-[1px]">▾</span>
    </div>
);

const AssetFilterBar: React.FC<AssetFilterBarProps> = ({
    searchKeyword,
    onSearchKeywordChange,
    facetSelection,
    onFacetSelectionChange: _onFacetSelectionChange,
    onClearAll,
}) => {
    const hasActiveFilters = Boolean(searchKeyword.trim()) || isFacetSelectionActive(facetSelection);

    return (
        <div className="flex-none bg-[var(--surface)] border-b border-[var(--border)] px-5 py-3.5 flex items-center gap-2 shadow-[var(--shadow-sm)]">
            <Input
                className="flex-1 min-w-[200px]"
                placeholder="搜名字/公告号/标签..."
                prefix={<SearchOutlined className="text-3" />}
                allowClear
                value={searchKeyword}
                onChange={e => onSearchKeywordChange(e.target.value)}
            />
            {/* M2: facet chip 下拉面板接入 */}
            <FilterChip label="电量" />
            <FilterChip label="准入公告" />
            <FilterChip label="电池品牌" />
            <FilterChip label="标签" />
            <FilterChip label="状态" />
            {hasActiveFilters && (
                <Button
                    size="small"
                    icon={<ClearOutlined />}
                    onClick={onClearAll}
                    className="flex-shrink-0"
                >
                    清空
                </Button>
            )}
        </div>
    );
};

export default AssetFilterBar;
