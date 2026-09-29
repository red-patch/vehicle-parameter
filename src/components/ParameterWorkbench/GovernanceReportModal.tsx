import React, { useState } from 'react';
import { Modal, Tag, Button, Empty } from 'antd';
import { CrownFilled, CheckOutlined, WarningFilled } from '@ant-design/icons';
import type { AssetFileInfo, AssetGovernanceMeta } from '../../utils/assetManager';
import type { GovernanceReport, VehicleGroup, GovernanceFileEntry } from '../../utils/assetGovernance';

interface GovernanceReportModalProps {
    open: boolean;
    onClose: () => void;
    report: GovernanceReport | null;
    /** 采纳（若干组的）主文件建议，由父组件落盘并刷新 */
    onAdoptGroups: (groups: VehicleGroup[]) => void | Promise<void>;
}

const StatChip = ({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) => (
    <span className={`text-[12px] px-2 py-0.5 rounded-lg border surface-inset ${
        tone === 'warn' && value > 0 ? 'text-warning-text border-warning' : 'border-default text-2'
    }`}>
        {label} <b className="tabular-nums">{value}</b>
    </span>
);

const LevelChip = ({ info }: { info: AssetFileInfo }) => (
    info.hasAdmissionInfo
        ? <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-2 border-default">🏛 准入</Tag>
        : <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-3 border-default">🛠 开发</Tag>
);

const StatusChips = ({ info, meta }: { info: AssetFileInfo; meta: AssetGovernanceMeta }) => (
    <>
        {meta.isPrimary && (
            <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-brand border-brand">👑 主文件</Tag>
        )}
        {info.approvalStatus === '驳回' && (
            <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-danger border-danger">⚠ 驳回</Tag>
        )}
        {meta.status === 'superseded' && (
            <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-2 border-default">🕘 历史版本</Tag>
        )}
        {meta.status === 'deprecated' && (
            <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-2 border-default">🚫 废弃</Tag>
        )}
    </>
);

const GroupFileRow = ({ entry }: { entry: GovernanceFileEntry }) => (
    <div className="flex items-center gap-1.5 min-w-0 py-0.5">
        <span className="text-[12px] text-1 truncate flex-1" title={entry.info.fileName}>{entry.info.fileName}</span>
        <LevelChip info={entry.info} />
        <StatusChips info={entry.info} meta={entry.meta} />
    </div>
);

const PendingGroupCard = ({
    group,
    adopting,
    onAdopt,
}: {
    group: VehicleGroup;
    adopting: boolean;
    onAdopt: (group: VehicleGroup) => void;
}) => {
    const primaries = group.files.filter(f => f.meta.isPrimary);
    return (
        <div key={group.groupKey} className="surface-inset border border-default rounded-lg px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[13px] font-semibold text-1">{group.groupKey}</span>
                <span className="text-[12px] text-3">{group.files.length} 个文件</span>
                {primaries.length > 1 && (
                    <span className="text-[12px] text-warning-text">
                        当前 {primaries.length} 个主文件（{primaries.map(p => p.info.fileName).join('、')}）
                    </span>
                )}
                <Button
                    size="small"
                    type="link"
                    icon={<CheckOutlined />}
                    loading={adopting}
                    disabled={adopting}
                    onClick={() => onAdopt(group)}
                    className="!text-[12px] ml-auto !p-0"
                >
                    采纳建议
                </Button>
            </div>
            {group.suggestedPrimary && (
                <div className="text-[12px] text-2 flex items-center gap-1">
                    <CrownFilled className="text-brand text-[11px]" />
                    建议主文件：<span className="text-brand font-medium">{group.suggestedPrimary}</span>
                </div>
            )}
            <div className="divide-y divide-[color:var(--line)]">
                {group.files.map(entry => <GroupFileRow key={entry.info.fileName} entry={entry} />)}
            </div>
        </div>
    );
};

/** 治理体检弹窗：车型分组总览 + 主文件建议采纳 + 驳回/重复/命名问题清单 */
const GovernanceReportModal: React.FC<GovernanceReportModalProps> = ({ open, onClose, report, onAdoptGroups }) => {
    const [adoptingCount, setAdoptingCount] = useState(0);

    if (!report || report.totalFiles === 0) {
        return (
            <Modal title="数据治理体检" open={open} onCancel={onClose} footer={null} width={760}>
                <Empty description="暂无资产数据" className="py-6" />
            </Modal>
        );
    }

    const pendingGroups = [...report.missingPrimaryGroups, ...report.multiPrimaryGroups];
    const healthyGroups = report.groups.filter(g => !pendingGroups.some(p => p.groupKey === g.groupKey));

    const runAdopt = async (groups: VehicleGroup[]) => {
        if (groups.length === 0) return;
        setAdoptingCount(groups.length);
        try {
            await onAdoptGroups(groups);
        } finally {
            setAdoptingCount(0);
        }
    };

    return (
        <Modal
            title="数据治理体检"
            open={open}
            onCancel={onClose}
            width={760}
            footer={
                <div className="flex items-center gap-2">
                    <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        disabled={pendingGroups.length === 0 || adoptingCount > 0}
                        loading={adoptingCount > 0}
                        onClick={() => runAdopt(pendingGroups)}
                    >
                        全部采纳建议{pendingGroups.length > 0 ? `（${pendingGroups.length} 组）` : ''}
                    </Button>
                    <Button onClick={onClose}>关闭</Button>
                </div>
            }
        >
            <div className="py-2 space-y-3 max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">
                {/* 总览 */}
                <div className="flex flex-wrap gap-1.5 items-center">
                    <StatChip label="文件" value={report.totalFiles} />
                    <StatChip label="车型组" value={report.totalGroups} />
                    <StatChip label="缺主文件组" value={report.missingPrimaryGroups.length} tone="warn" />
                    <StatChip label="多主文件组" value={report.multiPrimaryGroups.length} tone="warn" />
                    <StatChip label="驳回件" value={report.rejectedFiles.length} tone="warn" />
                    <StatChip label="疑似重复簇" value={report.duplicateClusters.length} tone="warn" />
                    <StatChip label="命名不规范" value={report.namingNonCompliant.length} tone="warn" />
                </div>

                {/* 待处理组 */}
                {pendingGroups.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[13px] font-semibold text-1 flex items-center gap-1.5">
                            <WarningFilled className="text-warning text-[12px]" />
                            待处理（{pendingGroups.length} 组）
                        </div>
                        {pendingGroups.map(group => (
                            <PendingGroupCard
                                key={group.groupKey}
                                group={group}
                                adopting={adoptingCount > 0}
                                onAdopt={g => runAdopt([g])}
                            />
                        ))}
                    </div>
                )}

                {/* 疑似重复 */}
                {report.duplicateClusters.length > 0 && (
                    <div className="space-y-1.5">
                        <div className="text-[13px] font-semibold text-1">疑似重复（同车辆型号 / 公告号）</div>
                        {report.duplicateClusters.map((cluster, idx) => (
                            <div key={idx} className="surface-inset border border-default rounded-lg px-3 py-2">
                                <div className="text-[12px] text-2 mb-1">
                                    {cluster.keys.length > 0 ? cluster.keys.join(' / ') : '（无公告号）'}
                                    <span className="text-3 ml-2">{cluster.fileNames.length} 个文件</span>
                                </div>
                                {cluster.fileNames.map(name => (
                                    <div key={name} className="text-[12px] text-3 truncate" title={name}>· {name}</div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}

                {/* 驳回件 */}
                {report.rejectedFiles.length > 0 && (
                    <div className="space-y-1.5">
                        <div className="text-[13px] font-semibold text-1">驳回件（准入审批未通过，建议标记废弃或重报后清理）</div>
                        <div className="surface-inset border border-default rounded-lg px-3 py-2">
                            {report.rejectedFiles.map(info => (
                                <div key={info.fileName} className="text-[12px] text-3 truncate" title={info.fileName}>· {info.fileName}</div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 命名不规范 */}
                {report.namingNonCompliant.length > 0 && (
                    <div className="text-[12px] text-2 surface-inset border border-default rounded-lg px-3 py-2">
                        命名不规范 <b>{report.namingNonCompliant.length}</b> 个（未包含公告号），可在资产面板顶部的提醒条中一键修复。
                    </div>
                )}

                {/* 已治理组一览 */}
                {healthyGroups.length > 0 && (
                    <div className="space-y-1">
                        <div className="text-[13px] font-semibold text-1">全部车型组（{report.totalGroups}）</div>
                        <div className="surface-inset border border-default rounded-lg px-3 py-2">
                            {report.groups.map(group => {
                                const primary = group.files.find(f => f.meta.isPrimary);
                                return (
                                    <div key={group.groupKey} className="flex items-center gap-2 py-0.5 min-w-0">
                                        <span className="text-[12px] text-1 font-medium flex-shrink-0">{group.groupKey}</span>
                                        <span className="text-[12px] text-3 flex-shrink-0">{group.files.length}</span>
                                        {primary ? (
                                            <span className="text-[12px] text-brand truncate" title={primary.info.fileName}>👑 {primary.info.fileName}</span>
                                        ) : (
                                            <span className="text-[12px] text-warning-text flex-shrink-0">缺主文件</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default GovernanceReportModal;
