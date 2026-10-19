import React from 'react';
import { Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    AimOutlined, CopyOutlined, DeleteOutlined, FileAddOutlined, FilePdfOutlined, ImportOutlined, LinkOutlined, ProfileOutlined, SwapOutlined,
} from '@ant-design/icons';
import RowActions from '../common/RowActions';
import StatusDot from '../common/StatusDot';
import { NUMERIC_COLUMN } from '../common/tablePresets';
import { normalizeAnnounceNo, type AnnouncementInfo } from '../../utils/announcementRecord';
import {
    formatArchiveDate,
    type AnnounceNode,
    type JoinedAsset,
    type VehicleGroup,
} from '../../utils/announcementGrouping';

const { Text } = Typography;

interface AnnouncementGroupedTableProps {
    groups: VehicleGroup[];
    linkedAssets: Map<string, JoinedAsset[]>;
    /** 受控展开（搜索时由父级全展开，平时用户点开） */
    expandedKeys: React.Key[];
    onExpandedKeysChange: (keys: React.Key[]) => void;
    // 批次级（叶子）
    onViewLinked: (info: AnnouncementInfo) => void;
    onOpenPdf: (info: AnnouncementInfo) => void;
    onCopyPdf: (info: AnnouncementInfo) => void;
    onViewParams: (info: AnnouncementInfo) => void;
    onReveal: (info: AnnouncementInfo) => void;
    onDelete: (info: AnnouncementInfo) => void;
    onClaimOrphan: (info: AnnouncementInfo) => void;
    // 组级 / 公告号级
    onViewGroupLinked: (group: VehicleGroup) => void;
    onImportForGroup: (vehicleName: string) => void;
    onImportNewBatch: (vehicleName: string, announceNo: string) => void;
    onCompareBatches: (group: VehicleGroup, node: AnnounceNode) => void;
}

type TreeRow =
    | { kind: 'group'; key: string; group: VehicleGroup; children: TreeRow[] }
    | { kind: 'announce'; key: string; group: VehicleGroup; node: AnnounceNode; children: TreeRow[] }
    | { kind: 'history'; key: string; group: VehicleGroup; node: AnnounceNode; children: TreeRow[] }
    | { kind: 'batch'; key: string; info: AnnouncementInfo; isHead: boolean };

const batchLabel = (info: AnnouncementInfo): string => info.batch || '无批次';

const linkedCountOf = (info: AnnouncementInfo, linkedAssets: Map<string, JoinedAsset[]>): number =>
    linkedAssets.get(normalizeAnnounceNo(info.announceNo))?.length ?? 0;

/**
 * 分组树视图（设计文档 §4.1，主视图）：车型组 → 公告号 → 批次三层，
 * 批次行保留全部行内操作；未归类桶不设公告号层直接平铺。
 */
const AnnouncementGroupedTable: React.FC<AnnouncementGroupedTableProps> = ({
    groups,
    linkedAssets,
    expandedKeys,
    onExpandedKeysChange,
    onViewLinked,
    onOpenPdf,
    onCopyPdf,
    onViewParams,
    onReveal,
    onDelete,
    onClaimOrphan,
    onViewGroupLinked,
    onImportForGroup,
    onImportNewBatch,
    onCompareBatches,
}) => {
    const rows: TreeRow[] = groups.map(group => {
        if (group.unsorted) {
            return {
                kind: 'group',
                key: `g:${group.key}`,
                group,
                children: group.records.map(info => ({
                    kind: 'batch', key: `b:${info.jsonFile || `pdf:${info.pdfFile}`}`, info, isHead: false,
                })),
            };
        }
        const children: TreeRow[] = group.announces.map(node => {
            const batchChildren: TreeRow[] = [{
                kind: 'batch',
                key: `b:${node.head.jsonFile || `pdf:${node.head.pdfFile}`}`,
                info: node.head,
                isHead: true,
            }];
            if (node.history.length > 0) {
                batchChildren.push({
                    kind: 'history',
                    key: `h:${group.key}:${normalizeAnnounceNo(node.announceNo)}`,
                    group,
                    node,
                    children: node.history.map(info => ({
                        kind: 'batch', key: `b:${info.jsonFile || `pdf:${info.pdfFile}`}`, info, isHead: false,
                    })),
                });
            }
            return {
                kind: 'announce',
                key: `a:${group.key}:${normalizeAnnounceNo(node.announceNo)}`,
                group,
                node,
                children: batchChildren,
            };
        });
        return { kind: 'group', key: `g:${group.key}`, group, children };
    });

    const columns: ColumnsType<TreeRow> = [
        {
            title: '车型 / 公告号 / 批次',
            key: 'title',
            ellipsis: true,
            render: (_, row) => {
                if (row.kind === 'group') {
                    const { group } = row;
                    return (
                        <Space size={6} wrap>
                            <span className={`font-medium ${group.unsorted ? 'text-warning' : ''}`}>{group.displayName}</span>
                            <span className="cell-sub">
                                {group.unsorted
                                    ? `${group.records.length} 条待认领`
                                    : `${group.announces.length} 公告号 · ${group.records.length} 记录`}
                            </span>
                        </Space>
                    );
                }
                if (row.kind === 'announce') {
                    const { node } = row;
                    const total = 1 + node.history.length;
                    return (
                        <Space size={6} wrap>
                            <Text code>{node.announceNo}</Text>
                            {total > 1 && <span className="cell-sub">{total} 批次</span>}
                        </Space>
                    );
                }
                if (row.kind === 'history') {
                    return <Text type="secondary">历史 {row.node.history.length} 版</Text>;
                }
                return (
                    <Space size={6} wrap>
                        <span>{batchLabel(row.info)}</span>
                        {row.isHead && <Tag color="processing">最新</Tag>}
                        {row.info.orphan && <Tag color="warning">待认领</Tag>}
                    </Space>
                );
            },
        },
        {
            title: 'PDF',
            key: 'pdf',
            width: 70,
            responsive: ['lg'],
            render: (_, row) => row.kind !== 'batch' ? null : row.info.hasPdf
                ? <StatusDot tone="success">有</StatusDot>
                : <StatusDot tone="neutral">无</StatusDot>,
        },
        {
            title: '参数数',
            key: 'paramCount',
            width: 70,
            ...NUMERIC_COLUMN,
            responsive: ['xl'],
            render: (_, row) => row.kind === 'batch' ? row.info.paramCount : null,
        },
        {
            title: '关联资产',
            key: 'linked',
            width: 90,
            ...NUMERIC_COLUMN,
            render: (_, row) => {
                const count = row.kind === 'group'
                    ? row.group.linkedAssetCount
                    : row.kind === 'announce' || row.kind === 'history'
                        ? linkedCountOf(row.node.head, linkedAssets)
                        : linkedCountOf(row.info, linkedAssets);
                return count > 0
                    ? <Text className="text-brand">{count}</Text>
                    : <Text type="secondary">0</Text>;
            },
        },
        {
            title: '导入时间',
            key: 'importedAt',
            width: 140,
            responsive: ['xl'],
            render: (_, row) => row.kind === 'batch' ? formatArchiveDate(row.info.importedAt) : null,
        },
        {
            title: '操作',
            key: 'actions',
            width: 132,
            // 行内操作统一走 RowActions（列表区设计语言 §8）：图标按钮 + Tooltip，
            // 至多露出 2 个，其余进「更多」；删除常态中性、悬停转红。此前列宽 320、
            // 链接/图标/带字三种按钮混排。
            render: (_, row) => {
                if (row.kind === 'group') {
                    return (
                        <RowActions
                            actions={[
                                {
                                    key: 'linked',
                                    label: '关联资产：跳转工作台，按该车型全部公告号过滤',
                                    icon: <LinkOutlined />,
                                    disabled: row.group.linkedAssetCount === 0,
                                    disabledReason: '该车型暂无关联资产',
                                    onClick: () => onViewGroupLinked(row.group),
                                },
                                {
                                    key: 'import',
                                    label: '导入公告',
                                    icon: <ImportOutlined />,
                                    disabled: row.group.unsorted,
                                    onClick: () => onImportForGroup(row.group.displayName),
                                },
                            ]}
                        />
                    );
                }
                if (row.kind === 'announce') {
                    const total = 1 + row.node.history.length;
                    return (
                        <RowActions
                            actions={[
                                {
                                    key: 'import-batch',
                                    label: '导入新批次',
                                    icon: <ImportOutlined />,
                                    onClick: () => onImportNewBatch(row.group.displayName, row.node.announceNo),
                                },
                                {
                                    key: 'compare',
                                    label: '对比两批次的参数差异',
                                    icon: <SwapOutlined />,
                                    disabled: total < 2,
                                    disabledReason: '该公告号只有一条批次',
                                    onClick: () => onCompareBatches(row.group, row.node),
                                },
                            ]}
                        />
                    );
                }
                if (row.kind === 'history') return null;

                const info = row.info;
                return (
                    <RowActions
                        maxVisible={info.orphan ? 1 : 2}
                        actions={[
                            info.orphan
                                ? { key: 'claim', label: '认领建档', icon: <FileAddOutlined />, showLabel: true, onClick: () => onClaimOrphan(info) }
                                : { key: 'pdf', label: '打开公告 PDF', icon: <FilePdfOutlined />, disabled: !info.hasPdf, disabledReason: '该记录没有 PDF', onClick: () => onOpenPdf(info) },
                            { key: 'params', label: '查看公告参数', icon: <ProfileOutlined />, disabled: info.orphan || info.paramCount === 0, disabledReason: '该记录没有参数', onClick: () => onViewParams(info) },
                            { key: 'linked', label: '关联资产', icon: <LinkOutlined />, onClick: () => onViewLinked(info) },
                            { key: 'copy', label: '复制 PDF 到剪贴板', icon: <CopyOutlined />, disabled: !info.hasPdf, onClick: () => onCopyPdf(info) },
                            { key: 'reveal', label: '在文件夹中定位', icon: <AimOutlined />, onClick: () => onReveal(info) },
                            { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true, onClick: () => onDelete(info) },
                        ]}
                    />
                );
            },
        },
    ];

    return (
        <Table<TreeRow>
            size="small"
            rowKey={r => r.key}
            columns={columns}
            dataSource={rows}
            loading={false}
            pagination={false}
            expandable={{
                expandedRowKeys: expandedKeys,
                onExpandedRowsChange: keys => onExpandedKeysChange([...keys]),
            }}
            locale={{ emptyText: <Empty description="暂无归档公告" /> }}
            rowClassName={r => (r.kind === 'group' ? 'group-row' : '')}
        />
    );
};

export default AnnouncementGroupedTable;
