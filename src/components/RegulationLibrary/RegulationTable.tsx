import React from 'react';
import { Empty, Space, Table, Tag, Tooltip, Typography } from 'antd';
import {
    ExclamationCircleOutlined,
    FileExcelOutlined,
    FileSearchOutlined,
    LinkOutlined,
    CloudDownloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import {
    buildVersionChains,
    deriveStatus,
    formatSize,
    issueText,
    recordIssue,
    STATUS_ORDER,
    type RegulationRecord,
} from '../../utils/regulationTypes';

const { Text } = Typography;

interface Props {
    records: RegulationRecord[];
    loading?: boolean;
    onOpen: (record: RegulationRecord) => void;
}

const STATUS_COLOR: Record<string, string> = {
    现行: 'green',
    即将实施: 'blue',
    草案: 'gold',
    已被替代: 'orange',
    废止: 'red',
    未知: 'default',
};

/** 健康告警图标（详情抽屉给整句，列表只给图标 + tooltip） */
const IssueIcon: React.FC<{ record: RegulationRecord }> = ({ record }) => {
    const issue = recordIssue(record);
    if (!issue) return null;
    const map = {
        'file-missing': { icon: <ExclamationCircleOutlined />, color: '#cf1322' },
        'no-file': { icon: <FileSearchOutlined />, color: '#8c8c8c' },
        'not-downloaded': { icon: <CloudDownloadOutlined />, color: '#d46b08' },
        'no-text-layer': { icon: <FileExcelOutlined />, color: '#8c8c8c' },
    } as const;
    const { icon, color } = map[issue];
    return (
        <Tooltip title={issueText[issue]}>
            <span style={{ color, marginLeft: 6 }}>{icon}</span>
        </Tooltip>
    );
};

/**
 * 法规列表（设计 Q13：单层表格，不造树）。
 *
 * 同身份多版本时主行显示最新版，并在标准号后标注「共 N 版」——版本链细节在详情抽屉里。
 */
const RegulationTable: React.FC<Props> = ({ records, loading, onOpen }) => {
    const chains = React.useMemo(() => buildVersionChains(records), [records]);

    const columns: ColumnsType<RegulationRecord> = [
        {
            title: '标准号',
            dataIndex: 'standardNo',
            width: 190,
            render: (_, rec) => {
                const chainLen = chains.get(rec.standardNo)?.length ?? 1;
                return (
                    <Space size={4}>
                        <Text strong>{rec.standardNo || <Text type="secondary">（无标准号）</Text>}</Text>
                        {rec.year && <Tag color="default">{rec.year}</Tag>}
                        {chainLen > 1 && (
                            <Tooltip title={`同一标准号下有 ${chainLen} 个版本，详情里可看版本链`}>
                                <Tag color="purple">共 {chainLen} 版</Tag>
                            </Tooltip>
                        )}
                        <IssueIcon record={rec} />
                    </Space>
                );
            },
        },
        {
            title: '名称',
            dataIndex: 'title',
            render: (t: string) => <Text ellipsis={{ tooltip: t }}>{t || '—'}</Text>,
        },
        {
            title: '层级',
            dataIndex: 'level',
            width: 80,
            responsive: ['lg'],
            render: (l: string) => (l ? <Tag>{l}</Tag> : '—'),
        },
        {
            title: '主题域',
            dataIndex: 'domains',
            width: 220,
            responsive: ['xl'],
            render: (domains: string[]) =>
                domains?.length
                    ? domains.map(d => (
                          <Tag key={d} color="geekblue" style={{ marginBottom: 2 }}>
                              {d}
                          </Tag>
                      ))
                    : '—',
        },
        {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_, rec) => {
                const s = deriveStatus(rec);
                return <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>;
            },
        },
        {
            title: '实施日期',
            dataIndex: 'effectiveAt',
            width: 110,
            responsive: ['xl'],
            render: (d: string | null, rec) => d || <Text type="secondary">{rec.publishedAt ?? '—'}</Text>,
        },
        {
            title: '文件',
            key: 'file',
            width: 100,
            responsive: ['lg'],
            render: (_, rec) => {
                if (!rec.fileName) return <Text type="secondary">无文件</Text>;
                return (
                    <Tooltip title={rec.fileName}>
                        <Space size={4}>
                            <LinkOutlined />
                            <Text type="secondary">{formatSize(rec.fileSize)}</Text>
                        </Space>
                    </Tooltip>
                );
            },
        },
    ];

    return (
        <Table<RegulationRecord>
            size="small"
            rowKey={rec => `${rec.standardNo}@${rec.year ?? ''}`}
            loading={loading}
            columns={columns}
            dataSource={records}
            pagination={records.length > 50 ? { pageSize: 50, showSizeChanger: false } : false}
            onRow={rec => ({
                onClick: () => onOpen(rec),
                style: { cursor: 'pointer' },
            })}
            locale={{
                emptyText: (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="库里还没有记录——先选目录，再把扫描到的文件登记进来"
                    />
                ),
            }}
            rowClassName={rec =>
                // 已被替代/废止的历史版本降权展示（旧版永不删，但不应抢注意力）
                ['已被替代', '废止'].includes(deriveStatus(rec)) ? 'opacity-50' : ''
            }
            sortDirections={['descend', 'ascend']}
        />
    );
};

export default RegulationTable;
export { STATUS_COLOR, STATUS_ORDER };
