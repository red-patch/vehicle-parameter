import React, { useMemo } from 'react';
import { Tag, Button, Tooltip } from 'antd';
import {
    ArrowRightOutlined, EditOutlined, KeyOutlined, HistoryOutlined, StopOutlined,
    DiffOutlined, ThunderboltOutlined, CloseCircleOutlined, CheckSquareOutlined, DatabaseOutlined, CopyOutlined,
} from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useVehicleStore } from '../../store/vehicleStore';
import { useVehicleParams } from '../../hooks/useVehicleParams';
import { buildVehicleStats } from '../../utils/vehicleStats';
import { useRequiredBaseline } from '../../hooks/useRequiredBaseline';
import { buildVehicleInstanceKey } from '../../utils/vehicleInstance';
import { getAssetDisplayName } from '../../utils/assetNaming';
import { buildAliasSource, resolveAssetDisplayName } from '../../utils/assetAlias';
import { getAssetSourceMeta } from '../../utils/assetSourceTags';
import { KEY_VEHICLE_TAG } from '../../utils/assetGovernance';
import { getAssetTagGroupsSync } from '../../utils/assetTagGroups';
import TagSelector from '../common/TagSelector';
import type { AssetActions } from './useAssetActions';
import type { AssetLibrarySnapshot } from '../../hooks/useAssetLibrarySnapshot';

/**
 * 「选中资产」摘要卡（设计文档 §3.2 上段）：左栏点选任意资产即刷新，
 * 快操四件套（激活/重命名/标签/公告对比）+ 详情进资产检查器；未选中时整卡不渲染。
 */
export interface AssetSummaryCardProps {
    fileName: string;
    snapshot: AssetLibrarySnapshot;
    actions: AssetActions;
    onOpenInspector: (instanceKey: string) => void;
}

const AssetSummaryCard: React.FC<AssetSummaryCardProps> = ({ fileName, snapshot, actions, onOpenInspector }) => {
    const { selectedProductNames } = useVehicleStore(useShallow(state => ({
        selectedProductNames: state.selectedProductNames,
    })));

    // 缺必填以全局必填基准（当前字段组）为准；未设基准时不显示缺必填
    const requiredBaseline = useRequiredBaseline();
    const info = useMemo(() => snapshot.infos.find(i => i.fileName === fileName) ?? null, [snapshot.infos, fileName]);
    const tags = snapshot.tags[fileName] || [];
    const metaStatus = snapshot.meta[fileName]?.status;
    const isLatest = snapshot.latestSet.has(fileName);
    const instanceKey = info ? buildVehicleInstanceKey('asset', info.fileName, info.productName) : null;
    const isActive = Boolean(instanceKey && selectedProductNames.includes(instanceKey));

    const params = useVehicleParams(instanceKey);
    const stats = useMemo(
        () => buildVehicleStats(params, info ?? undefined, requiredBaseline),
        [params, info, requiredBaseline],
    );

    const allTags = useMemo(() => {
        const set = new Set<string>();
        Object.values(snapshot.tags).forEach(t => t.forEach(x => set.add(x)));
        getAssetTagGroupsSync().groups.forEach(g => g.tags.forEach(t => set.add(t)));
        return Array.from(set).sort();
    }, [snapshot.tags]);

    if (!info) return null;
    const originalName = getAssetDisplayName(info.fileName, info.productName);
    // 别名优先显示（设计 §D4）；原名作为副行保留
    const aliasSource = buildAliasSource(snapshot.infos, snapshot.meta, snapshot.latestSet);
    const displayName = resolveAssetDisplayName(info, aliasSource);
    const showOriginalName = displayName !== originalName;
    const sourceMeta = getAssetSourceMeta(tags) ?? { label: '资产库', icon: DatabaseOutlined, tone: 'asset' };

    return (
        <div className="flex-none border-b border-default surface-inset px-4 py-3">
            <div className="flex items-center gap-2 flex-wrap">
                <CheckSquareOutlined className="text-brand text-[13px] flex-shrink-0" />
                <span className="font-semibold text-sm truncate text-1 max-w-[60%]" title={displayName}>{displayName}</span>
                <Tag className={`src-${sourceMeta.tone} m-0 border-0 text-[11px]`}>
                    {React.createElement(sourceMeta.icon, { className: 'text-[10px]' })} {sourceMeta.label}
                </Tag>
                {isLatest && <Tag className="m-0 text-[11px] text-brand border-brand">最新版</Tag>}
                {metaStatus === 'superseded' && <Tag icon={<HistoryOutlined className="text-[10px]" />} className="m-0 text-[11px]">历史</Tag>}
                {metaStatus === 'deprecated' && <Tag icon={<StopOutlined className="text-[10px]" />} className="m-0 text-[11px]">废弃</Tag>}
                {info.approvalStatus === '驳回' && <Tag icon={<CloseCircleOutlined className="text-[10px]" />} className="m-0 text-[11px] text-warning-text border-warning">驳回</Tag>}
            </div>
            {showOriginalName && (
                <div className="mt-1 text-[11px] text-3 truncate" title={originalName}>{originalName}</div>
            )}
            <div className="mt-1 text-[12px] text-3 truncate" title={info.fileName}>@{info.fileName}</div>
            <div className="mt-1 text-[12px] text-2 tabular-nums">
                {(info.announceNos?.length ?? 0) > 0 && (
                    <span
                        className="cursor-pointer hover:text-brand select-all"
                        title="点击复制公告号"
                        onClick={() => actions.copyAnnounceNo(info)}
                    >
                        公告号 {info.announceNos.join('、')} <CopyOutlined className="text-[11px]" /> ·{' '}
                    </span>
                )}
                <span>完成率 {stats.fillRate}%</span>
                {stats.requiredMissing.length > 0 && (
                    <span className="text-danger"> · 缺必填 {stats.requiredMissing.length}</span>
                )}
            </div>
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
                {tags.slice(0, 4).map(tag => (
                    <Tag key={tag} className="m-0 text-[11px] px-2 py-0 rounded surface-inset border-default text-3">{tag}</Tag>
                ))}
                <TagSelector
                    selected={tags}
                    availableTags={allTags}
                    onChange={next => void actions.saveTags(info.fileName, next)}
                />
            </div>
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <Button
                    size="small"
                    icon={isActive ? <StopOutlined /> : <ThunderboltOutlined />}
                    onClick={() => actions.toggleActive(info, isActive)}
                >
                    {isActive ? '移出' : '激活'}
                </Button>
                <Button size="small" icon={<EditOutlined />} onClick={() => actions.startRename(info)}>重命名</Button>
                <Tooltip title="与公告对比">
                    <Button size="small" icon={<DiffOutlined />} onClick={() => actions.compareWithAnnouncement(info)} />
                </Tooltip>
                <Tooltip title={tags.includes(KEY_VEHICLE_TAG) ? '取消关键车型' : '标记为关键车型'}>
                    <Button
                        size="small"
                        icon={<KeyOutlined className={tags.includes(KEY_VEHICLE_TAG) ? 'text-brand' : undefined} />}
                        onClick={() => void actions.toggleKeyVehicle(info)}
                    />
                </Tooltip>
                <Button
                    size="small"
                    type="primary"
                    icon={<ArrowRightOutlined />}
                    onClick={() => instanceKey && onOpenInspector(instanceKey)}
                >
                    详情
                </Button>
            </div>
        </div>
    );
};

export default AssetSummaryCard;
