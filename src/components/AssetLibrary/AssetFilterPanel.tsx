import React, { useMemo, useState } from 'react';
import { Tag, Select, InputNumber, Tooltip, Button, Input } from 'antd';
import {
    FilterOutlined, ClearOutlined, CaretRightOutlined,
    PlusOutlined, MinusOutlined,
} from '@ant-design/icons';
import type { ResolvedFacets, FacetVocab } from '../../utils/assetFacets';
import {
    FACET_NONE, collectFacetValues, countFacetValues, countCapacity,
    toggleFacetValue, isFacetSelectionActive, type FacetSelection,
} from '../../utils/facetFilters';

// ============================================================
// 统一筛选面板：受控属性横切 + 公告号粘贴 + 自由标签，一个筛选块。
// 默认收起为一行摘要（内容优先）；展开后主机厂/族群常驻，其余维度收「更多」。
// 公告号只保留粘贴口（粘贴值同步 selection.announceNos，由父级负责）。
// ============================================================

export interface FilterTagGroupRow {
    id: string;
    name: string;
    tags: string[];
    exclusive: boolean;
}

interface AssetFilterPanelProps {
    /** facet 候选集（与列表同口径） */
    items: { facets: ResolvedFacets }[];
    selection: FacetSelection;
    onChangeSelection: (sel: FacetSelection) => void;
    vocab: FacetVocab;
    /** 公告号粘贴（唯一入口） */
    announceInput: string;
    onChangeAnnounceInput: (v: string) => void;
    announceMatch: { matched: string[]; unmatched: string[] };
    /** 当前筛选出的资产数（提示用） */
    matchedCount: number;
    /** 自由标签筛选（受控属性旧标签组已在父级过滤） */
    tagGroups: FilterTagGroupRow[];
    selectedGroupTags: Record<string, string | null>;
    selectedOtherTags: string[];
    onToggleGroupTag: (id: string, tag: string) => void;
    onToggleOtherTag: (tag: string) => void;
    /** 一键清除全部筛选（facet + 公告号 + 标签） */
    onClearAll: () => void;
}

const buildGroupOf = (vocab: FacetVocab, dim: 'manufacturer' | 'batteryBrand'): Map<string, string> => {
    const map = new Map<string, string>();
    vocab[dim].forEach(e => map.set(e.name, e.group || e.name));
    return map;
};

interface ChipRowProps {
    label: string;
    values: string[];
    selected: string[];
    counts: Map<string, number>;
    showNone: boolean;
    onToggle: (value: string) => void;
}

const ChipRow: React.FC<ChipRowProps> = ({ label, values, selected, counts, showNone, onToggle }) => (
    <div className="flex items-start gap-2">
        <span className="text-[12px] text-2 font-medium flex-shrink-0 w-10 leading-[22px]">{label}</span>
        <div className="flex flex-wrap gap-1">
            {values.map(v => {
                const count = counts.get(v) || 0;
                const active = selected.includes(v);
                return (
                    <Tag
                        key={v}
                        onClick={() => onToggle(v)}
                        className={`m-0 text-[11px] leading-[18px] px-1.5 rounded-lg border cursor-pointer ${
                            active ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                        } ${count === 0 && !active ? 'opacity-50' : ''}`}
                    >
                        {v} <span className="opacity-60 tabular-nums">{count}</span>
                    </Tag>
                );
            })}
            {showNone && (
                <Tag
                    onClick={() => onToggle(FACET_NONE)}
                    className={`m-0 text-[11px] leading-[18px] px-1.5 rounded-lg border cursor-pointer ${
                        selected.includes(FACET_NONE) ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                    }`}
                >
                    {FACET_NONE} <span className="opacity-60 tabular-nums">{counts.get(FACET_NONE) || 0}</span>
                </Tag>
            )}
        </div>
    </div>
);

const AssetFilterPanel: React.FC<AssetFilterPanelProps> = ({
    items, selection, onChangeSelection, vocab,
    announceInput, onChangeAnnounceInput, announceMatch, matchedCount,
    tagGroups, selectedGroupTags, selectedOtherTags, onToggleGroupTag, onToggleOtherTag,
    onClearAll,
}) => {
    const [expanded, setExpanded] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);

    const facetActive = isFacetSelectionActive(selection);
    const tagActive = Object.values(selectedGroupTags).some(Boolean) || selectedOtherTags.length > 0;
    const anyActive = facetActive || tagActive || announceInput.trim().length > 0;

    // ===== 收起态摘要 =====
    const summaryParts = useMemo(() => {
        const parts: string[] = [];
        const named = (arr: string[]) => arr.filter(v => v !== FACET_NONE);
        const noneOf = (arr: string[]) => arr.includes(FACET_NONE);
        const fmt = (arr: string[]) => {
            const n = named(arr);
            const s = n.length > 0 ? `${n[0]}${n.length > 1 ? ` +${n.length - 1}` : ''}` : '';
            return noneOf(arr) ? `${s}${s ? ' · ' : ''}${FACET_NONE}` : s;
        };
        if (selection.manufacturers.length > 0) parts.push(`主机厂 ${fmt(selection.manufacturers)}`);
        if (selection.families.length > 0) parts.push(`族群 ${fmt(selection.families)}`);
        if (selection.batteryBrands.length > 0) parts.push(`电池 ${fmt(selection.batteryBrands)}`);
        if (selection.admissionLevels.length > 0) parts.push(`等级 ${fmt(selection.admissionLevels)}`);
        if (selection.capacityMin !== null || selection.capacityMax !== null || selection.capacityNone) {
            const range = selection.capacityMin !== null || selection.capacityMax !== null
                ? `${selection.capacityMin ?? '—'}~${selection.capacityMax ?? '—'}`
                : '';
            parts.push(`电量 ${selection.capacityNone ? `${range}${range ? ' · ' : ''}${FACET_NONE}` : range}`);
        }
        if (selection.announceNos.length > 0) parts.push(`公告号 ${selection.announceNos.length} 个`);
        if (tagActive) {
            const tags = [
                ...Object.values(selectedGroupTags).filter((v): v is string => !!v),
                ...selectedOtherTags,
            ];
            parts.push(`标签 ${tags.length > 0 ? tags[0] : ''}${tags.length > 1 ? ` +${tags.length - 1}` : ''}`);
        }
        return parts;
    }, [selection, tagActive, selectedGroupTags, selectedOtherTags]);

    // ===== 级联计数 =====
    const counts = useMemo(() => ({
        manufacturer: countFacetValues(items, selection, 'manufacturer'),
        vehicleFamily: countFacetValues(items, selection, 'vehicleFamily'),
        batteryBrand: countFacetValues(items, selection, 'batteryBrand'),
        admissionLevel: countFacetValues(items, selection, 'admissionLevel'),
    }), [items, selection]);
    const capCounts = useMemo(() => countCapacity(items, selection), [items, selection]);

    const mfrGroups = useMemo(() => {
        const groups = new Map<string, { members: string[]; count: number }>();
        vocab.manufacturer.forEach(e => {
            const g = e.group || e.name;
            if (!groups.has(g)) groups.set(g, { members: [], count: 0 });
            groups.get(g)!.members.push(e.name);
            groups.get(g)!.count += counts.manufacturer.get(e.name) || 0;
        });
        return Array.from(groups.entries()).sort((a, b) => b[1].count - a[1].count);
    }, [vocab, counts.manufacturer]);

    const mfrGroupActive = (members: string[]) => members.some(m => selection.manufacturers.includes(m));
    const toggleMfrGroup = (members: string[]) => {
        const anyGroupActive = mfrGroupActive(members);
        let next = selection.manufacturers;
        members.forEach(m => {
            const shouldSelected = !anyGroupActive;
            if (shouldSelected !== next.includes(m)) next = toggleFacetValue(next, m);
        });
        onChangeSelection({ ...selection, manufacturers: next });
    };

    return (
        <div className="mb-2 px-1">
            {/* 摘要行（默认收起，内容优先） */}
            <div
                className={`flex items-center gap-2 rounded-lg border px-2 py-1 cursor-pointer select-none ${
                    expanded ? 'surface-inset border-default' : 'surface-inset border-default hover:border-line-strong'
                }`}
                onClick={() => setExpanded(v => !v)}
            >
                <FilterOutlined className={`text-[12px] flex-shrink-0 ${anyActive ? 'text-brand' : 'text-3'}`} />
                <span className="text-[12px] text-2 font-medium flex-shrink-0">筛选</span>
                {!expanded && summaryParts.length > 0 && (
                    <span className="text-[11px] text-3 truncate min-w-0 flex-1">
                        {summaryParts.join(' · ')}
                    </span>
                )}
                <span className="flex-1" />
                {!expanded && anyActive && (
                    <span className="text-[11px] text-3 tabular-nums flex-shrink-0">{matchedCount} 个资产</span>
                )}
                {anyActive && (
                    <Button
                        size="small" type="text" icon={<ClearOutlined className="text-[11px]" />}
                        className="text-[11px] h-5 px-1.5 text-3 hover:text-danger flex-shrink-0"
                        onClick={e => { e.stopPropagation(); onClearAll(); }}
                    >
                        清除
                    </Button>
                )}
                <CaretRightOutlined className={`text-[10px] text-3 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </div>

            {/* 展开态：主机厂 / 族群 常驻，其余进「更多」，公告号粘贴 + 标签收尾 */}
            {expanded && (
                <div className="mt-1.5 space-y-1.5">
                    {/* 主机厂：集团折叠多选 + 法人精筛 */}
                    <div className="flex items-start gap-2">
                        <span className="text-[12px] text-2 font-medium flex-shrink-0 w-10 leading-[22px]">主机厂</span>
                        <div className="flex flex-wrap gap-1 items-center min-w-0">
                            {mfrGroups.map(([g, info]) => (
                                <Tooltip key={g} title={info.members.join('、')}>
                                    <Tag
                                        onClick={() => toggleMfrGroup(info.members)}
                                        className={`m-0 text-[11px] leading-[18px] px-1.5 rounded-lg border cursor-pointer ${
                                            mfrGroupActive(info.members) ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                                        } ${info.count === 0 && !mfrGroupActive(info.members) ? 'opacity-50' : ''}`}
                                    >
                                        {g} <span className="opacity-60 tabular-nums">{info.count}</span>
                                    </Tag>
                                </Tooltip>
                            ))}
                            <Select
                                mode="multiple" size="small" placeholder="按法人精筛…" maxTagCount={1}
                                allowClear showSearch className="min-w-[130px] max-w-[200px]"
                                value={selection.manufacturers}
                                onChange={v => onChangeSelection({ ...selection, manufacturers: v })}
                                options={vocab.manufacturer.map(e => ({
                                    value: e.name,
                                    label: `${e.group ? `${e.group}·` : ''}${e.name} (${counts.manufacturer.get(e.name) || 0})`,
                                }))}
                                optionFilterProp="label"
                            />
                        </div>
                    </div>

                    <ChipRow
                        label="族群"
                        values={collectFacetValues(items, 'vehicleFamily')}
                        selected={selection.families}
                        counts={counts.vehicleFamily}
                        showNone
                        onToggle={v => onChangeSelection({ ...selection, families: toggleFacetValue(selection.families, v) })}
                    />

                    {/* 更多维度（默认收起）：电池品牌 / 电量 / 准入等级 */}
                    <div className="flex items-start gap-2">
                        <span className="text-[12px] text-2 font-medium flex-shrink-0 w-10 leading-[22px]">更多</span>
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <Tag
                                onClick={() => setMoreOpen(v => !v)}
                                className="m-0 text-[11px] leading-[18px] px-1.5 rounded-lg border cursor-pointer surface-inset border-default text-2 hover:border-brand"
                            >
                                {moreOpen ? <MinusOutlined className="text-[9px]" /> : <PlusOutlined className="text-[9px]" />}
                                {' '}电池品牌 / 电量 / 等级
                            </Tag>
                            {!moreOpen && (
                                <span className="text-[11px] text-3">
                                    {[
                                        selection.batteryBrands.length > 0 ? `电池 ${selection.batteryBrands.length}` : '',
                                        (selection.capacityMin !== null || selection.capacityMax !== null || selection.capacityNone) ? '电量 ✓' : '',
                                        selection.admissionLevels.length > 0 ? `等级 ${selection.admissionLevels.length}` : '',
                                    ].filter(Boolean).join(' · ')}
                                </span>
                            )}
                        </div>
                    </div>
                    {moreOpen && (
                        <div className="space-y-1.5 pl-12">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-2 w-14 flex-shrink-0">电池品牌</span>
                                <Select
                                    mode="multiple" size="small" placeholder="全部" maxTagCount={2}
                                    allowClear showSearch className="min-w-[150px] max-w-[260px]"
                                    value={selection.batteryBrands}
                                    onChange={v => onChangeSelection({ ...selection, batteryBrands: v })}
                                    options={(() => {
                                        const groupOf = buildGroupOf(vocab, 'batteryBrand');
                                        const vals = collectFacetValues(items, 'batteryBrand');
                                        const opts = vals.map(v => ({
                                            value: v,
                                            label: `${groupOf.get(v) && groupOf.get(v) !== v ? `${groupOf.get(v)}·` : ''}${v} (${counts.batteryBrand.get(v) || 0})`,
                                        }));
                                        if (items.some(({ facets }) => facets.batteryBrand === null)) {
                                            opts.push({ value: FACET_NONE, label: `${FACET_NONE} (${counts.batteryBrand.get(FACET_NONE) || 0})` });
                                        }
                                        return opts;
                                    })()}
                                    optionFilterProp="label"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-2 w-14 flex-shrink-0">电量</span>
                                <InputNumber size="small" placeholder="≥" min={0} className="w-20"
                                    value={selection.capacityMin ?? undefined}
                                    onChange={v => onChangeSelection({ ...selection, capacityMin: v ?? null })} />
                                <span className="text-[11px] text-3">~</span>
                                <InputNumber size="small" placeholder="≤" min={0} className="w-20"
                                    value={selection.capacityMax ?? undefined}
                                    onChange={v => onChangeSelection({ ...selection, capacityMax: v ?? null })} />
                                <span className="text-[11px] text-3">kWh（{capCounts.inRange}）</span>
                                <Tag
                                    onClick={() => onChangeSelection({ ...selection, capacityNone: !selection.capacityNone })}
                                    className={`m-0 text-[11px] leading-[18px] px-1.5 rounded-lg border cursor-pointer ${
                                        selection.capacityNone ? 'tag-checked font-medium' : 'surface-inset border-default text-2 hover:border-brand'
                                    }`}
                                >
                                    {FACET_NONE} <span className="opacity-60 tabular-nums">{capCounts.none}</span>
                                </Tag>
                            </div>
                            <ChipRow
                                label="等级"
                                values={collectFacetValues(items, 'admissionLevel')}
                                selected={selection.admissionLevels}
                                counts={counts.admissionLevel}
                                showNone
                                onToggle={v => onChangeSelection({ ...selection, admissionLevels: toggleFacetValue(selection.admissionLevels, v) })}
                            />
                        </div>
                    )}

                    {/* 公告号：粘贴口（唯一入口，值同步受控属性） */}
                    <div className="flex items-start gap-2">
                        <span className="text-[12px] text-2 font-medium flex-shrink-0 w-10 leading-[22px]">公告号</span>
                        <div className="flex-1 min-w-0 space-y-1">
                            <Input.TextArea
                                size="small"
                                autoSize={{ minRows: 1, maxRows: 3 }}
                                placeholder="粘贴公告号筛选，逗号/换行/空格分隔..."
                                value={announceInput}
                                onChange={e => onChangeAnnounceInput(e.target.value)}
                                className="text-[12px] rounded-lg"
                                style={{ resize: 'none' }}
                                onClick={e => e.stopPropagation()}
                            />
                            {announceInput.trim() && (
                                <div className="flex items-center gap-2 text-[11px] flex-wrap">
                                    {announceMatch.matched.length > 0 && (
                                        <span className="text-success">
                                            匹配 <b>{announceMatch.matched.length}</b> 个，筛出 <b>{matchedCount}</b> 个资产
                                        </span>
                                    )}
                                    {announceMatch.unmatched.length > 0 && (
                                        <Tooltip title={announceMatch.unmatched.join('、')}>
                                            <span className="text-[color:var(--warning-text)] cursor-help">
                                                未匹配 <b>{announceMatch.unmatched.length}</b> 个
                                            </span>
                                        </Tooltip>
                                    )}
                                    <span className="text-brand cursor-pointer hover:underline"
                                        onClick={() => onChangeAnnounceInput('')}>
                                        清除
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 自由标签（受控属性旧标签组已退役，不在此展示） */}
                    {tagGroups.length > 0 && (
                        <div className="space-y-1">
                            {tagGroups.map(row => {
                                const isOther = row.id === '_other';
                                return (
                                    <div key={row.id} className="flex items-start gap-2">
                                        <span className="text-[12px] text-2 font-medium flex-shrink-0 w-10 leading-[22px]">
                                            {isOther ? '标签' : row.name}
                                        </span>
                                        <div className="flex flex-wrap gap-1">
                                            {row.tags.map(tag => {
                                                const isSelected = isOther
                                                    ? selectedOtherTags.includes(tag)
                                                    : selectedGroupTags[row.id] === tag;
                                                return (
                                                    <Tag
                                                        key={tag}
                                                        onClick={() => (isOther ? onToggleOtherTag(tag) : onToggleGroupTag(row.id, tag))}
                                                        className={`m-0 text-[11px] leading-[18px] px-1.5 rounded-lg border cursor-pointer ${
                                                            isSelected
                                                                ? 'tag-checked font-medium'
                                                                : 'surface-inset border-default text-2 hover:border-brand'
                                                        }`}
                                                    >
                                                        {tag}
                                                    </Tag>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AssetFilterPanel;
