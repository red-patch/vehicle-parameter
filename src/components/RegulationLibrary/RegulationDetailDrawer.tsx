import React from 'react';
import {
    Alert,
    Button,
    Descriptions,
    Divider,
    Drawer,
    Empty,
    Form,
    Input,
    Modal,
    Select,
    Space,
    Switch,
    Tag,
    Typography,
    message,
} from 'antd';
import { DeleteOutlined, EditOutlined, ExportOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    baseNameOf,
    buildVersionChains,
    deriveStatus,
    formatSize,
    issueText,
    recordIssue,
    sitesForLevel,
    splitStandardNoYear,
    STATUS_VALUES,
    type RegulationRecord,
    type RegulationVocab,
    type SiteTemplate,
} from '../../utils/regulationTypes';
import { STATUS_COLOR } from './RegulationTable';

const { Text, Title } = Typography;

interface Props {
    open: boolean;
    record: RegulationRecord | null;
    allRecords: RegulationRecord[];
    sites: SiteTemplate[];
    vocab: RegulationVocab;
    /** 打开原件（系统默认应用；设计 Q17：无法定位到命中页） */
    onOpenFile: (record: RegulationRecord) => void;
    /** 切到版本链里的另一版 */
    onSelectVersion: (record: RegulationRecord) => void;
    /** 保存编辑（身份+版本 或 其它字段变更） */
    onSave: (record: RegulationRecord) => Promise<void>;
    /** 删除该记录（只删元数据，不动文件） */
    onDelete: (record: RegulationRecord) => Promise<void>;
    onClose: () => void;
}

interface FormValues {
    standardNo: string;
    year: string;
    title: string;
    level: string;
    domains: string[];
    publishedAt: string;
    effectiveAt: string;
    status: string;
    statusOverridden: boolean;
    replacesText: string;
    note: string;
}

const toForm = (r: RegulationRecord): FormValues => ({
    standardNo: r.standardNo,
    year: r.year ?? '',
    title: r.title,
    level: r.level,
    domains: r.domains ?? [],
    publishedAt: r.publishedAt ?? '',
    effectiveAt: r.effectiveAt ?? '',
    status: r.status,
    statusOverridden: r.statusOverridden,
    replacesText: (r.replaces ?? []).join('、'),
    note: r.note ?? '',
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 记录详情（设计 Q13/Q17）——同时是**唯一的编辑入口**。
 *
 * 承载：基本信息、版本链/替代关系、健康告警、权威查询入口、编辑与删除。
 * 「权威查询」是**跳转**（拼 URL 交系统浏览器）；带自动回填的「核验」是 P1（设计 §5.4）。
 */
const RegulationDetailDrawer: React.FC<Props> = ({
    open,
    record,
    allRecords,
    sites,
    vocab,
    onOpenFile,
    onSelectVersion,
    onSave,
    onDelete,
    onClose,
}) => {
    const [form] = Form.useForm<FormValues>();
    const [editing, setEditing] = React.useState(false);
    const [saving, setSaving] = React.useState(false);

    // 打开/切换记录时重置编辑态
    React.useEffect(() => {
        setEditing(false);
    }, [record?.standardNo, record?.year, open]);

    React.useEffect(() => {
        if (record) form.setFieldsValue(toForm(record));
    }, [record, form]);

    const chain = React.useMemo(() => {
        if (!record) return [];
        const chains = buildVersionChains(allRecords);
        return chains.get(record.standardNo) ?? [record];
    }, [record, allRecords]);

    if (!record) return null;

    const status = deriveStatus(record);
    const issue = recordIssue(record);
    const entries = sitesForLevel(sites, record.level);

    const openAuthority = async (site: SiteTemplate) => {
        const { formatSiteUrl } = await import('../../utils/regulationTypes');
        const url = formatSiteUrl(site.urlTemplate, record.standardNo);
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(url);
    };

    const handleSave = async () => {
        let values: FormValues;
        try {
            values = await form.validateFields();
        } catch {
            return;
        }
        const split = splitStandardNoYear(values.standardNo);
        const next: RegulationRecord = {
            ...record,
            standardNo: split.standardNo,
            year: values.year.trim() || split.year || null,
            title: values.title.trim(),
            level: values.level,
            domains: values.domains ?? [],
            publishedAt: values.publishedAt.trim() || null,
            effectiveAt: values.effectiveAt.trim() || null,
            status: values.status,
            statusOverridden: values.statusOverridden,
            replaces: values.replacesText
                .split(/[、,，\s]+/)
                .map(s => s.trim())
                .filter(Boolean),
            note: values.note,
        };

        // 身份+版本若改动，可能撞上库里已有的另一条——必须显式确认（ADR-0002 永不静默覆盖）
        const key = (r: Pick<RegulationRecord, 'standardNo' | 'year'>) =>
            `${splitStandardNoYear(r.standardNo).standardNo}@${r.year ?? splitStandardNoYear(r.standardNo).year ?? ''}`;
        const clash = allRecords.find(
            r => r !== record && key(r) === key({ standardNo: next.standardNo, year: next.year }),
        );
        if (clash) {
            const ok = await new Promise<boolean>(resolve => {
                Modal.confirm({
                    title: '这会与库里另一条记录重号',
                    content: `「${clash.standardNo} ${clash.year ?? ''}」已存在，继续将把它替换掉。`,
                    okText: '替换',
                    cancelText: '取消',
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            });
            if (!ok) return;
        }

        setSaving(true);
        try {
            await onSave(next);
            setEditing(false);
            message.success('已保存');
        } catch (e) {
            message.error(e instanceof Error ? e.message : '保存失败');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        const ok = await new Promise<boolean>(resolve => {
            Modal.confirm({
                title: '删除这条记录？',
                content: '只删除库里的元数据登记，不会动 iCloud 里的 PDF 文件。',
                okText: '删除',
                okButtonProps: { danger: true },
                cancelText: '取消',
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
            });
        });
        if (!ok) return;
        try {
            await onDelete(record);
            message.success('已删除');
            onClose();
        } catch (e) {
            message.error(e instanceof Error ? e.message : '删除失败');
        }
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={640}
            title={
                <Space size={8} wrap>
                    <Text strong>{record.standardNo || '（无标准号）'}</Text>
                    {record.year && <Tag>{record.year}</Tag>}
                    <Tag color={STATUS_COLOR[status] ?? 'default'}>{status}</Tag>
                </Space>
            }
            extra={
                editing ? (
                    <Space>
                        <Button size="small" onClick={() => { setEditing(false); form.setFieldsValue(toForm(record)); }}>
                            取消
                        </Button>
                        <Button size="small" type="primary" loading={saving} onClick={() => void handleSave()}>
                            保存
                        </Button>
                    </Space>
                ) : (
                    <Space>
                        <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
                            编辑
                        </Button>
                        <Button size="small" danger icon={<DeleteOutlined />} onClick={() => void handleDelete()}>
                            删除
                        </Button>
                    </Space>
                )
            }
        >
            {editing ? (
                <Form form={form} layout="vertical" size="small" initialValues={toForm(record)}>
                    <Form.Item
                        name="standardNo"
                        label="标准号（身份键）"
                        rules={[{ required: true, message: '标准号是身份键，必须填' }]}
                        extra="年份属于版本，不属于标准号；若连写（如 GB 44495-2024）保存时会自动拆开"
                    >
                        <Input placeholder="GB 44495" />
                    </Form.Item>
                    <Space size={12} style={{ width: '100%' }} align="start">
                        <Form.Item name="year" label="版本（年份）" style={{ flex: 1 }}>
                            <Input placeholder="留空表示无年份" />
                        </Form.Item>
                        <Form.Item name="level" label="层级" style={{ flex: 1 }} rules={[{ required: true, message: '请选层级' }]}>
                            <Select options={vocab.levels.map(l => ({ label: l, value: l }))} placeholder="选择层级" />
                        </Form.Item>
                    </Space>
                    <Form.Item name="title" label="名称" rules={[{ required: true, message: '请填名称' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="domains" label="主题域（可多选）">
                        <Select
                            mode="multiple"
                            allowClear
                            placeholder="按主题域横切"
                            options={vocab.domains.map(d => ({ label: d, value: d }))}
                        />
                    </Form.Item>
                    <Space size={12} style={{ width: '100%' }} align="start">
                        <Form.Item
                            name="publishedAt"
                            label="发布日期"
                            style={{ flex: 1 }}
                            rules={[
                                {
                                    validator: (_, v: string) =>
                                        !v || DATE_RE.test(v.trim())
                                            ? Promise.resolve()
                                            : Promise.reject(new Error('格式应为 YYYY-MM-DD')),
                                },
                            ]}
                        >
                            <Input placeholder="2024-08-23" />
                        </Form.Item>
                        <Form.Item
                            name="effectiveAt"
                            label="实施日期"
                            style={{ flex: 1 }}
                            extra="填了实施日期后，状态会按「今天」自动推导"
                            rules={[
                                {
                                    validator: (_, v: string) =>
                                        !v || DATE_RE.test(v.trim())
                                            ? Promise.resolve()
                                            : Promise.reject(new Error('格式应为 YYYY-MM-DD')),
                                },
                            ]}
                        >
                            <Input placeholder="2026-01-01" />
                        </Form.Item>
                    </Space>
                    <Form.Item name="status" label="状态">
                        <Select
                            allowClear
                            placeholder="留空表示按日期自动推导"
                            options={STATUS_VALUES.map(s => ({ label: s, value: s }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="statusOverridden"
                        label="锁定状态（人工覆盖）"
                        valuePropName="checked"
                        extra="开启后不再随日期自动推导。「已被替代 / 废止」无法从日期推出，需在此人工指定"
                    >
                        <Switch />
                    </Form.Item>
                    <Form.Item name="replacesText" label="替代（旧标准号，顿号或空格分隔）">
                        <Input placeholder="GB 1589-2016" />
                    </Form.Item>
                    <Form.Item name="note" label="备注">
                        <Input.TextArea rows={2} />
                    </Form.Item>
                </Form>
            ) : (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Text>{record.title || '（无名称）'}</Text>

                    {issue && (
                        <Alert
                            type={issue === 'file-missing' ? 'error' : 'warning'}
                            showIcon
                            message={issueText[issue]}
                        />
                    )}

                    <Descriptions size="small" column={1} bordered>
                        <Descriptions.Item label="层级">
                            {record.level ? <Tag>{record.level}</Tag> : '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="主题域">
                            {record.domains?.length
                                ? record.domains.map(d => (
                                      <Tag key={d} color="geekblue">
                                          {d}
                                      </Tag>
                                  ))
                                : '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="发布日期">{record.publishedAt || '—'}</Descriptions.Item>
                        <Descriptions.Item label="实施日期">{record.effectiveAt || '—'}</Descriptions.Item>
                        <Descriptions.Item label="替代">
                            {record.replaces?.length ? record.replaces.join('、') : '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="文件">
                            {record.fileName ? (
                                <Space direction="vertical" size={2}>
                                    <Text style={{ fontSize: 12 }}>{baseNameOf(record.fileName)}</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {formatSize(record.fileSize)}
                                        {record.textLayer === 'none' && ' · 扫描件（正文不可检索）'}
                                    </Text>
                                </Space>
                            ) : (
                                <Text type="secondary">未收录（仅有元数据）</Text>
                            )}
                        </Descriptions.Item>
                        {record.note && <Descriptions.Item label="备注">{record.note}</Descriptions.Item>}
                    </Descriptions>

                    {record.fileName && !record.fileMissing && (
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={() => onOpenFile(record)}
                            disabled={record.notDownloaded}
                        >
                            {record.notDownloaded ? '文件未下载到本机' : '打开原件'}
                        </Button>
                    )}

                    <div>
                        <Title level={5} style={{ marginBottom: 6 }}>
                            权威查询
                        </Title>
                        {entries.length === 0 ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                该层级暂无已配置的权威站点
                            </Text>
                        ) : (
                            <Space wrap>
                                {entries.map(s => (
                                    <Button
                                        key={s.name}
                                        size="small"
                                        icon={<ExportOutlined />}
                                        onClick={() => void openAuthority(s)}
                                    >
                                        {s.name}
                                    </Button>
                                ))}
                            </Space>
                        )}
                        <div style={{ marginTop: 4 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                在浏览器中打开权威站点核对版本与状态；本工具不发网络请求。
                            </Text>
                        </div>
                    </div>

                    <Divider style={{ margin: '4px 0' }} />

                    <div>
                        <Title level={5} style={{ marginBottom: 6 }}>
                            版本链（{chain.length}）
                        </Title>
                        {chain.length <= 1 ? (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                该标准号下只有这一版
                            </Text>
                        ) : (
                            <Space direction="vertical" size={4} style={{ width: '100%' }}>
                                {chain.map(v => {
                                    const vs = deriveStatus(v);
                                    const current = v.year === record.year;
                                    return (
                                        <Space key={v.year ?? 'none'} size={8}>
                                            <Tag color={current ? 'blue' : 'default'}>{v.year ?? '无年份'}</Tag>
                                            <Tag color={STATUS_COLOR[vs] ?? 'default'}>{vs}</Tag>
                                            <Text
                                                style={{
                                                    fontSize: 12,
                                                    cursor: current ? 'default' : 'pointer',
                                                    color: current ? undefined : '#1677ff',
                                                }}
                                                onClick={() => !current && onSelectVersion(v)}
                                            >
                                                {current ? '当前查看' : '查看此版本'}
                                            </Text>
                                        </Space>
                                    );
                                })}
                            </Space>
                        )}
                    </div>

                    <Divider style={{ margin: '4px 0' }} />

                    <div>
                        <Title level={5} style={{ marginBottom: 6 }}>
                            知识卡
                        </Title>
                        {record.knowledgeCards?.length ? (
                            <Space direction="vertical" size={2}>
                                {record.knowledgeCards.map(c => (
                                    <Space key={c} size={4}>
                                        <LinkOutlined />
                                        <Text style={{ fontSize: 12 }}>{baseNameOf(c)}</Text>
                                    </Space>
                                ))}
                            </Space>
                        ) : (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={<Text type="secondary" style={{ fontSize: 12 }}>暂无解读卡</Text>}
                            />
                        )}
                    </div>
                </Space>
            )}
        </Drawer>
    );
};

export default RegulationDetailDrawer;
