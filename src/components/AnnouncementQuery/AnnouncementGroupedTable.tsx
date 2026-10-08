import React from 'react';
import { Button, Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    AimOutlined, CopyOutlined, DeleteOutlined, FilePdfOutlined, ImportOutlined, LinkOutlined, ProfileOutlined, SwapOutlined,
} from '@ant-design/icons';
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
                            <Text type="secondary" className="text-xs">
                                {group.unsorted
                                    ? `${group.records.length} 条待认领`
                                    : `${group.announces.length} 公告号 · ${group.records.length} 记录`}
                            </Text>
                        </Space>
                    );
                }
                if (row.kind === 'announce') {
                    const { node } = row;
                    const total = 1 + node.history.length;
                    return (
                        <Space size={6} wrap>
                            <Text code>{node.announceNo}</Text>
                            {total > 1 && <Tag className="text-xs">{total} 批次</Tag>}
                        </Space>
                    );
                }
                if (row.kind === 'history') {
                    return <Text type="secondary">历史 {row.node.history.length} 版</Text>;
                }
                return (
                    <Space size={6} wrap>
                        <span>{batchLabel(row.info)}</span>
                        {row.isHead && <Tag color="processing" className="text-xs">最新</Tag>}
                        {row.info.orphan && <Tag color="warning" className="text-xs">待认领</Tag>}
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
                ? <Tag icon={<FilePdfOutlined />} color="success">有</Tag>
                : <Tag>无</Tag>,
        },
        {
            title: '参数数',
            key: 'paramCount',
            width: 70,
            align: 'right' as const,
            responsive: ['xl'],
            render: (_, row) => row.kind === 'batch' ? row.info.paramCount : null,
        },
        {
            title: '关联资产',
            key: 'linked',
            width: 90,
            align: 'right' as const,
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
            width: 320,
            render: (_, row) => {
                if (row.kind === 'group') {
                    return (
                        <Space size={0}>
                            <Tooltip title={row.group.linkedAssetCount === 0 ? '该车型暂无关联资产' : '跳转工作台，按该车型全部公告号过滤'}>
                                <Button
                                    type="link"
                                    size="small"
                                    icon={<LinkOutlined />}
                                    disabled={row.group.linkedAssetCount === 0}
                                    onClick={() => onViewGroupLinked(row.group)}
                                >
                                    关联资产
                                </Button>
                            </Tooltip>
                            <Button
                                type="link"
                                size="small"
                                icon={<ImportOutlined />}
                                disabled={row.group.unsorted}
                                onClick={() => onImportForGroup(row.group.displayName)}
                            >
                                导入公告
                            </Button>
                        </Space>
                    );
                }
                if (row.kind === 'announce') {
                    const total = 1 + row.node.history.length;
                    return (
                        <Space size={0}>
                            <Button
                                type="link"
                                size="small"
                                icon={<ImportOutlined />}
                                onClick={() => onImportNewBatch(row.group.displayName, row.node.announceNo)}
                            >
                                导入新批次
                            </Button>
                            <Tooltip title={total < 2 ? '该公告号只有一条批次' : '对比两批次的参数差异'}>
                                <Button
                                    type="link"
                                    size="small"
                                    icon={<SwapOutlined />}
                                    disabled={total < 2}
                                    onClick={() => onCompareBatches(row.group, row.node)}
                                >
                                    对比批次
                                </Button>
                            </Tooltip>
                        </Space>
                    );
                }
                if (row.kind === 'history') return null;

                const info = row.info;
                return (
                    <Space size={0}>
                        {info.orphan ? (
                            <Button type="link" size="small" onClick={() => onClaimOrphan(info)}>
                                认领建档
                            </Button>
                        ) : (
                            <Tooltip title={info.hasPdf ? '打开公告 PDF' : '该记录没有 PDF'}>
                                <Button type="link" size="small" icon={<FilePdfOutlined />} disabled={!info.hasPdf} onClick={() => onOpenPdf(info)} />
                            </Tooltip>
                        )}
                        <Tooltip title={info.hasPdf ? '复制 PDF 到剪贴板，可直接粘贴发给他人' : '该记录没有 PDF'}>
                            <Button type="link" size="small" icon={<CopyOutlined />} disabled={!info.hasPdf} onClick={() => onCopyPdf(info)} />
                        </Tooltip>
                        <Tooltip title={info.paramCount > 0 ? '查看公告参数' : '该记录没有参数'}>
                            <Button
                                type="link"
                                size="small"
                                icon={<ProfileOutlined />}
                                disabled={info.orphan || info.paramCount === 0}
                                onClick={() => onViewParams(info)}
                            >
                                参数
                            </Button>
                        </Tooltip>
                        <Button type="link" size="small" icon={<LinkOutlined />} onClick={() => onViewLinked(info)}>
                            关联资产
                        </Button>
                    <Tooltip title="在文件夹中定位">
                        <Button type="link" size="small" icon={<AimOutlined />} onClick={() => onReveal(info)} />
                    </Tooltip>
                        <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(info)}>
                            删除
                        </Button>
                    </Space>
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
