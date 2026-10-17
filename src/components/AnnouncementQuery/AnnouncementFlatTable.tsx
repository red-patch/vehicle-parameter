import React from 'react';
import { Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    AimOutlined, CopyOutlined, DeleteOutlined, FileAddOutlined, FilePdfOutlined, LinkOutlined, ProfileOutlined,
} from '@ant-design/icons';
import RowActions from '../common/RowActions';
import StatusDot from '../common/StatusDot';
import { NUMERIC_COLUMN, pagePagination } from '../common/tablePresets';
import { normalizeAnnounceNo, type AnnouncementInfo } from '../../utils/announcementRecord';
import { describeLinkedAsset, formatArchiveDate, type JoinedAsset } from '../../utils/announcementGrouping';

const { Text } = Typography;

interface AnnouncementFlatTableProps {
    /** 已过 chips/搜索筛选的记录（组件内只做排序：孤儿置顶、其余按导入时间倒序） */
    infos: AnnouncementInfo[];
    linkedAssets: Map<string, JoinedAsset[]>;
    loading: boolean;
    onViewLinked: (info: AnnouncementInfo) => void;
    onOpenPdf: (info: AnnouncementInfo) => void;
    onCopyPdf: (info: AnnouncementInfo) => void;
    onViewParams: (info: AnnouncementInfo) => void;
    onReveal: (info: AnnouncementInfo) => void;
    onDelete: (info: AnnouncementInfo) => void;
    onClaimOrphan: (info: AnnouncementInfo) => void;
}

/** 平铺视图（辅助视图，行为与旧版一致）：一行 = 一条记录，全字段直读 */
const AnnouncementFlatTable: React.FC<AnnouncementFlatTableProps> = ({
    infos,
    linkedAssets,
    loading,
    onViewLinked,
    onOpenPdf,
    onCopyPdf,
    onViewParams,
    onReveal,
    onDelete,
    onClaimOrphan,
}) => {
    const sorted = React.useMemo(() => {
        const list = infos.filter(i => !i.orphan).sort((a, b) =>
            (b.importedAt || '').localeCompare(a.importedAt || ''));
        return [...infos.filter(i => i.orphan), ...list];
    }, [infos]);

    const columns: ColumnsType<AnnouncementInfo> = [
        {
            title: '车型名',
            dataIndex: 'vehicleName',
            width: 180,
            ellipsis: true,
            render: (v: string | null, info) => (
                <Space size={4}>
                    {info.orphan && <Tag color="warning">待认领</Tag>}
                    <span className={info.orphan ? 'text-3' : ''}>{v || '—'}</span>
                </Space>
            ),
        },
        { title: '公告号', dataIndex: 'announceNo', width: 170, ellipsis: true },
        // 次要列按视口断点收纳：窗口 minWidth 900（内容区 ~820px），窄窗下隐藏保证
        // 车型名/公告号/操作列放得下，否则 ellipsis 列被压到 0 只剩操作按钮（布局塌陷）
        { title: '批次', dataIndex: 'batch', width: 90, responsive: ['lg'], render: (v: string | null) => v || '—' },
        {
            title: 'PDF',
            dataIndex: 'hasPdf',
            width: 70,
            responsive: ['lg'],
            render: (has: boolean) => has
                ? <StatusDot tone="success">有</StatusDot>
                : <StatusDot tone="neutral">无</StatusDot>,
        },
        { title: '参数数', dataIndex: 'paramCount', width: 70, ...NUMERIC_COLUMN, responsive: ['xl'] },
        {
            title: '关联资产',
            width: 90,
            ...NUMERIC_COLUMN,
            render: (_, info) => {
                const count = linkedAssets.get(normalizeAnnounceNo(info.announceNo))?.length ?? 0;
                return count > 0
                    ? <Text className="text-brand">{count}</Text>
                    : <Text type="secondary">0</Text>;
            },
        },
        { title: '导入时间', dataIndex: 'importedAt', width: 140, responsive: ['xl'], render: (v: string | null) => formatArchiveDate(v) },
        {
            title: '操作',
            key: 'actions',
            width: 132,
            // 行内操作统一走 RowActions（列表区设计语言 §8）：此前 6 个按钮链接/图标/带字混排、
            // 删除常驻红色，列宽 320。现露出 2 个高频动作，其余进「更多」。
            render: (_, info) => (
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
            ),
        },
    ];

    return (
        <Table<AnnouncementInfo>
            size="small"
            rowKey={r => r.jsonFile || `pdf:${r.pdfFile}`}
            columns={columns}
            dataSource={sorted}
            loading={loading}
            pagination={pagePagination()}
            locale={{ emptyText: <Empty description="暂无归档公告" /> }}
            expandable={{
                rowExpandable: info => (linkedAssets.get(normalizeAnnounceNo(info.announceNo))?.length ?? 0) > 0,
                expandedRowRender: info => {
                    const list = linkedAssets.get(normalizeAnnounceNo(info.announceNo)) || [];
                    return (
                        <ul className="m-0 pl-4 text-aux space-y-1">
                            {list.map(a => (
                                <li key={a.fileName}>
                                    <Text className="font-medium">{describeLinkedAsset(a)}</Text>
                                </li>
                            ))}
                        </ul>
                    );
                },
            }}
        />
    );
};

export default AnnouncementFlatTable;
