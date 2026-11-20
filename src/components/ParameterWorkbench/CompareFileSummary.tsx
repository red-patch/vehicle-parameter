import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { DownOutlined, HistoryOutlined, StopOutlined, UpOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '../common/DataTable';
import StatusDot from '../common/StatusDot';
import RowActions, { type RowAction } from '../common/RowActions';
import { parseVehicleInstanceKey } from '../../utils/vehicleInstance';
import type { CompareFileSummary as FileSummaryRow } from '../../utils/assetCompare';

/**
 * 版本对比页顶部的「文件维度」汇总（字段表之前）。
 *
 * 为什么放在这里而不是另开弹窗：对比页已经加载了这批文件，字段表也在这里；
 * 再维护一套独立视图，两边迟早对不上。文件维度回答「这些文件是不是同一份数据、
 * 哪份最全」，字段维度回答「具体差在哪」，一屏内完成。
 *
 * 口径见 `utils/assetCompare.ts`：有效字段剔纯符号占位、保留「无」；
 * 覆盖率分母是**参与对比的字段并集**，不是各自模板行数——后者会让同一份数据
 * 显示成 70% 和 74%（实测 V6E 那 5 份都是 352 个有效值，模板行数 478/503/505）。
 */

export interface CompareFileSummaryProps {
    rows: FileSummaryRow[];
    /** 实例键 → 显示名（短标签） */
    labels: Map<string, string>;
    contentClassCount: number;
    unionSize: number;
    /** 仅资产来源可打生命周期状态；Excel 来源不出现操作 */
    statusByFile?: Record<string, 'superseded' | 'deprecated' | undefined>;
    onSetStatus?: (fileName: string, status: 'superseded' | 'deprecated') => void;
}

const textOrDash = (value: string) =>
    value ? <span className="text-1">{value}</span> : <span className="text-3">—</span>;

const CompareFileSummary: React.FC<CompareFileSummaryProps> = ({
    rows,
    labels,
    contentClassCount,
    unionSize,
    statusByFile = {},
    onSetStatus,
}) => {
    const [expanded, setExpanded] = useState(true);

    if (rows.length === 0) return null;

    const effectiveValues = rows.map(r => r.effective);
    const minEffective = Math.min(...effectiveValues);
    const maxEffective = Math.max(...effectiveValues);

    const columns: ColumnsType<FileSummaryRow> = [
        {
            title: '文件',
            key: 'file',
            width: 240,
            fixed: 'left',
            ellipsis: true,
            render: (_: unknown, row) => (
                <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="truncate" title={labels.get(row.instanceKey) || row.instanceKey}>
                        {labels.get(row.instanceKey) || row.instanceKey}
                    </span>
                    {row.isBaseline && <span className="text-3 text-caption shrink-0">基准</span>}
                </span>
            ),
        },
        // 完整度三列紧跟文件名：横向滚动时也要先看到「哪份最全、哪份内容相同」
        {
            title: '有效字段',
            key: 'effective',
            width: 96,
            align: 'right',
            sorter: (a, b) => a.effective - b.effective,
            render: (_: unknown, row) => (
                <Tooltip title={`已填 ${row.filled} · 占位 ${row.placeholder} · 总参数 ${row.total}`}>
                    <span className="tabular-nums">{row.effective}</span>
                </Tooltip>
            ),
        },
        {
            title: '覆盖率',
            key: 'coverage',
            width: 84,
            align: 'right',
            sorter: (a, b) => a.coverage - b.coverage,
            render: (_: unknown, row) => (
                <Tooltip title={`有效字段 ${row.effective} / 参与对比字段并集 ${unionSize}`}>
                    <span className="tabular-nums">{Math.round(row.coverage * 100)}%</span>
                </Tooltip>
            ),
        },
        {
            title: '与基准差异',
            key: 'diff',
            width: 104,
            align: 'right',
            render: (_: unknown, row) => {
                if (row.isBaseline) return <span className="text-3">—</span>;
                if (row.identicalToBaseline) return <StatusDot tone="info">内容相同</StatusDot>;
                return (
                    <Tooltip title="仅基准有 + 仅此份有 + 值不同（缺失与空等价）">
                        <span className="tabular-nums">{row.diffCount}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: '公告号',
            key: 'announceNo',
            width: 140,
            ellipsis: true,
            render: (_: unknown, row) => textOrDash(row.profile.announceNo),
        },
        {
            title: '准入编号',
            key: 'admissionNo',
            width: 140,
            ellipsis: true,
            render: (_: unknown, row) => textOrDash(row.profile.admissionNo),
        },
        {
            title: '品牌',
            key: 'manufacturer',
            width: 180,
            ellipsis: true,
            render: (_: unknown, row) => (
                <Tooltip title={row.profile.manufacturer || undefined}>
                    {row.profile.manufacturer
                        ? <span className="truncate">{row.profile.manufacturer}</span>
                        : <span className="text-3">—</span>}
                </Tooltip>
            ),
        },
        {
            title: '车辆型号',
            key: 'model',
            width: 140,
            ellipsis: true,
            render: (_: unknown, row) => textOrDash(row.profile.model),
        },
        {
            title: '等级',
            key: 'admissionLevel',
            width: 72,
            render: (_: unknown, row) => textOrDash(row.profile.admissionLevel),
        },
        {
            title: '电池品牌',
            key: 'batteryBrand',
            width: 180,
            ellipsis: true,
            render: (_: unknown, row) => (
                <Tooltip title={row.profile.batteryBrand || undefined}>
                    {row.profile.batteryBrand
                        ? <span className="truncate">{row.profile.batteryBrand}</span>
                        : <span className="text-3">—</span>}
                </Tooltip>
            ),
        },
        {
            title: '电量',
            key: 'capacity',
            width: 90,
            render: (_: unknown, row) => textOrDash(row.profile.capacity),
        },
        {
            title: '状态',
            key: 'status',
            width: 96,
            render: (_: unknown, row) => {
                const parsed = parseVehicleInstanceKey(row.instanceKey);
                if (!parsed || parsed.source !== 'asset') return <span className="text-3">—</span>;
                const status = statusByFile[parsed.fileName];
                if (status === 'superseded') return <StatusDot tone="neutral">历史版本</StatusDot>;
                if (status === 'deprecated') return <StatusDot tone="neutral">废弃</StatusDot>;
                return <span className="text-3">—</span>;
            },
        },
        {
            title: '操作',
            key: 'actions',
            width: 90,
            render: (_: unknown, row) => {
                const parsed = parseVehicleInstanceKey(row.instanceKey);
                if (!parsed || parsed.source !== 'asset' || !onSetStatus) return null;
                const status = statusByFile[parsed.fileName];
                const actions: RowAction[] = [
                    {
                        key: 'superseded',
                        label: status === 'superseded' ? '清除历史版本标记' : '标记为历史版本',
                        icon: <HistoryOutlined />,
                        onClick: () => onSetStatus(parsed.fileName, 'superseded'),
                    },
                    {
                        key: 'deprecated',
                        label: status === 'deprecated' ? '清除废弃标记' : '标记为废弃',
                        icon: <StopOutlined />,
                        onClick: () => onSetStatus(parsed.fileName, 'deprecated'),
                    },
                ];
                return <RowActions actions={actions} maxVisible={2} />;
            },
        },
    ];

    return (
        <div className="shrink-0 border-b border-default">
            <div className="flex items-center gap-2 px-3 py-1.5">
                <span className="text-body font-medium text-1">文件维度</span>
                <span className="text-caption text-3 tabular-nums">
                    {rows.length} 份 · 内容 {contentClassCount} 种 · 有效字段 {minEffective === maxEffective ? minEffective : `${minEffective}–${maxEffective}`}
                </span>
                <Button
                    type="text"
                    size="small"
                    className="ml-auto"
                    aria-label={expanded ? '收起文件维度' : '展开文件维度'}
                    icon={expanded ? <UpOutlined /> : <DownOutlined />}
                    onClick={() => setExpanded(v => !v)}
                />
            </div>
            {expanded && (
                <div className="px-3 pb-2">
                    <DataTable
                        dataSource={rows}
                        columns={columns}
                        rowKey="instanceKey"
                        pagination={false}
                        scrollY={rows.length > 6 ? 200 : undefined}
                        rowClassName={(row: FileSummaryRow) => row.isBaseline ? 'font-medium' : ''}
                    />
                </div>
            )}
        </div>
    );
};

export default CompareFileSummary;
