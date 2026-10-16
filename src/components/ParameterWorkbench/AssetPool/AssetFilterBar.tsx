import React, { useMemo, useState } from 'react';
import { Input, Button, Popover, Tag, InputNumber, Tooltip } from 'antd';
import { ClearOutlined, CaretDownOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import {
    FACET_NONE, collectFacetValues, countFacetValues, toggleFacetValue,
    isFacetSelectionActive, type FacetSelection, type FacetDim,
} from '../../../utils/facetFilters';
import SearchInput from '../../common/SearchInput';
import type { FacetVocab, ResolvedFacets } from '../../../utils/assetFacets';
import type { StatusFilter } from './AssetPoolLayout';

/**
 * 中间顶部筛选条（设计文档 2026-10-13-asset-panel-redesign-v2 §4.2.1）：
 * 搜索框 + facet chip（电量/准入公告/电池品牌/标签/状态）+ 清空按钮。
 * 公告号粘贴口收进「准入公告」下拉（粘贴解析后自动勾选 facet 值，与 V1 融合语义一致）。
 */
export interface AssetFilterBarProps {
    searchKeyword: string;
    onSearchKeywordChange: (v: string) => void;
    facetSelection: FacetSelection;
    onFacetSelectionChange: (sel: FacetSelection) => void;
    facetVocab: FacetVocab;
    facetItems: { facets: ResolvedFacets }[];
    allTags: string[];
    selectedTags: string[];
    onSelectedTagsChange: (tags: string[]) => void;
    statusSelection: StatusFilter[];
    onStatusSelectionChange: (s: StatusFilter[]) => void;
    onClearAll: () => void;
    /** 切换左侧导航浮窗（无应用菜单时的鼠标入口） */
    onToggleNav?: () => void;
    /** 导航浮窗是否展开（控制按钮图标方向） */
    navOpen?: boolean;
}

interface ChipShellProps {
    label: string;
    activeCount: number;
    content: React.ReactNode;
}

const ChipShell: React.FC<ChipShellProps> = ({ label, activeCount, content }) => (
    <Popover
        content={<div className="max-h-[320px] overflow-y-auto custom-scrollbar min-w-[220px] max-w-[360px]">{content}</div>}
        trigger="click"
        placement="bottomLeft"
    >
        <div
            className={`
                px-2.5 py-1 rounded-md border text-aux cursor-pointer select-none
                flex items-center gap-1 whitespace-nowrap transition-colors duration-150
                ${activeCount > 0
                    ? 'bg-brand-weak border-brand text-brand font-medium'
                    : 'surface-container border-line text-2 hover:border-brand hover:text-brand'
                }
            `}
            style={{ transitionTimingFunction: 'var(--ease-ui)' }}
        >
            {label}
            {activeCount > 0 && <span className="tabular-nums">({activeCount})</span>}
            <CaretDownOutlined className="text-[10px] opacity-60" />
        </div>
    </Popover>
);

/** 单值/多值维度的值列表（带级联计数） */
const FacetValueList: React.FC<{
    items: { facets: ResolvedFacets }[];
    selection: FacetSelection;
    dim: FacetDim;
    onToggle: (value: string) => void;
}> = ({ items, selection, dim, onToggle }) => {
    const values = useMemo(() => collectFacetValues(items, dim), [items, dim]);
    const counts = useMemo(() => countFacetValues(items, selection, dim), [items, selection, dim]);
    const selected: string[] =
        dim === 'manufacturer' ? selection.manufacturers
        : dim === 'vehicleFamily' ? selection.families
        : dim === 'batteryBrand' ? selection.batteryBrands
        : dim === 'admissionLevel' ? selection.admissionLevels
        : selection.announceNos;

    return (
        <div className="flex flex-wrap gap-1.5">
            {values.map(v => {
                const count = counts.get(v) || 0;
                const active = selected.includes(v);
                return (
                    <Tag
                        key={v}
                        onClick={() => onToggle(v)}
                        className={`m-0 text-[11px] leading-[20px] px-2 rounded-lg border cursor-pointer ${
                            active ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                        } ${count === 0 && !active ? 'opacity-50' : ''}`}
                    >
                        {v} <span className="opacity-60 tabular-nums">{count}</span>
                    </Tag>
                );
            })}
            {(counts.get(FACET_NONE) ?? 0) > 0 && (
                <Tag
                    onClick={() => onToggle(FACET_NONE)}
                    className={`m-0 text-[11px] leading-[20px] px-2 rounded-lg border cursor-pointer ${
                        selected.includes(FACET_NONE) ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                    }`}
                >
                    {FACET_NONE} <span className="opacity-60 tabular-nums">{counts.get(FACET_NONE)}</span>
                </Tag>
            )}
            {values.length === 0 && <span className="text-[12px] text-3">暂无可选值</span>}
        </div>
    );
};

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'latest', label: '最新版' },
    { value: 'keyVehicle', label: '关键车型' },
    { value: 'selected', label: '已选' },
    { value: 'superseded', label: '历史版本' },
    { value: 'deprecated', label: '已废弃' },
    { value: 'rejected', label: '驳回' },
];

const AssetFilterBar: React.FC<AssetFilterBarProps> = ({
    searchKeyword,
    onSearchKeywordChange,
    facetSelection,
    onFacetSelectionChange,
    facetVocab: _facetVocab,
    facetItems,
    allTags,
    selectedTags,
    onSelectedTagsChange,
    statusSelection,
    onStatusSelectionChange,
    onClearAll,
    onToggleNav,
    navOpen,
}) => {
    const [announcePaste, setAnnouncePaste] = useState('');

    const hasActiveFilters = Boolean(searchKeyword.trim())
        || isFacetSelectionActive(facetSelection)
        || selectedTags.length > 0
        || statusSelection.length > 0;

    const toggleDim = (dim: FacetDim, value: string) => {
        const key =
            dim === 'manufacturer' ? 'manufacturers'
            : dim === 'vehicleFamily' ? 'families'
            : dim === 'batteryBrand' ? 'batteryBrands'
            : dim === 'admissionLevel' ? 'admissionLevels'
            : 'announceNos';
        onFacetSelectionChange({ ...facetSelection, [key]: toggleFacetValue(facetSelection[key], value) });
    };

    /** 粘贴公告号：解析 → 勾选 facet.announceNos（与 V1 粘贴框语义一致） */
    const handleAnnouncePaste = (text: string) => {
        setAnnouncePaste(text);
        const nos = text
            .split(/[\s,，\n\t]+/)
            .map(s => s.trim().toUpperCase())
            .filter(Boolean);
        onFacetSelectionChange({ ...facetSelection, announceNos: nos });
    };

    const facetCount = (dim: FacetDim) =>
        dim === 'manufacturer' ? facetSelection.manufacturers.length
        : dim === 'vehicleFamily' ? facetSelection.families.length
        : dim === 'batteryBrand' ? facetSelection.batteryBrands.length
        : dim === 'admissionLevel' ? facetSelection.admissionLevels.length
        : facetSelection.announceNos.length;

    const capacityActive = (facetSelection.capacityMin !== null || facetSelection.capacityMax !== null || facetSelection.capacityNone) ? 1 : 0;

    return (
        <div className="flex-none surface-container border-b border-default px-4 py-2.5 flex items-center gap-2 flex-wrap">
            {/* 导航浮窗开关（紧凑图标，并入筛选条行；替代原通高竖条） */}
            {onToggleNav && (
                <Tooltip title={navOpen ? '收起导航（⌘B）' : '展开导航（⌘B）'}>
                    <button
                        type="button"
                        aria-label={navOpen ? '收起导航' : '展开导航'}
                        className={`flex-none w-7 h-7 rounded-md border flex items-center justify-center transition-colors duration-150 ${
                            navOpen ? 'bg-brand-weak border-brand text-brand' : 'surface-container border-line text-3 hover:border-brand hover:text-brand'
                        }`}
                        style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                        onClick={onToggleNav}
                    >
                        {navOpen ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
                    </button>
                </Tooltip>
            )}
            {/* 搜索框走规范唯一形态（设计语言 §5）。width="fluid" 精确保住此处原有布局：
                它本是 flex-1 min-w-[180px]（随筛选条伸缩），改用固定像素档会把同行
                chips 挤走——资产池布局不得改动（§7.1）。 */}
            <SearchInput
                width="fluid"
                placeholder="搜名字、公告号、标签"
                value={searchKeyword}
                onChange={onSearchKeywordChange}
            />

            {/* 电量（区间） */}
            <ChipShell
                label="电量"
                activeCount={capacityActive}
                content={
                    <div className="space-y-2.5">
                        <div className="flex items-center gap-2">
                            <InputNumber
                                size="small"
                                placeholder="≥ kWh"
                                min={0}
                                value={facetSelection.capacityMin}
                                onChange={v => onFacetSelectionChange({ ...facetSelection, capacityMin: v ?? null })}
                                className="w-24"
                            />
                            <span className="text-3">—</span>
                            <InputNumber
                                size="small"
                                placeholder="≤ kWh"
                                min={0}
                                value={facetSelection.capacityMax}
                                onChange={v => onFacetSelectionChange({ ...facetSelection, capacityMax: v ?? null })}
                                className="w-24"
                            />
                        </div>
                        <Tag
                            onClick={() => onFacetSelectionChange({ ...facetSelection, capacityNone: !facetSelection.capacityNone })}
                            className={`m-0 text-[11px] leading-[20px] px-2 rounded-lg border cursor-pointer ${
                                facetSelection.capacityNone ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                            }`}
                        >
                            （无）缺电量数据
                        </Tag>
                    </div>
                }
            />

            {/* 准入公告（值列表 + 粘贴口） */}
            <ChipShell
                label="准入公告"
                activeCount={facetCount('announceNos')}
                content={
                    <div className="space-y-2.5">
                        <Input.TextArea
                            rows={2}
                            placeholder="粘贴公告号（逗号/空格/换行分隔）"
                            value={announcePaste}
                            onChange={e => handleAnnouncePaste(e.target.value)}
                            className="text-[12px]"
                        />
                        <FacetValueList
                            items={facetItems}
                            selection={facetSelection}
                            dim="announceNos"
                            onToggle={v => toggleDim('announceNos', v)}
                        />
                    </div>
                }
            />

            {/* 电池品牌 */}
            <ChipShell
                label="电池品牌"
                activeCount={facetCount('batteryBrand')}
                content={
                    <FacetValueList
                        items={facetItems}
                        selection={facetSelection}
                        dim="batteryBrand"
                        onToggle={v => toggleDim('batteryBrand', v)}
                    />
                }
            />

            {/* 标签 */}
            <ChipShell
                label="标签"
                activeCount={selectedTags.length}
                content={
                    <div className="flex flex-wrap gap-1.5">
                        {allTags.map(t => {
                            const active = selectedTags.includes(t);
                            return (
                                <Tag
                                    key={t}
                                    onClick={() => onSelectedTagsChange(
                                        active ? selectedTags.filter(x => x !== t) : [...selectedTags, t]
                                    )}
                                    className={`m-0 text-[11px] leading-[20px] px-2 rounded-lg border cursor-pointer ${
                                        active ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                                    }`}
                                >
                                    {t}
                                </Tag>
                            );
                        })}
                        {allTags.length === 0 && <span className="text-[12px] text-3">暂无标签</span>}
                    </div>
                }
            />

            {/* 状态 */}
            <ChipShell
                label="状态"
                activeCount={statusSelection.length}
                content={
                    <div className="flex flex-wrap gap-1.5">
                        {STATUS_OPTIONS.map(opt => {
                            const active = statusSelection.includes(opt.value);
                            return (
                                <Tag
                                    key={opt.value}
                                    onClick={() => onStatusSelectionChange(
                                        active ? statusSelection.filter(x => x !== opt.value) : [...statusSelection, opt.value]
                                    )}
                                    className={`m-0 text-[11px] leading-[20px] px-2 rounded-lg border cursor-pointer ${
                                        active ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                                    }`}
                                >
                                    {opt.label}
                                </Tag>
                            );
                        })}
                    </div>
                }
            />

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
