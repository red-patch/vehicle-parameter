import React, { useMemo, useState } from 'react';
import {
    HomeOutlined, AppstoreOutlined, StarOutlined, WarningOutlined,
    BranchesOutlined, EditOutlined, HistoryOutlined, DeleteOutlined,
    AuditOutlined, SettingOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../../store/vehicleStore';
import FileManager from '../FileManager';
import { FACET_NONE, countFacetValues, type FacetSelection, type FacetDim } from '../../../utils/facetFilters';
import type { FacetVocab, ResolvedFacets } from '../../../utils/assetFacets';

/**
 * 左栏：快速导航（主机厂/族群树）+ 治理视角（预置筛选）+ 工具
 * （设计文档 2026-10-13-asset-panel-redesign-v2 §4.1）
 *
 * 导航树与 facet 筛选共用同一份 FacetSelection 状态：
 * 点「主机厂 · 吉利」= facetSelection.manufacturers 勾选「吉利」（单选语义：点其他厂替换，再点取消）。
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
    /** 打开治理体检弹窗（由 Layout 统一挂载，含 report/收敛/批量补录） */
    onOpenGovernance: () => void;
}

interface NavItemProps {
    icon: React.ReactNode;
    label: string;
    count?: number;
    active?: boolean;
    warn?: boolean;
    onClick?: () => void;
    indent?: boolean;
    expandArrow?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, count, active, warn, onClick, indent, expandArrow }) => (
    <div
        className={`
            flex items-center justify-between px-5 py-2 cursor-pointer transition-all text-[13px]
            ${indent ? 'pl-12' : ''}
            ${active
                ? 'bg-[var(--brand-weak)] text-[var(--brand)] font-semibold border-l-[3px] border-[var(--brand)] pl-[calc(1.25rem-3px)]'
                : 'text-2 hover:bg-[var(--surface-hover)]'
            }
        `}
        onClick={onClick}
    >
        <span className="flex items-center gap-2.5 min-w-0">
            <span className="text-[14px] w-[18px] flex items-center justify-center flex-shrink-0">{icon}</span>
            <span className="truncate">{label}</span>
        </span>
        {count !== undefined && (
            <span className={`
                text-[11px] px-1.5 py-0.5 rounded-[10px] min-w-[24px] text-center flex-shrink-0
                ${warn ? 'bg-[#fef3c7] text-[#92400e]' : active ? 'bg-white text-[var(--brand)] font-semibold' : 'bg-[var(--bg)] text-3'}
            `}>
                {count}
            </span>
        )}
        {expandArrow && <span className="text-[9px] text-3 flex-shrink-0">▾</span>}
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
}) => {
    const { assetLibraryPath, setAssetLibraryPath, bumpAssetVersion } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        setAssetLibraryPath: state.setAssetLibraryPath,
        bumpAssetVersion: state.bumpAssetVersion,
    })));

    const [mfrExpanded, setMfrExpanded] = useState(true);
    const [familyExpanded, setFamilyExpanded] = useState(true);

    // 主机厂候选（带级联计数）
    const manufacturerRows = useMemo(() => {
        const counts = countFacetValues(facetItems, facetSelection, 'manufacturer');
        const names = new Set<string>();
        facetVocab.manufacturer.forEach(e => names.add(e.name));
        counts.forEach((_v, k) => { if (k !== FACET_NONE) names.add(k); });
        return Array.from(names)
            .map(name => ({ name, count: counts.get(name) || 0 }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
    }, [facetItems, facetSelection, facetVocab]);

    // 车型族群候选（带级联计数）
    const familyRows = useMemo(() => {
        const counts = countFacetValues(facetItems, facetSelection, 'vehicleFamily');
        const names = new Set<string>();
        facetVocab.vehicleFamily.forEach(name => names.add(name));
        counts.forEach((_v, k) => { if (k !== FACET_NONE) names.add(k); });
        return Array.from(names)
            .map(name => ({ name, count: counts.get(name) || 0 }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN'));
    }, [facetItems, facetSelection, facetVocab]);

    /** 导航树点击 = facet 单选切换（再点取消） */
    const handleDimClick = (dim: FacetDim, value: string) => {
        const key = dim === 'manufacturer' ? 'manufacturers' : 'families';
        const current = facetSelection[key];
        const next = current.includes(value) ? [] : [value];
        onFacetSelectionChange({ ...facetSelection, [key]: next });
    };

    const handleGovernanceClick = (view: string) => {
        onGovernanceViewChange(governanceView === view ? null : view);
    };

    const handleSetAssetLibrary = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: false,
                title: '选择资产库目录',
            });
            if (selected && typeof selected === 'string') {
                setAssetLibraryPath(selected);
                message.success(`已设置资产库目录: ${selected}`);
            }
        } catch (err) {
            console.error('Failed to select directory', err);
            message.error('选择目录失败');
        }
    };

    const handleRefresh = () => {
        bumpAssetVersion();
        message.success('正在刷新资产库…');
    };

    return (
        <div className="h-full overflow-y-auto custom-scrollbar py-4">
            {/* 快速导航 */}
            <div className="mb-6">
                <div className="px-5 pb-2.5 text-[11px] font-semibold text-3 uppercase tracking-[0.8px]">
                    快速导航
                </div>
                <NavItem
                    icon={<HomeOutlined />}
                    label="主机厂"
                    count={manufacturerRows.length}
                    onClick={() => setMfrExpanded(!mfrExpanded)}
                    expandArrow={mfrExpanded}
                />
                {mfrExpanded && manufacturerRows.map(m => (
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
                <NavItem
                    icon={<AppstoreOutlined />}
                    label="车型族群"
                    count={familyRows.length}
                    onClick={() => setFamilyExpanded(!familyExpanded)}
                    expandArrow={familyExpanded}
                />
                {familyExpanded && familyRows.map(f => (
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
            </div>

            <div className="h-px bg-[var(--border)] mx-5 my-4" />

            {/* 治理视角 */}
            <div className="mb-6">
                <div className="px-5 pb-2.5 text-[11px] font-semibold text-3 uppercase tracking-[0.8px]">
                    治理视角
                </div>
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

            <div className="h-px bg-[var(--border)] mx-5 my-4" />

            {/* 工具 */}
            <div>
                <div className="px-5 pb-2.5 text-[11px] font-semibold text-3 uppercase tracking-[0.8px]">
                    工具
                </div>
                <div className="px-5 py-1.5">
                    <FileManager />
                </div>
                <NavItem
                    icon={<ReloadOutlined />}
                    label="刷新资产库"
                    onClick={handleRefresh}
                />
                <NavItem
                    icon={<AuditOutlined />}
                    label="治理体检"
                    onClick={onOpenGovernance}
                />
                <NavItem
                    icon={<SettingOutlined />}
                    label={assetLibraryPath ? '更换资产库目录' : '设置资产库目录'}
                    onClick={handleSetAssetLibrary}
                />
            </div>
        </div>
    );
};

export default AssetSidebar;
