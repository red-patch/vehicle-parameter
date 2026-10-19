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
import StatusDot, { type StatusTone } from '../common/StatusDot';
import { NUMERIC_COLUMN, pagePagination } from '../common/tablePresets';

const { Text } = Typography;

interface Props {
    records: RegulationRecord[];
    loading?: boolean;
    onOpen: (record: RegulationRecord) => void;
}

/**
 * 状态 → 圆点语义档（列表区设计语言 §9：状态 = 圆点 + 文字，不用彩色 Tag 涂满整列）。
 * 此前用 antd 预设色名（green/blue/gold/orange/red），绕过曜蓝 token、暗色不翻转。
 */
const STATUS_TONE: Record<string, StatusTone> = {
    现行: 'success',
    即将实施: 'info',
    草案: 'neutral',
    已被替代: 'warning',
    废止: 'danger',
    未知: 'neutral',
};

/** 健康告警图标（详情抽屉给整句，列表只给图标 + tooltip） */
const IssueIcon: React.FC<{ record: RegulationRecord }> = ({ record }) => {
    const issue = recordIssue(record);
    if (!issue) return null;
    const map = {
        // 颜色走 token（此前写死 #cf1322 / #8c8c8c / #d46b08，暗色下不翻转）
        'file-missing': { icon: <ExclamationCircleOutlined />, color: 'var(--danger)' },
        'no-file': { icon: <FileSearchOutlined />, color: 'var(--text-3)' },
        'not-downloaded': { icon: <CloudDownloadOutlined />, color: 'var(--warning)' },
        'no-text-layer': { icon: <FileExcelOutlined />, color: 'var(--text-3)' },
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
                    // 年份 / 版本数是标准号的附属信息：次级文字（cell-sub），不是标签
                    <Space size={6}>
                        <Text strong>{rec.standardNo || <Text type="secondary">（无标准号）</Text>}</Text>
                        {rec.year && <span className="cell-sub tabular-nums">{rec.year}</span>}
                        {chainLen > 1 && (
                            <Tooltip title={`同一标准号下有 ${chainLen} 个版本，详情里可看版本链`}>
                                <span className="cell-sub">共 {chainLen} 版</span>
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
            width: 120,
            responsive: ['lg'],
            // 一格一行（§3）：「推荐性国家标准」在 80 宽下折成两行，把整行撑到 57px
            render: (l: string) =>
                l ? <span className="text-2 whitespace-nowrap">{l}</span> : <span className="text-3">—</span>,
        },
        {
            title: '主题域',
            dataIndex: 'domains',
            width: 220,
            responsive: ['xl'],
            render: (domains: string[]) =>
                domains?.length
                    ? domains.map(d => (
                          // 多值分类属性用中性 Tag（颜色不承载含义时不上色）
                          <Tag key={d} style={{ marginBottom: 2 }}>
                              {d}
                          </Tag>
                      ))
                    : <span className="text-3">—</span>,
        },
        {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_, rec) => {
                const s = deriveStatus(rec);
                return <StatusDot tone={STATUS_TONE[s] ?? 'neutral'}>{s}</StatusDot>;
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
            ...NUMERIC_COLUMN,
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
            pagination={pagePagination()}
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
export { STATUS_TONE, STATUS_ORDER };
