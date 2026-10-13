import React, { useMemo, useState } from 'react';
import {
    HomeOutlined, AppstoreOutlined, StarOutlined, WarningOutlined,
    BranchesOutlined, EditOutlined, HistoryOutlined, DeleteOutlined,
    AuditOutlined, SettingOutlined, FolderOpenOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../../store/vehicleStore';
import { useAssetLibrarySnapshot } from '../../../hooks/useAssetLibrarySnapshot';
import { getAssetTagGroupsSync } from '../../../utils/assetTagGroups';
import { KEY_VEHICLE_TAG } from '../../../utils/assetGovernance';
import { validateAssetName } from '../../../utils/assetNaming';

/**
 * 左栏：快速导航（主机厂/族群树）+ 治理视角（预置筛选）+ 工具
 * （设计文档 2026-10-13-asset-panel-redesign-v2 §4.1）
 *
 * M1 静态骨架：渲染结构，点击交互与筛选联动在 M2 接入。
 */
export interface AssetSidebarProps {
    governanceView: string | null;
    onGovernanceViewChange: (view: string | null) => void;
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
            flex items-center justify-between px-5 py-2 cursor-pointer transition-all text-[13px]
            ${indent ? 'pl-12' : ''}
            ${active
                ? 'bg-[var(--brand-weak)] text-[var(--brand)] font-semibold border-l-[3px] border-[var(--brand)] pl-[calc(1.25rem-3px)]'
                : 'text-2 hover:bg-[var(--surface-hover)]'
            }
        `}
        onClick={onClick}
    >
        <span className="flex items-center gap-2.5">
            <span className="text-[14px] w-[18px] flex items-center justify-center">{icon}</span>
            {label}
        </span>
        {count !== undefined && (
            <span className={`
                text-[11px] px-1.5 py-0.5 rounded-[10px] min-w-[24px] text-center
                ${warn ? 'bg-[#fef3c7] text-[#92400e]' : active ? 'bg-white text-[var(--brand)] font-semibold' : 'bg-[var(--bg)] text-3'}
            `}>
                {count}
            </span>
        )}
    </div>
);

const AssetSidebar: React.FC<AssetSidebarProps> = ({ governanceView, onGovernanceViewChange }) => {
    const { setAssetLibraryPath } = useVehicleStore(useShallow(state => ({
        setAssetLibraryPath: state.setAssetLibraryPath,
    })));
    const snapshot = useAssetLibrarySnapshot();

    // 展开状态（M2 存 localStorage）
    const [mfrExpanded, setMfrExpanded] = useState(true);
    const [familyExpanded, setFamilyExpanded] = useState(true);

    // 主机厂列表（从 facet 数据派生，M2 接入真实数据）
    const manufacturers = useMemo(() => {
        const set = new Set<string>();
        snapshot.infos.forEach(info => {
            // TODO M2: 从 fileFacets 取 manufacturer
            if (info.manufacturerRaw) set.add(info.manufacturerRaw);
        });
        return Array.from(set).slice(0, 10).map(name => ({ name, count: 0 }));
    }, [snapshot.infos]);

    // 车型族群列表（从标签组派生）
    const families = useMemo(() => {
        const groups = getAssetTagGroupsSync();
        const familyGroup = groups.groups.find(g => g.id === 'vehicleFamily' || g.name === '车型族群');
        if (!familyGroup) return [];
        return familyGroup.tags.map(name => ({ name, count: 0 }));
    }, []);

    // 治理视角计数（M2 接入真实统计）
    const governanceCounts = useMemo(() => ({
        keyVehicle: snapshot.infos.filter(i => (snapshot.tags[i.fileName] || []).includes(KEY_VEHICLE_TAG)).length,
        namingIssue: snapshot.infos.filter(i => !validateAssetName(i.fileName, i.announceNos || []).valid).length,
        versionIssue: 0, // TODO M2: governanceReport.unconvergedCars.length
        incomplete: 0, // TODO M2: fileFacets 有 null 的资产数
        superseded: snapshot.infos.filter(i => snapshot.meta[i.fileName]?.status === 'superseded').length,
        deprecated: snapshot.infos.filter(i => snapshot.meta[i.fileName]?.status === 'deprecated').length,
    }), [snapshot]);

    const handleGovernanceClick = (view: string) => {
        onGovernanceViewChange(governanceView === view ? null : view);
    };

    const handleSetAssetLibrary = async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selected = await open({
                directory: true,
                multiple: false,
                title: '选择资产库目录'
            });
            if (selected && typeof selected === 'string') {
                setAssetLibraryPath(selected);
            }
        } catch (err) {
            console.error('Failed to select directory', err);
        }
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
                    count={manufacturers.length}
                    onClick={() => setMfrExpanded(!mfrExpanded)}
                />
                {mfrExpanded && manufacturers.map(m => (
                    <NavItem
                        key={m.name}
                        icon={<span />}
                        label={m.name}
                        count={m.count}
                        indent
                    />
                ))}
                <NavItem
                    icon={<AppstoreOutlined />}
                    label="车型族群"
                    count={families.length}
                    onClick={() => setFamilyExpanded(!familyExpanded)}
                />
                {familyExpanded && families.map(f => (
                    <NavItem
                        key={f.name}
                        icon={<span />}
                        label={f.name}
                        count={f.count}
                        indent
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
                    count={governanceCounts.keyVehicle}
                    active={governanceView === 'keyVehicle'}
                    onClick={() => handleGovernanceClick('keyVehicle')}
                />
                <NavItem
                    icon={<WarningOutlined />}
                    label="命名问题"
                    count={governanceCounts.namingIssue}
                    warn={governanceCounts.namingIssue > 0}
                    active={governanceView === 'namingIssue'}
                    onClick={() => handleGovernanceClick('namingIssue')}
                />
                <NavItem
                    icon={<BranchesOutlined />}
                    label="版本问题"
                    count={governanceCounts.versionIssue}
                    warn={governanceCounts.versionIssue > 0}
                    active={governanceView === 'versionIssue'}
                    onClick={() => handleGovernanceClick('versionIssue')}
                />
                <NavItem
                    icon={<EditOutlined />}
                    label="待补全"
                    count={governanceCounts.incomplete}
                    active={governanceView === 'incomplete'}
                    onClick={() => handleGovernanceClick('incomplete')}
                />
                <NavItem
                    icon={<HistoryOutlined />}
                    label="历史版本"
                    count={governanceCounts.superseded}
                    active={governanceView === 'superseded'}
                    onClick={() => handleGovernanceClick('superseded')}
                />
                <NavItem
                    icon={<DeleteOutlined />}
                    label="已废弃"
                    count={governanceCounts.deprecated}
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
                <NavItem
                    icon={<FolderOpenOutlined />}
                    label="导入资产"
                    onClick={() => { /* TODO M2: 接入 FileManager */ }}
                />
                <NavItem
                    icon={<ReloadOutlined />}
                    label="刷新资产库"
                    onClick={() => { /* TODO M2: 接入 fetchAssets(true) */ }}
                />
                <NavItem
                    icon={<AuditOutlined />}
                    label="治理体检"
                    onClick={() => { /* TODO M2: 打开 GovernanceReportModal */ }}
                />
                <NavItem
                    icon={<SettingOutlined />}
                    label="设置"
                    onClick={handleSetAssetLibrary}
                />
            </div>
        </div>
    );
};

export default AssetSidebar;
