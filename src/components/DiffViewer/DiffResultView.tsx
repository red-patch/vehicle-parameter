import React, { useMemo, useState } from 'react';
import { Table, Tabs, Tag, Badge, Typography, Descriptions, Select } from 'antd';
import { useVehicleStore } from '../../store/vehicleStore';
import ParametersTable from './ParametersTable';

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
    const { diffResult, baseFile, targetFile } = useVehicleStore();
    const [selectedSheet, setSelectedSheet] = useState<string>('all');

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

    if (!diffResult || !filteredDiff) return null;

    const { added, removed, modified } = filteredDiff;

    // Columns for Modified (Custom view needed to show Old vs New)
    const modifiedColumns = [
        {
            title: '产品 / 适用车型',
            dataIndex: ['oldParam', 'productName'],
            key: 'productName',
            width: 200,
            render: (text: string) => <Tag color="cyan">{text || '通用'}</Tag>
        },
        {
            title: '分组',
            dataIndex: ['oldParam', 'group'],
            key: 'group',
            width: 150,
            render: (text: string) => <Tag>{text}</Tag>
        },
        {
            title: '参数名',
            dataIndex: ['oldParam', 'name'],
            key: 'name',
            width: 250
        },
        {
            title: '基准值 (旧)',
            dataIndex: ['oldParam', 'value'],
            key: 'oldValue',
            render: (text: string) => <Text delete type="secondary">{text}</Text>
        },
        {
            title: '新版本值 (新)',
            dataIndex: ['newParam', 'value'],
            key: 'newValue',
            render: (text: string) => <Text strong type="success">{text}</Text>
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
                            <Table
                                dataSource={modified}
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
                                <Badge status="success" /> 新增 ({added.length})
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
            children: <Table dataSource={modified} columns={modifiedColumns} rowKey="id" />
        },
        {
            key: 'added',
            label: `新增 (${added.length})`,
            children: <ParametersTable data={added} />
        },
        {
            key: 'removed',
            label: `移除 (${removed.length})`,
            children: <ParametersTable data={removed} />
        }
    ];

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

            {/* Sheet Filter */}
            {allSheets.length > 0 && (
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="font-bold">按工作表筛选 (Sheet):</span>
                        <Select
                            value={selectedSheet}
                            onChange={setSelectedSheet}
                            style={{ width: 250 }}
                            options={[
                                { label: '全部工作表 (All Sheets)', value: 'all' },
                                ...allSheets.map(s => ({ label: s, value: s }))
                            ]}
                        />
                    </div>
                </div>
            )}


            <Tabs defaultActiveKey="all" items={items} />
        </div>
    );
};

export default DiffResultView;
