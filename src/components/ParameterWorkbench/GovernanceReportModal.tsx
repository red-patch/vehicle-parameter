import React, { useState } from 'react';
import { Modal, Tag, Button, Empty } from 'antd';
import { CheckOutlined, WarningFilled, CloseCircleOutlined, HistoryOutlined, StopOutlined, MergeOutlined } from '@ant-design/icons';
import type { AssetFileInfo, AssetGovernanceMeta } from '../../utils/assetManager';
import { pickGroupAlias, type GovernanceReport, type UnconvergedCar } from '../../utils/assetGovernance';

interface GovernanceReportModalProps {
    open: boolean;
    onClose: () => void;
    report: GovernanceReport | null;
    /** 版本链收敛（把同车非链头的活跃文件标为历史版本），由父组件落盘并刷新 */
    onConvergeCars: (cars: UnconvergedCar[]) => void | Promise<void>;
    /** 受控属性待补全/待归类（P4 补录闭环） */
    facetIssues?: {
        missingCount: number;
        unmapped: { dim: string; values: string[] }[];
    };
    /** 打开批量补录表格 */
    onOpenBatchEditor?: () => void;
}

const StatChip = ({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) => (
    <span className={`text-[12px] px-2 py-0.5 rounded-lg border surface-inset ${
        tone === 'warn' && value > 0 ? 'text-warning-text border-warning' : 'border-default text-2'
    }`}>
        {label} <b className="tabular-nums">{value}</b>
    </span>
);

const StatusChips = ({ info, meta, isLatest }: { info: AssetFileInfo; meta: AssetGovernanceMeta; isLatest: boolean }) => (
    <>
        {isLatest && (
            <Tag className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-brand border-brand">最新版</Tag>
        )}
        {info.approvalStatus === '驳回' && (
            <Tag icon={<CloseCircleOutlined className="text-[11px]" />} className="m-0 text-[12px] leading-[16px] px-1.5 rounded cursor-help flex-shrink-0 text-danger border-danger">驳回</Tag>
        )}
        {meta.status === 'superseded' && (
            <Tag icon={<HistoryOutlined className="text-[11px]" />} className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-2 border-default">历史版本</Tag>
        )}
        {meta.status === 'deprecated' && (
            <Tag icon={<StopOutlined className="text-[11px]" />} className="m-0 text-[12px] leading-[16px] px-1.5 rounded flex-shrink-0 text-2 border-default">废弃</Tag>
        )}
    </>
);

const CarFileRow = ({ entry, isLatest }: { entry: { info: AssetFileInfo; meta: AssetGovernanceMeta }; isLatest: boolean }) => (
    <div className="flex items-center gap-1.5 min-w-0 py-0.5">
        <span className="text-[12px] text-1 truncate flex-1" title={entry.info.fileName}>{entry.info.fileName}</span>
        <StatusChips info={entry.info} meta={entry.meta} isLatest={isLatest} />
    </div>
);

const UnconvergedCarCard = ({
    car,
    converging,
    onConverge,
}: {
    car: UnconvergedCar;
    converging: boolean;
    onConverge: (car: UnconvergedCar) => void;
}) => (
    <div className="surface-inset border border-default rounded-lg px-3 py-2 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-2">身份 <Tag className="m-0">{car.identityKey}</Tag></span>
            <span className="text-[12px] text-3">{car.files.length} 个文件</span>
            <Button
                size="small"
                type="link"
                icon={<MergeOutlined />}
                loading={converging}
                disabled={converging || !car.latestFileName}
                onClick={() => onConverge(car)}
                className="!text-[12px] ml-auto !p-0"
            >
                收敛（保留最新，其余标历史）
            </Button>
        </div>
        <div className="divide-y divide-[color:var(--border-default)]">
            {car.files.map(entry => (
                <CarFileRow key={entry.info.fileName} entry={entry} isLatest={entry.info.fileName === car.latestFileName} />
            ))}
        </div>
    </div>
);

/** 治理体检弹窗：版本链收敛 + 驳回/重复/命名问题清单（ADR-0003，主文件概念已退役） */
const GovernanceReportModal: React.FC<GovernanceReportModalProps> = ({
    open, onClose, report, onConvergeCars, facetIssues, onOpenBatchEditor,
}) => {
    const [convergingCount, setConvergingCount] = useState(0);
    // 已收敛、正在播收起动画的车：报告刷新后仍挂载 240ms，避免卡片瞬跳消失
    const [leavingCars, setLeavingCars] = useState<UnconvergedCar[]>([]);

    if (!report || report.totalFiles === 0) {
        return (
            <Modal title="数据治理体检" open={open} onCancel={onClose} footer={null} width={760}>
                <Empty description="暂无资产数据" className="py-6" />
            </Modal>
        );
    }

    const latestSet = new Set(report.latestFileNames);
    const leavingKeys = new Set(leavingCars.map(c => c.identityKey));
    const displayCars = [
        ...report.unconvergedCars.filter(c => !leavingKeys.has(c.identityKey)),
        ...leavingCars,
    ];

    const runConverge = async (cars: UnconvergedCar[]) => {
        if (cars.length === 0) return;
        setConvergingCount(cars.length);
        setLeavingCars(prev => [
            ...prev,
            ...cars.filter(c => !prev.some(p => p.identityKey === c.identityKey)),
        ]);
        try {
            await onConvergeCars(cars);
            // 等收起动画（200ms）播完再清场
            await new Promise(r => setTimeout(r, 240));
        } finally {
            setLeavingCars([]);
            setConvergingCount(0);
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
                        disabled={report.unconvergedCars.length === 0 || convergingCount > 0}
                        loading={convergingCount > 0}
                        onClick={() => runConverge(report.unconvergedCars)}
                    >
                        全部收敛{report.unconvergedCars.length > 0 ? `（${report.unconvergedCars.length} 辆车）` : ''}
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
                    <StatChip label="车辆" value={report.latestFileNames.length} />
                    <StatChip label="版本链未收敛" value={report.unconvergedCars.length} tone="warn" />
                    <StatChip label="驳回件" value={report.rejectedFiles.length} tone="warn" />
                    <StatChip label="疑似重复簇" value={report.duplicateClusters.length} tone="warn" />
                    <StatChip label="命名不规范" value={report.namingNonCompliant.length} tone="warn" />
                    {facetIssues && <StatChip label="受控属性待补全" value={facetIssues.missingCount} tone="warn" />}
                </div>

                {/* 受控属性待补全 / 待归类（批量字段维护入口） */}
                {facetIssues && (facetIssues.missingCount > 0 || facetIssues.unmapped.some(u => u.values.length > 0)) && (
                    <div className="space-y-1.5">
                        <div className="text-[13px] font-semibold text-1 flex items-center gap-2">
                            受控属性待补全 / 待归类
                            {onOpenBatchEditor && (
                                <Button size="small" type="link" className="!text-[12px] !p-0 ml-auto" onClick={onOpenBatchEditor}>
                                    打开批量字段维护 →
                                </Button>
                            )}
                        </div>
                        <div className="surface-inset border border-default rounded-lg px-3 py-2 space-y-1.5">
                            {facetIssues.missingCount > 0 && (
                                <div className="text-[12px] text-2">
                                    <b>{facetIssues.missingCount}</b> 个资产的电池品牌/电量/准入等级存在缺失（可自动派生的已派生，其余人工补录）。
                                </div>
                            )}
                            {facetIssues.unmapped.filter(u => u.values.length > 0).map(u => (
                                <div key={u.dim} className="text-[12px] text-2">
                                    {u.dim}词表外写法 <b>{u.values.length}</b> 个（未归一，不自动合并）：
                                    <span className="flex flex-wrap gap-1 mt-1">
                                        {u.values.slice(0, 12).map(v => (
                                            <Tag key={v} className="m-0">{v}</Tag>
                                        ))}
                                        {u.values.length > 12 && <span className="text-caption text-3">+{u.values.length - 12}</span>}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 版本链未收敛：收敛后卡片 grid-rows 折叠收场，而不是从列表里瞬跳消失 */}
                {displayCars.length > 0 && (
                    <div className="space-y-2">
                        <div className="text-[13px] font-semibold text-1 flex items-center gap-1.5">
                            <WarningFilled className="text-warning text-[12px]" />
                            版本链未收敛（{displayCars.length} 辆车）——同一辆车存在多份活跃版本
                        </div>
                        {displayCars.map(car => {
                            const leaving = leavingKeys.has(car.identityKey);
                            return (
                                <div
                                    key={car.identityKey}
                                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-[var(--ease-ui)] ${
                                        leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'
                                    }`}
                                >
                                    <div className="overflow-hidden min-h-0">
                                        <UnconvergedCarCard
                                            car={car}
                                            converging={convergingCount > 0}
                                            onConverge={c => runConverge([c])}
                                        />
                                    </div>
                                </div>
                            );
                        })}
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

                {/* 全部车型组一览 */}
                {report.groups.length > 0 && (
                    <div className="space-y-1">
                        <div className="text-[13px] font-semibold text-1">全部车型组（{report.totalGroups}）</div>
                        <div className="surface-inset border border-default rounded-lg px-3 py-2">
                            {report.groups.map(group => {
                                const latestCount = group.files.filter(f => latestSet.has(f.info.fileName)).length;
                                return (
                                    <div key={group.groupKey} className="flex items-center gap-2 py-0.5 min-w-0">
                                        <span className="text-[12px] text-1 font-medium flex-shrink-0">{pickGroupAlias(group.files, group.groupKey)}</span>
                                        <span className="text-[12px] text-3 flex-shrink-0">{group.files.length} 文件</span>
                                        <span className="text-[12px] text-brand flex-shrink-0">{latestCount} 辆车</span>
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
