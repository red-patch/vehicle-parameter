import React from 'react';
import { Alert, Button, Collapse, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    findConflicts,
    splitStandardNoYear,
    type RegulationRecord,
    type RegulationVocab,
    type UnregisteredFile,
} from '../../utils/regulationTypes';
import { compactPagination } from '../common/tablePresets';

const { Text } = Typography;

/** 一行可编辑的登记候选 */
interface Row {
    file: UnregisteredFile;
    standardNo: string;
    year: string;
    title: string;
    level: string;
    domains: string[];
    checked: boolean;
    /** 解析失败的进「未识别」折叠区（默认不勾） */
    recognized: boolean;
}

interface Props {
    open: boolean;
    files: UnregisteredFile[];
    vocab: RegulationVocab;
    /** 库里已有记录，用于冲突检测（同一个「身份+版本」不得静默覆盖） */
    existing: RegulationRecord[];
    onCancel: () => void;
    /** 人工确认后的登记请求（调用方负责写盘） */
    onConfirm: (entries: Array<{ file: UnregisteredFile; overrides: Partial<RegulationRecord> }>) => Promise<void>;
}

const toRow = (file: UnregisteredFile): Row => {
    const p = file.parsed;
    const recognized = !p.unparsedReason && !!p.standardNo;
    return {
        file,
        standardNo: p.standardNo,
        year: p.year ?? '',
        title: p.title,
        level: p.level,
        domains: [],
        // 人工确认制：高置信（解析出标准号）默认勾选，解析失败的默认不勾
        checked: recognized,
        recognized,
    };
};

/**
 * 登记未登记文件（设计 Q9/Q15/Q16）。
 *
 * 心智沿用公告中心的「扫描 → 候选 → 勾选才入库」：**识别只预填，勾选才入库**。
 * 解析不出标准号的文件进「未识别」折叠区，不干扰正式列表、也不阻塞入库——
 * 能不能入库由**文件名证据**决定，不由目录位置决定（设计 Q15）。
 */
const RegulationImportModal: React.FC<Props> = ({ open, files, vocab, existing, onCancel, onConfirm }) => {
    const [rows, setRows] = React.useState<Row[]>([]);
    const [submitting, setSubmitting] = React.useState(false);

    React.useEffect(() => {
        if (open) setRows(files.map(toRow));
    }, [open, files]);

    const patch = (fileName: string, p: Partial<Row>) =>
        setRows(prev => prev.map(r => (r.file.fileName === fileName ? { ...r, ...p } : r)));

    const recognized = rows.filter(r => r.recognized);
    const unrecognized = rows.filter(r => !r.recognized);
    const checkedCount = rows.filter(r => r.checked).length;

    /** 勾选项归一成登记条目：标准号与年份若被填进同一格，自动归位 */
    const buildEntries = (picked: Row[]) =>
        picked.map(r => {
            const split = splitStandardNoYear(r.standardNo);
            const year = r.year.trim() || split.year || null;
            return {
                file: r.file,
                overrides: {
                    standardNo: split.standardNo,
                    year,
                    title: r.title.trim(),
                    level: r.level,
                    domains: r.domains,
                    // 稿别预填「草案」状态（设计 Q7）
                    status:
                        r.file.parsed.marker &&
                        /征求意见稿|报批稿|送审稿|草案/.test(r.file.parsed.marker)
                            ? '草案'
                            : '',
                } satisfies Partial<RegulationRecord>,
            };
        });

    const handleConfirm = async () => {
        const picked = rows.filter(r => r.checked);
        if (picked.length === 0) {
            message.warning('请先勾选要登记的文件');
            return;
        }
        const missing = picked.find(r => !r.standardNo.trim());
        if (missing) {
            message.warning(`「${missing.file.fileName}」缺少标准号——标准号是身份键，必须填`);
            return;
        }

        const entries = buildEntries(picked);

        // 冲突检测：同一个「身份+版本」已在库里 → 必须显式确认才覆盖（ADR-0002 永不静默覆盖）
        const conflicts = findConflicts(
            existing,
            entries.map(e => ({ standardNo: e.overrides.standardNo ?? '', year: e.overrides.year ?? null })),
        );
        if (conflicts.length > 0) {
            const ok = await new Promise<boolean>(resolve => {
                Modal.confirm({
                    title: `有 ${conflicts.length} 条会覆盖库里已有的记录`,
                    content: (
                        <Space direction="vertical" size={2}>
                            <Text style={{ fontSize: 'var(--fs-aux)' }}>
                                同一个「标准号 + 年份」在库里已存在，继续登记将替换其元数据：
                            </Text>
                            {conflicts.slice(0, 8).map(c => (
                                <Text key={`${c.standardNo}-${c.year}`} style={{ fontSize: 'var(--fs-aux)' }}>
                                    · {c.standardNo} {c.year ?? ''}
                                </Text>
                            ))}
                            {conflicts.length > 8 && (
                                <Text type="secondary" style={{ fontSize: 'var(--fs-aux)' }}>
                                    …另有 {conflicts.length - 8} 条
                                </Text>
                            )}
                        </Space>
                    ),
                    okText: '覆盖',
                    cancelText: '取消',
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            });
            if (!ok) return;
        }

        setSubmitting(true);
        try {
            await onConfirm(entries);
        } finally {
            setSubmitting(false);
        }
    };

    const columns: ColumnsType<Row> = [
        {
            title: '标准号',
            dataIndex: 'standardNo',
            width: 170,
            render: (v: string, r) => (
                <Input
                    size="small"
                    value={v}
                    status={r.checked && !v.trim() ? 'error' : undefined}
                    placeholder="必填"
                    onChange={e => patch(r.file.fileName, { standardNo: e.target.value })}
                />
            ),
        },
        {
            title: '版本',
            dataIndex: 'year',
            width: 80,
            render: (v: string, r) => (
                <Input
                    size="small"
                    value={v}
                    placeholder="年份"
                    onChange={e => patch(r.file.fileName, { year: e.target.value })}
                />
            ),
        },
        {
            title: '名称',
            dataIndex: 'title',
            render: (v: string, r) => (
                <Input
                    size="small"
                    value={v}
                    onChange={e => patch(r.file.fileName, { title: e.target.value })}
                />
            ),
        },
        {
            title: '层级',
            dataIndex: 'level',
            width: 100,
            render: (v: string, r) => (
                <Select
                    size="small"
                    style={{ width: '100%' }}
                    value={v || undefined}
                    placeholder="层级"
                    onChange={val => patch(r.file.fileName, { level: val })}
                    options={vocab.levels.map(l => ({ label: l, value: l }))}
                />
            ),
        },
        {
            title: '主题域',
            dataIndex: 'domains',
            width: 200,
            render: (v: string[], r) => (
                <Select
                    size="small"
                    mode="multiple"
                    allowClear
                    style={{ width: '100%' }}
                    value={v}
                    placeholder="可多选"
                    onChange={val => patch(r.file.fileName, { domains: val })}
                    options={vocab.domains.map(d => ({ label: d, value: d }))}
                />
            ),
        },
        {
            title: '文件名',
            key: 'file',
            width: 200,
            render: (_, r) => (
                <Space size={4}>
                    <Text type="secondary" ellipsis style={{ fontSize: 'var(--fs-aux)' }} title={r.file.fileName}>
                        {r.file.fileName}
                    </Text>
                    {r.file.notDownloaded && <Tag color="orange">未下载</Tag>}
                </Space>
            ),
        },
    ];

    const rowSelection = {
        selectedRowKeys: rows.filter(r => r.checked).map(r => r.file.fileName),
        onChange: (keys: React.Key[]) => {
            const set = new Set(keys.map(String));
            setRows(prev => prev.map(r => ({ ...r, checked: set.has(r.file.fileName) })));
        },
        preserveSelectedRowKeys: true,
    };

    return (
        <Modal
            open={open}
            title={`登记文件（共 ${files.length} 个未登记）`}
            width={1080}
            onCancel={onCancel}
            destroyOnClose
            footer={[
                <Button key="cancel" onClick={onCancel}>
                    取消
                </Button>,
                <Button
                    key="ok"
                    type="primary"
                    loading={submitting}
                    disabled={checkedCount === 0}
                    onClick={handleConfirm}
                >
                    登记选中的 {checkedCount} 条
                </Button>,
            ]}
        >
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 10 }}
                message="标准号是身份键，年份是版本——同一标准号的不同年份会是同一条记录的多个版本。识别结果仅供预填，请核对后再登记。"
            />

            <Table<Row>
                size="small"
                rowKey={r => r.file.fileName}
                rowSelection={rowSelection}
                columns={columns}
                dataSource={recognized}
                pagination={compactPagination()}
                locale={{ emptyText: '没有识别出标准号的文件' }}
            />

            {unrecognized.length > 0 && (
                <Collapse
                    style={{ marginTop: 12 }}
                    items={[
                        {
                            key: 'unrecognized',
                            label: (
                                <Text type="secondary">
                                    未识别（{unrecognized.length}）——解析不出标准号的文件，不参与正式列表
                                </Text>
                            ),
                            children: (
                                <>
                                    <Text type="secondary" style={{ fontSize: 'var(--fs-aux)' }}>
                                        这些多是政策文件、研究报告或过程文件。若其中确实有标准，手动补齐标准号即可登记。
                                    </Text>
                                    <Table<Row>
                                        size="small"
                                        style={{ marginTop: 8 }}
                                        rowKey={r => r.file.fileName}
                                        rowSelection={rowSelection}
                                        columns={columns}
                                        dataSource={unrecognized}
                                        pagination={compactPagination()}
                                        locale={{ emptyText: '—' }}
                                    />
                                </>
                            ),
                        },
                    ]}
                />
            )}
        </Modal>
    );
};

export default RegulationImportModal;
