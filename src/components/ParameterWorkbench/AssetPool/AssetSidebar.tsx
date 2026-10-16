import React, { useMemo, useState } from 'react';
import {
    HomeOutlined, AppstoreOutlined, StarOutlined, WarningOutlined,
    BranchesOutlined, EditOutlined, HistoryOutlined, DeleteOutlined,
    AuditOutlined, ReloadOutlined, SearchOutlined,
} from '@ant-design/icons';
import { message, Tooltip, Input } from 'antd';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../../store/vehicleStore';
import FileManager from '../FileManager';
import { FACET_NONE, countFacetValues, type FacetSelection, type FacetDim } from '../../../utils/facetFilters';
import type { FacetVocab, ResolvedFacets } from '../../../utils/assetFacets';

/**
 * 左栏：快速导航（主机厂/族群树）+ 治理视角（预置筛选）+ 工具
 * （设计文档 2026-10-13-asset-panel-redesign-v2 §4.1）
 *
 * 导航树与 facet 筛选共用同一份 FacetSelection 状态（单选语义）。
 * 视觉遵守曜蓝 v4.1：三层表面、文字四级、选中=品牌弱底+左缘条。
 */
export interface AssetSidebarProps {
    governanceView: string | null;
    onGovernanceViewChange: (view: string | null) => void;
    counts: {
        keyVehicle: number;
        namingIssue: number;
        versionIssue: number;
        incomplete: number;
        superseded: number;
        deprecated: number;
    };
    facetSelection: FacetSelection;
    onFacetSelectionChange: (sel: FacetSelection) => void;
    facetVocab: FacetVocab;
    facetItems: { facets: ResolvedFacets }[];
    onOpenGovernance: () => void;
    /** 折叠/收起浮窗（⌘B / 顶部折叠按钮 / 点外部） */
    onCollapse: () => void;
    /**
     * 用户在浮窗内做出「选择/动作」后的回调（浮窗模式：动作完成即收起）。
     * 仅导航叶子项、治理视角项、工具项触发；搜索输入与分组展开不触发。
     */
    onAction?: () => void;
}

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    count?: number;
    active?: boolean;
    warn?: boolean;
    onClick?: () => void;
    indent?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, count, active, warn, onClick, indent }) => (
    <div
        className={`
            relative flex items-center justify-between px-4 py-1.5 mx-2 rounded-md cursor-pointer
            transition-colors duration-150 text-body
            ${indent ? 'ml-6' : ''}
            ${active
                ? 'bg-brand-weak text-brand font-medium'
                : 'text-2 hover:surface-inset hover:text-1'
            }
        `}
        style={{ transitionTimingFunction: 'var(--ease-ui)' }}
        onClick={onClick}
    >
        {active && <div className="absolute left-[-8px] top-1.5 bottom-1.5 w-[3px] rounded-full bg-brand" />}
        <span className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] w-4 flex items-center justify-center flex-shrink-0 opacity-80">{icon}</span>
            <span className="truncate">{label}</span>
        </span>
        {count !== undefined && (
            <span className={`text-caption tabular-nums flex-shrink-0 ${warn ? 'text-warning-text font-medium' : active ? 'text-brand' : 'text-3'}`}>
                {count}
            </span>
        )}
    </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="px-4 pb-1.5 pt-1 text-caption text-3 font-medium tracking-wide">
        {children}
    </div>
);

const AssetSidebar: React.FC<AssetSidebarProps> = ({
    governanceView,
    onGovernanceViewChange,
    counts,
    facetSelection,
    onFacetSelectionChange,
    facetVocab,
    facetItems,
    onOpenGovernance,
    onCollapse,
    onAction,
}) => {
    const { bumpAssetVersion } = useVehicleStore(useShallow(state => ({
        bumpAssetVersion: state.bumpAssetVersion,
    })));

    const [mfrExpanded, setMfrExpanded] = useState(true);
    const [familyExpanded, setFamilyExpanded] = useState(true);
    // 导航搜索：过滤主机厂 + 族群两个列表（本地过滤，不改筛选状态）
    const [navKeyword, setNavKeyword] = useState('');

    const manufacturerRows = useMemo(() => {
        const countsMap = countFacetValues(facetItems, facetSelection, 'manufacturer');
        const names = new Set<string>();
        facetVocab.manufacturer.forEach(e => names.add(e.name));
        countsMap.forEach((_v, k) => { if (k !== FACET_NONE) names.add(k); });
        return Array.from(names)
            .map(name => ({ name, count: countsMap.get(name) || 0 }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
    }, [facetItems, facetSelection, facetVocab]);

    const familyRows = useMemo(() => {
        const countsMap = countFacetValues(facetItems, facetSelection, 'vehicleFamily');
        const names = new Set<string>();
        facetVocab.vehicleFamily.forEach(name => names.add(name));
        countsMap.forEach((_v, k) => { if (k !== FACET_NONE) names.add(k); });
        return Array.from(names)
            .map(name => ({ name, count: countsMap.get(name) || 0 }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
    }, [facetItems, facetSelection, facetVocab]);

    // 搜索词过滤（命中主机厂或族群名；空词 = 全量）
    const navFiltered = useMemo(() => {
        const kw = navKeyword.trim().toLowerCase();
        if (!kw) return { manufacturers: manufacturerRows, families: familyRows };
        return {
            manufacturers: manufacturerRows.filter(r => r.name.toLowerCase().includes(kw)),
            families: familyRows.filter(r => r.name.toLowerCase().includes(kw)),
        };
    }, [navKeyword, manufacturerRows, familyRows]);

    const handleDimClick = (dim: FacetDim, value: string) => {
        const key = dim === 'manufacturer' ? 'manufacturers' : 'families';
        const current = facetSelection[key];
        const next = current.includes(value) ? [] : [value];
        onFacetSelectionChange({ ...facetSelection, [key]: next });
        onAction?.();
    };

    const handleGovernanceClick = (view: string) => {
        onGovernanceViewChange(governanceView === view ? null : view);
        onAction?.();
    };

    return (
        <div className="h-full overflow-y-auto custom-scrollbar py-3">
            {/* 收起浮窗（⌘B） */}
            <div className="flex justify-end px-3 pb-1">
                <Tooltip title="收起导航（⌘B）">
                    <button
                        className="w-6 h-6 rounded flex items-center justify-center text-3 hover:text-brand hover:bg-brand-weak transition-colors duration-150"
                        style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                        onClick={onCollapse}
                    >
                        <span className="text-[10px]">◂</span>
                    </button>
                </Tooltip>
            </div>
            {/* 快速导航 */}
            <div className="mb-4">
                <SectionTitle>快速导航</SectionTitle>
                {/* 导航搜索：同时过滤主机厂 / 族群 */}
                <div className="px-3 pb-1.5">
                    <Input
                        size="small"
                        placeholder="搜索主机厂 / 族群…"
                        prefix={<SearchOutlined className="text-3 text-[11px]" />}
                        allowClear
                        value={navKeyword}
                        onChange={e => setNavKeyword(e.target.value)}
                    />
                </div>
                <NavItem
                    icon={<HomeOutlined />}
                    label="主机厂"
                    count={navFiltered.manufacturers.length}
                    onClick={() => setMfrExpanded(!mfrExpanded)}
                />
                {(mfrExpanded || navKeyword.trim()) && navFiltered.manufacturers.map(m => (
                    <NavItem
                        key={m.name}
                        icon={<span />}
                        label={m.name}
                        count={m.count}
                        indent
                        active={facetSelection.manufacturers.includes(m.name)}
                        onClick={() => handleDimClick('manufacturer', m.name)}
                    />
                ))}
                {(mfrExpanded || navKeyword.trim()) && navKeyword.trim() && navFiltered.manufacturers.length === 0 && (
                    <div className="pl-12 pr-3 py-1 text-caption text-4">无匹配主机厂</div>
                )}
                <NavItem
                    icon={<AppstoreOutlined />}
                    label="车型族群"
                    count={navFiltered.families.length}
                    onClick={() => setFamilyExpanded(!familyExpanded)}
                />
                {(familyExpanded || navKeyword.trim()) && navFiltered.families.map(f => (
                    <NavItem
                        key={f.name}
                        icon={<span />}
                        label={f.name}
                        count={f.count}
                        indent
                        active={facetSelection.families.includes(f.name)}
                        onClick={() => handleDimClick('vehicleFamily', f.name)}
                    />
                ))}
                {(familyExpanded || navKeyword.trim()) && navKeyword.trim() && navFiltered.families.length === 0 && (
                    <div className="pl-12 pr-3 py-1 text-caption text-4">无匹配族群</div>
                )}
            </div>

            <div className="h-px bg-[var(--border-default)] mx-4 my-3" />

            {/* 治理视角 */}
            <div className="mb-4">
                <SectionTitle>治理视角</SectionTitle>
                <NavItem
                    icon={<StarOutlined />}
                    label="关键车型"
                    count={counts.keyVehicle}
                    active={governanceView === 'keyVehicle'}
                    onClick={() => handleGovernanceClick('keyVehicle')}
                />
                <NavItem
                    icon={<WarningOutlined />}
                    label="命名问题"
                    count={counts.namingIssue}
                    warn={counts.namingIssue > 0}
                    active={governanceView === 'namingIssue'}
                    onClick={() => handleGovernanceClick('namingIssue')}
                />
                <NavItem
                    icon={<BranchesOutlined />}
                    label="版本问题"
                    count={counts.versionIssue}
                    warn={counts.versionIssue > 0}
                    active={governanceView === 'versionIssue'}
                    onClick={() => handleGovernanceClick('versionIssue')}
                />
                <NavItem
                    icon={<EditOutlined />}
                    label="待补全"
                    count={counts.incomplete}
                    active={governanceView === 'incomplete'}
                    onClick={() => handleGovernanceClick('incomplete')}
                />
                <NavItem
                    icon={<HistoryOutlined />}
                    label="历史版本"
                    count={counts.superseded}
                    active={governanceView === 'superseded'}
                    onClick={() => handleGovernanceClick('superseded')}
                />
                <NavItem
                    icon={<DeleteOutlined />}
                    label="已废弃"
                    count={counts.deprecated}
                    active={governanceView === 'deprecated'}
                    onClick={() => handleGovernanceClick('deprecated')}
                />
            </div>

            <div className="h-px bg-[var(--border-default)] mx-4 my-3" />

            {/* 工具 */}
            <div>
                <SectionTitle>工具</SectionTitle>
                <div className="px-4 py-1">
                    <FileManager />
                </div>
                <NavItem
                    icon={<ReloadOutlined />}
                    label="刷新资产库"
                    onClick={() => { bumpAssetVersion(); message.success('正在刷新资产库…'); onAction?.(); }}
                />
                <NavItem
                    icon={<AuditOutlined />}
                    label="治理体检"
                    onClick={onOpenGovernance}
                />
                {/* 「更换资产库目录」已迁至设置面板（路径与位置），此处不再重复 */}
            </div>
        </div>
    );
};

export default AssetSidebar;
