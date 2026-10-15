import React, { useMemo } from 'react';
import { Drawer, Tag, Button, Empty, Progress } from 'antd';
import {
    ArrowRightOutlined, CheckCircleOutlined, WarningOutlined, HistoryOutlined,
    StopOutlined, CopyOutlined, FileOutlined, ThunderboltOutlined, CloseCircleOutlined, DatabaseOutlined,
} from '@ant-design/icons';

import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { useVehicleParams } from '../../hooks/useVehicleParams';
import { buildVehicleStats } from '../../utils/vehicleStats';
import { buildVehicleDisplayLabels, parseVehicleInstanceKey } from '../../utils/vehicleInstance';
import { getAssetDisplayName } from '../../utils/assetNaming';
import { buildAliasSource, resolveAssetDisplayName } from '../../utils/assetAlias';
import { getAssetSourceMeta } from '../../utils/assetSourceTags';
import { getAssetTagGroupsSync } from '../../utils/assetTagGroups';
import TagSelector from '../common/TagSelector';
import type { AssetActions } from './useAssetActions';
import type { AssetLibrarySnapshot } from '../../hooks/useAssetLibrarySnapshot';
import type { AssetFileInfo } from '../../utils/assetManager';

/**
 * 资产检查器：统一交互面（设计文档 2026-10-01-asset-panel-layout-redesign §3.3）。
 * 同时服务左栏资产与购物车车辆，取代旧的只读详情抽屉；
 * 对象级操作全部经 AssetActions 落盘，参数预览按需加载。
 */
export interface AssetInspectorProps {
    open: boolean;
    /** 车辆实例 key（asset::文件名::产品名 或 excel::…） */
    instanceKey: string | null;
    snapshot: AssetLibrarySnapshot;
    actions: AssetActions;
    onClose: () => void;
    onGoCompare: (instanceKey: string) => void;
}

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
    <div className="flex items-center gap-2 mb-3 text-title text-1">
        {icon} {children}
    </div>
);

const AssetInspector: React.FC<AssetInspectorProps> = ({ open, instanceKey, snapshot, actions, onClose, onGoCompare }) => {
    const { selectedProductNames, activeAssets } = useVehicleStore(useShallow(state => ({
        selectedProductNames: state.selectedProductNames,
        activeAssets: state.activeAssets,
    })));

    const parsed = instanceKey ? parseVehicleInstanceKey(instanceKey) : null;
    const isAsset = parsed?.source === 'asset';
    const info: AssetFileInfo | null = useMemo(() => {
        if (!parsed || parsed.source !== 'asset') return null;
        return snapshot.infos.find(i => i.fileName === parsed.fileName) ?? null;
    }, [parsed, snapshot.infos]);

    const fileName = info?.fileName ?? parsed?.fileName ?? null;
    const tags = fileName ? (snapshot.tags[fileName] || []) : [];
    const metaStatus = fileName ? snapshot.meta[fileName]?.status : undefined;
    const isLatest = fileName ? snapshot.latestSet.has(fileName) : false;
    const isActive = Boolean(instanceKey && selectedProductNames.includes(instanceKey))
        || Boolean(fileName && activeAssets.includes(fileName));

    const params = useVehicleParams(open ? instanceKey : null);
    const stats = useMemo(() => buildVehicleStats(params, info ?? undefined), [params, info]);
    const displayLabels = useMemo(
        () => (instanceKey ? buildVehicleDisplayLabels([instanceKey]).get(instanceKey) : null),
        [instanceKey],
    );

    const allTags = useMemo(() => {
        const set = new Set<string>();
        Object.values(snapshot.tags).forEach(t => t.forEach(x => set.add(x)));
        getAssetTagGroupsSync().groups.forEach(g => g.tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [snapshot.tags]);

    // 别名解析：检查器标题用短名，原名单独一行展示（设计 §D4：原名可追溯）
    const aliasSource = useMemo(
        () => buildAliasSource(snapshot.infos, snapshot.meta, snapshot.latestSet),
        [snapshot.infos, snapshot.meta, snapshot.latestSet],
    );
    const originalName = info ? getAssetDisplayName(info.fileName, info.productName) : null;
    const displayName = info
        ? resolveAssetDisplayName(info, aliasSource)
        : (displayLabels?.shortLabel || parsed?.productName || '—');
    const showOriginalName = Boolean(originalName && displayName !== originalName);
    const sourceMeta = (isAsset ? getAssetSourceMeta(tags) : null) ?? (isAsset
        ? { label: '资产库', icon: DatabaseOutlined, tone: 'asset' }
        : { label: '工作区 Excel', icon: FileOutlined, tone: 'excel' });

    return (
        <Drawer
            title={`资产检查器 · ${displayName}`}
            placement="right"
            width={640}
            open={open}
            onClose={onClose}
            destroyOnClose={false}
        >
            {parsed ? (
                <div className="space-y-6">
                    {/* 事实头 */}
                    <div>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <Tag className={`src-${sourceMeta.tone} m-0 border-0`}>
                                {React.createElement(sourceMeta.icon, { className: 'text-[11px]' })} {sourceMeta.label}
                            </Tag>
                            {isLatest && <Tag className="m-0 text-brand border-brand">最新版</Tag>}
                            {metaStatus === 'superseded' && <Tag icon={<HistoryOutlined className="text-[11px]" />} className="m-0">历史版本</Tag>}
                            {metaStatus === 'deprecated' && <Tag icon={<StopOutlined className="text-[11px]" />} className="m-0">废弃</Tag>}
                            {info?.approvalStatus === '驳回' && <Tag icon={<CloseCircleOutlined className="text-[11px]" />} className="m-0 text-warning-text border-warning">驳回</Tag>}
                            {isAsset && stats.requiredMissing.length > 0 && (
                                <Tag color="error" className="m-0">缺必填 {stats.requiredMissing.length}</Tag>
                            )}
                        </div>
                        <div className="text-page text-1 leading-tight" title={displayLabels?.fullLabel || displayName}>
                            {displayName}
                        </div>
                        {showOriginalName && (
                            <div className="mt-0.5 text-[12px] text-3 truncate" title={originalName || undefined}>
                                原始名称：{originalName}
                            </div>
                        )}
                        <div className="mt-2 text-[12px] text-3">来源文件：@{parsed.fileName}</div>
                        {isAsset && (info?.announceNos?.length ?? 0) > 0 && (
                            <div
                                className="mt-1 text-[12px] text-2 cursor-pointer hover:text-brand w-fit select-all"
                                title="点击复制公告号"
                                onClick={() => info && actions.copyAnnounceNo(info)}
                            >
                                公告号：{info!.announceNos.join('、')} <CopyOutlined className="text-[11px]" />
                            </div>
                        )}
                        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            {tags.map(tag => (
                                <Tag key={tag} className="m-0 text-[12px] px-2 py-0.5 rounded-lg surface-inset border-default text-2">{tag}</Tag>
                            ))}
                        </div>
                    </div>

                    {/* 操作区（瘦身：其余对象级动作已在卡片右键菜单，此处只留视图内高频）
                        设计文档 2026-10-14-asset-pool-* §4：检查器定位「参数详情」，
                        15 个写操作全部下沉右键；本区只保留激活/移出 + 送去对比 + 标签编辑（看到即改） */}
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            {isAsset && info && (
                                <Button
                                    size="small"
                                    icon={isActive ? <StopOutlined /> : <ThunderboltOutlined />}
                                    onClick={() => actions.toggleActive(info, isActive)}
                                >
                                    {isActive ? '移出工作集' : '激活进工作集'}
                                </Button>
                            )}
                            <Button size="small" type="primary" icon={<ArrowRightOutlined />} onClick={() => onGoCompare(instanceKey!)}>
                                送去对比
                            </Button>
                            {isAsset && info && (
                                <TagSelector
                                    selected={tags}
                                    availableTags={allTags}
                                    onChange={next => void actions.saveTags(info.fileName, next)}
                                />
                            )}
                        </div>
                        <div className="mt-2 text-caption text-3">
                            更多操作（重命名 / 别名 / 状态 / 公告 / 导出 / 删除…）在卡片上右键。
                        </div>
                    </div>

                    {/* 统计 */}
                    <div>
                        <SectionTitle icon={<CheckCircleOutlined className="text-brand" />}>完成度</SectionTitle>
                        <div className="grid grid-cols-4 gap-3">
                            <div className="rounded-xl border border-default surface-inset px-3 py-3">
                                <div className="text-[12px] text-3 mb-1">完成率</div>
                                <div className="text-stat text-brand tabular-nums">{stats.fillRate}%</div>
                            </div>
                            <div className="rounded-xl border border-default surface-inset px-3 py-3">
                                <div className="text-[12px] text-3 mb-1">参数总数</div>
                                <div className="text-stat text-1 tabular-nums">{stats.totalParams}</div>
                            </div>
                            <div className="rounded-xl border border-default surface-inset px-3 py-3">
                                <div className="text-[12px] text-3 mb-1">有效值</div>
                                <div className="text-stat text-success-text tabular-nums">{stats.filledParams}</div>
                            </div>
                            <div className="rounded-xl border border-default surface-inset px-3 py-3">
                                <div className="text-[12px] text-3 mb-1">空值</div>
                                <div className="text-stat text-2 tabular-nums">{stats.emptyParams}</div>
                            </div>
                        </div>
                    </div>

                    {/* 必填缺失 */}
                    <div>
                        <SectionTitle icon={<WarningOutlined className="text-danger" />}>必填缺失</SectionTitle>
                        {stats.requiredMissing.length > 0 ? (
                            <div className="flex gap-2 flex-wrap">
                                {stats.requiredMissing.slice(0, 16).map(param => (
                                    <Tag key={param.id} color="error" className="m-0">{param.name}</Tag>
                                ))}
                                {stats.requiredMissing.length > 16 && (
                                    <span className="text-[12px] text-3">等 {stats.requiredMissing.length} 项</span>
                                )}
                            </div>
                        ) : (
                            <Tag color="success" className="m-0">当前车型未发现必填缺失</Tag>
                        )}
                    </div>

                    {/* 分组完成度 */}
                    <div>
                        <SectionTitle icon={<CheckCircleOutlined className="text-brand" />}>分组完成度</SectionTitle>
                        {stats.groups.length > 0 ? (
                            <div className="space-y-2">
                                {stats.groups.slice(0, 10).map(group => (
                                    <div key={group.name} className="rounded-lg border border-default surface-container px-3 py-2">
                                        <div className="flex items-center justify-between gap-3 mb-1">
                                            <div className="min-w-0 text-[13px] font-semibold text-2 truncate" title={group.name}>{group.name}</div>
                                            <div className="text-[12px] font-bold text-2 whitespace-nowrap tabular-nums">
                                                {group.pct}%
                                                <span className="ml-1 font-medium text-3">{group.filled}/{group.total}</span>
                                            </div>
                                        </div>
                                        <Progress percent={group.pct} showInfo={false} strokeColor={group.pct >= 95 ? 'var(--success)' : group.pct >= 70 ? 'var(--brand)' : 'var(--warning)'} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Empty description="暂无分组统计" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                    </div>

                    {/* 参数预览（只读） */}
                    <div>
                        <SectionTitle icon={<FileOutlined className="text-brand" />}>参数预览</SectionTitle>
                        {params.length > 0 ? (
                            <div className="space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
                                {Array.from(new Set(params.map(p => p.group || '未分组'))).map(groupName => (
                                    <div key={groupName}>
                                        <div className="text-[12px] font-semibold text-2 mb-1">{groupName}</div>
                                        <div className="space-y-0.5">
                                            {params.filter(p => (p.group || '未分组') === groupName).map(param => (
                                                <div key={param.id} className="flex items-baseline gap-2 text-[12px] rounded px-2 py-1 odd:surface-inset">
                                                    <span className="text-3 min-w-[40%]">{param.name}</span>
                                                    <span className={`min-w-0 flex-1 break-all ${String(param.value ?? '').trim() ? 'text-1' : 'text-4'}`}>
                                                        {String(param.value ?? '').trim() || '—'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <Empty description="参数为空或加载中" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                    </div>

                </div>
            ) : (
                <Empty description="未选择车辆" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
        </Drawer>
    );
};

export default AssetInspector;
