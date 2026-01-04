import React, { useMemo, useState } from 'react';
import { Table, Tabs, Tag, Badge, Typography, Descriptions, Select, Radio, Input, Tooltip } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import ParametersTable from './ParametersTable';
import type { CompareMode } from '../../types';

const { Text } = Typography;

// Helper to count unique parameters (ignoring multiple products for the same row)
const countUniqueParameters = (items: { originSheet?: string; group: string; name: string }[]) => {
    const uniqueKeys = new Set<string>();
    items.forEach(item => {
        // Key: Sheet + Group + Name
        const key = `${item.originSheet || ''}::${item.group}::${item.name}`;
        uniqueKeys.add(key);
    });
    return uniqueKeys.size;
};

// Helper for modified items which have a different structure
const countUniqueModified = (items: { oldParam: { originSheet?: string; group: string; name: string } }[]) => {
    const uniqueKeys = new Set<string>();
    items.forEach(item => {
         const p = item.oldParam;
         const key = `${p.originSheet || ''}::${p.group}::${p.name}`;
         uniqueKeys.add(key);
    });
    return uniqueKeys.size;
};

const DiffResultView: React.FC = () => {
    const { diffResult, baseFile, targetFile, compareMode, setCompareMode } = useVehicleStore();
    const [selectedSheet, setSelectedSheet] = useState<string>('all');
    const [modifiedSearchText, setModifiedSearchText] = useState<string>('');

    // 检测是否可以使用 MIIT 模式（targetFile 来自工信部）
    const isMiitModeAvailable = useMemo(() => {
        return targetFile?.data.some(p => p.originSheet === '工信部官网') ?? false;
    }, [targetFile]);

    // Extract all unique sheet names
    const allSheets = useMemo(() => {
        if (!baseFile && !targetFile) return [];
        const sheets = new Set<string>();
        baseFile?.data.forEach(p => p.originSheet && sheets.add(p.originSheet));
        targetFile?.data.forEach(p => p.originSheet && sheets.add(p.originSheet));
        return Array.from(sheets).sort();
    }, [baseFile, targetFile]);

    // Filter diff result based on selection
    const filteredDiff = useMemo(() => {
        if (!diffResult) return null;
        if (selectedSheet === 'all') return diffResult;

        return {
            added: diffResult.added.filter(p => p.originSheet === selectedSheet),
            removed: diffResult.removed.filter(p => p.originSheet === selectedSheet),
            modified: diffResult.modified.filter(m => m.oldParam.originSheet === selectedSheet), // Assuming old/new have same sheet
            unchanged: diffResult.unchanged.filter(p => p.originSheet === selectedSheet)
        };
    }, [diffResult, selectedSheet]);

    const stats = useMemo(() => {
        if (!filteredDiff) return [];
        const { added, removed, modified, unchanged } = filteredDiff;
        return [
            { label: '新增参数', value: countUniqueParameters(added), color: 'green' },
            { label: '移除参数', value: countUniqueParameters(removed), color: 'red' },
            { label: '变更参数', value: countUniqueModified(modified), color: 'orange' },
            { label: '未变参数', value: countUniqueParameters(unchanged), color: 'default' },
        ];
    }, [filteredDiff]);

    // 过滤变更数据（搜索功能）- 必须在条件返回之前定义
    const filteredModified = useMemo(() => {
        if (!filteredDiff) return [];
        const { modified } = filteredDiff;
        if (!modifiedSearchText) return modified;
        const lower = modifiedSearchText.toLowerCase();
        return modified.filter(m => 
            m.oldParam.name.toLowerCase().includes(lower) ||
            m.newParam.name.toLowerCase().includes(lower) ||
            m.oldParam.value.toString().toLowerCase().includes(lower) ||
            m.newParam.value.toString().toLowerCase().includes(lower) ||
            m.oldParam.group.toLowerCase().includes(lower)
        );
    }, [filteredDiff, modifiedSearchText]);

    // 为 MIIT 模式构建统一的对比视图数据 - 必须在条件返回之前
    const miitComparisonData = useMemo(() => {
        if (compareMode !== 'miit' || !filteredDiff || !targetFile) return [];
        
        const { added, modified, unchanged } = filteredDiff;
        
        // 构建统一数据结构
        const rows: Array<{
            key: string;
            status: 'matched' | 'modified' | 'missing';
            targetName: string;
            targetValue: string;
            baseName: string;
            baseValue: string;
        }> = [];

        // 添加匹配且值相同的记录
        unchanged.forEach((p, i) => {
            rows.push({
                key: `unchanged-${i}`,
                status: 'matched',
                targetName: p.name,
                targetValue: p.value.toString(),
                baseName: p.name,
                baseValue: p.value.toString(),
            });
        });

        // 添加变更记录（匹配但值不同）
        modified.forEach((m, i) => {
            rows.push({
                key: `modified-${i}`,
                status: 'modified',
                targetName: m.newParam.name,
                targetValue: m.newParam.value.toString(),
                baseName: m.oldParam.name,
                baseValue: m.oldParam.value.toString(),
            });
        });

        // 添加缺失记录（目标有，基准无）
        added.forEach((p, i) => {
            rows.push({
                key: `missing-${i}`,
                status: 'missing',
                targetName: p.name,
                targetValue: p.value.toString(),
                baseName: '-',
                baseValue: '-',
            });
        });

        return rows;
    }, [compareMode, filteredDiff, targetFile]);

    if (!diffResult || !filteredDiff) return null;

    const { added, removed, modified } = filteredDiff;

    // Columns for Modified (Custom view needed to show Old vs New)
    const modifiedColumns = [
        {
            title: '产品 / 适用车型',
            dataIndex: ['oldParam', 'productName'],
            key: 'productName',
            width: 150,
            render: (text: string) => <Tag color="cyan">{text || '通用'}</Tag>
        },
        {
            title: '分组',
            dataIndex: ['oldParam', 'group'],
            key: 'group',
            width: 120,
            render: (text: string) => <Tag>{text}</Tag>
        },
        {
            title: '字段名 (基准文件)',
            dataIndex: ['oldParam', 'name'],
            key: 'oldName',
            width: 180,
            render: (text: string) => <Text>{text}</Text>
        },
        {
            title: '字段名 (新版本)',
            dataIndex: ['newParam', 'name'],
            key: 'newName',
            width: 180,
            render: (text: string, record: { oldParam: { name: string }, newParam: { name: string } }) => {
                const isDifferent = record.oldParam.name !== record.newParam.name;
                return isDifferent ? <Text type="warning">{text}</Text> : <Text type="secondary">{text}</Text>;
            }
        },
        {
            title: '基准值',
            dataIndex: ['oldParam', 'value'],
            key: 'oldValue',
            render: (text: string) => <Text delete type="secondary">{text}</Text>
        },
        {
            title: '新版本值',
            dataIndex: ['newParam', 'value'],
            key: 'newValue',
            render: (text: string) => <Text strong type="success">{text}</Text>
        },
    ];

    // MIIT 模式专用列定义
    const miitColumns = [
        {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 80,
            render: (status: string) => {
                const config = {
                    matched: { color: 'green', text: '一致' },
                    modified: { color: 'orange', text: '差异' },
                    missing: { color: 'red', text: '缺失' },
                };
                const c = config[status as keyof typeof config];
                return <Tag color={c?.color}>{c?.text}</Tag>;
            },
            filters: [
                { text: '一致', value: 'matched' },
                { text: '差异', value: 'modified' },
                { text: '缺失', value: 'missing' },
            ],
            onFilter: (value: unknown, record: { status: string }) => record.status === value,
        },
        {
            title: '公告字段名',
            dataIndex: 'targetName',
            key: 'targetName',
            width: 180,
        },
        {
            title: '公告值',
            dataIndex: 'targetValue',
            key: 'targetValue',
            ellipsis: true,
        },
        {
            title: '基准文件字段名',
            dataIndex: 'baseName',
            key: 'baseName',
            width: 180,
            render: (text: string, record: { status: string; baseName: string; targetName: string }) => {
                if (record.status === 'missing') return <Text type="secondary">-</Text>;
                const isDifferent = record.baseName !== record.targetName;
                return isDifferent ? <Text type="warning">{text}</Text> : <Text>{text}</Text>;
            }
        },
        {
            title: '基准文件值',
            dataIndex: 'baseValue',
            key: 'baseValue',
            ellipsis: true,
            render: (text: string, record: { status: string }) => {
                if (record.status === 'missing') return <Text type="secondary">-</Text>;
                if (record.status === 'modified') return <Text delete type="danger">{text}</Text>;
                return <Text>{text}</Text>;
            }
        },
    ];

    const items = [
        {
            key: 'all',
            label: '全部差异概览',
            children: (
                <div className="space-y-8">
                    {/* Modified List */}
                    {modified.length > 0 && (
                        <div>
                            <h4 className="text-orange-600 mb-2 font-bold flex items-center gap-2">
                                <Badge status="warning" /> 变更 ({modified.length})
                            </h4>
                            <div className="mb-4">
                                <Input
                                    prefix={<SearchOutlined />}
                                    placeholder="搜索字段名、值或分组..."
                                    onChange={e => setModifiedSearchText(e.target.value)}
                                    allowClear
                                    className="max-w-md"
                                />
                            </div>
                            <Table
                                dataSource={filteredModified}
                                columns={modifiedColumns}
                                rowKey="id"
                                pagination={{ pageSize: 10 }}
                                size="small"
                                bordered
                            />
                        </div>
                    )}

                    {/* Added Table (Pivot View) */}
                    {added.length > 0 && (
                        <div>
                            <h4 className="text-green-600 mb-2 font-bold flex items-center gap-2">
                                <Badge status="success" /> {compareMode === 'miit' ? '缺失' : '新增'} ({added.length})
                            </h4>
                            <ParametersTable data={added} />
                        </div>
                    )}

                    {/* Removed Table (Pivot View) */}
                    {removed.length > 0 && (
                        <div>
                            <h4 className="text-red-600 mb-2 font-bold flex items-center gap-2">
                                <Badge status="error" /> 移除 ({removed.length})
                            </h4>
                            <ParametersTable data={removed} />
                        </div>
                    )}
                </div>
            )
        },
        {
            key: 'modified',
            label: `变更 (${modified.length})`,
            children: (
                <div>
                    <div className="mb-4">
                        <Input
                            prefix={<SearchOutlined />}
                            placeholder="搜索字段名、值或分组..."
                            onChange={e => setModifiedSearchText(e.target.value)}
                            allowClear
                            className="max-w-md"
                        />
                    </div>
                    <Table
                        dataSource={filteredModified}
                        columns={modifiedColumns}
                        rowKey="id"
                        pagination={{ pageSize: 20 }}
                        size="small"
                        bordered
                    />
                </div>
            )
        },
        {
            key: 'added',
            label: compareMode === 'miit' ? `缺失 (${added.length})` : `新增 (${added.length})`,
            children: <ParametersTable data={added} />
        },
        {
            key: 'removed',
            label: `移除 (${removed.length})`,
            children: <ParametersTable data={removed} />
        }
    ];

    // MIIT 模式专用视图
    const miitView = (
        <div>
            <div className="mb-4 flex items-center gap-4">
                <Tag color="green">一致: {miitComparisonData.filter(r => r.status === 'matched').length}</Tag>
                <Tag color="orange">差异: {miitComparisonData.filter(r => r.status === 'modified').length}</Tag>
                <Tag color="red">缺失: {miitComparisonData.filter(r => r.status === 'missing').length}</Tag>
            </div>
            <Table
                dataSource={miitComparisonData}
                columns={miitColumns}
                rowKey="key"
                pagination={{ pageSize: 20 }}
                size="small"
                bordered
                rowClassName={(record) => {
                    if (record.status === 'matched') return 'bg-green-50';
                    if (record.status === 'modified') return 'bg-orange-50';
                    if (record.status === 'missing') return 'bg-red-50';
                    return '';
                }}
            />
        </div>
    );

    return (
        <div className="bg-white p-4 rounded shadow-sm border border-gray-100">
            <div className="mb-6 p-4 bg-blue-50 rounded">
                <Descriptions title="比对统计" column={4}>
                    {stats.map(s => (
                        <Descriptions.Item key={s.label} label={s.label}>
                            <Tag color={s.color} className="text-lg px-2 rounded">{s.value}</Tag>
                        </Descriptions.Item>
                    ))}
                </Descriptions>
                <div className="mt-2 text-sm text-gray-500">
                    对比文件:
                    <span className="font-mono mx-2">{baseFile?.fileName}</span>
                    vs
                    <span className="font-mono mx-2">{targetFile?.fileName}</span>
                </div>
            </div>

            {/* Filters Row: Compare Mode + Sheet Filter */}
            <div className="mb-4 flex items-center justify-between flex-wrap gap-4">
                {/* Compare Mode Selector */}
                <div className="flex items-center gap-2">
                    <span className="font-bold">对比模式:</span>
                    <Radio.Group
                        value={compareMode}
                        onChange={(e) => setCompareMode(e.target.value as CompareMode)}
                        optionType="button"
                        buttonStyle="solid"
                        size="small"
                    >
                        <Radio.Button value="content">按内容对比</Radio.Button>
                        <Tooltip title={!isMiitModeAvailable ? '仅当目标文件来自公告号查询时可用' : ''}>
                            <Radio.Button value="miit" disabled={!isMiitModeAvailable}>仅公告号数据对比</Radio.Button>
                        </Tooltip>
                    </Radio.Group>
                </div>

                {/* Sheet Filter */}
                {allSheets.length > 0 && (
                    <div className="flex items-center gap-2">
                        <span className="font-bold">按工作表筛选:</span>
                        <Select
                            value={selectedSheet}
                            onChange={setSelectedSheet}
                            style={{ width: 220 }}
                            options={[
                                { label: '全部工作表 (All Sheets)', value: 'all' },
                                ...allSheets.map(s => ({ label: s, value: s }))
                            ]}
                        />
                    </div>
                )}
            </div>


            {compareMode === 'miit' ? miitView : <Tabs defaultActiveKey="all" items={items} />}
        </div>
    );
};

export default DiffResultView;
