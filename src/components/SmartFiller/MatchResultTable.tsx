import React, { useMemo } from 'react';
import { Table, Tag, Select, Progress, Button, message } from 'antd';
import { useVehicleStore } from '../../store/vehicleStore';
import type { MatchItem } from '../../types';
import { CheckCircleOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';


const MatchResultTable: React.FC = () => {
    const { matchResults, baseFile, updateMatchResult, selectedProduct } = useVehicleStore();

    // Prepare options for the Select dropdown (memoized)
    const libraryOptions = useMemo(() => {
        if (!baseFile) return [];
        let data = baseFile.data;
        if (selectedProduct) {
            data = data.filter(p => p.productName === selectedProduct);
        }
        return data.map(p => ({
            value: p.id,
            label: `${p.name} (${p.value})`,
            group: p.group,
            param: p
        }));
    }, [baseFile, selectedProduct]);

    const handleCopy = () => {
        if (!matchResults.length) {
            message.warning('暂无内容可复制');
            return;
        }

        // Prepare data for export
        const headers = ['需求参数名', '匹配库参数名', '填报值', '置信度', '状态'];
        const rows = matchResults.map(m => {
            const val = m.matchedParam?.value;
            // Explicitly convert to string to preserve '0'
            const displayValue = (val !== undefined && val !== null) ? String(val) : '';

            return [
                m.requirementName,
                m.matchedParam?.name || '(未匹配)',
                displayValue,
                (m.confidence * 100).toFixed(0) + '%',
                m.matchedParam ? '已匹配' : '未匹配'
            ];
        });

        const data = [headers, ...rows];

        // Create workbook and worksheet
        const ws = XLSX.utils.aoa_to_sheet(data);

        // Convert to CSV string using SheetJS utility
        const csvOutput = XLSX.utils.sheet_to_csv(ws);

        // Copy to clipboard
        navigator.clipboard.writeText(csvOutput)
            .then(() => {
                message.success('填报结果 (CSV格式) 已复制到剪贴板');
            })
            .catch(err => {
                message.error('复制失败: ' + err);
            });
    };

    const columns = [
        {
            title: '需求参数名',
            dataIndex: 'requirementName',
            key: 'requirementName',
            width: 250,
            render: (text: string) => <b className="text-gray-800">{text}</b>
        },
        {
            title: '匹配度',
            dataIndex: 'confidence',
            key: 'confidence',
            width: 150,
            render: (score: number, record: MatchItem) => {
                return (
                    <div className="flex items-center gap-2">
                        <Progress percent={Math.round(score * 100)} size="small" steps={5} strokeColor={score > 0.8 ? '#52c41a' : score > 0.5 ? '#faad14' : '#ff4d4f'} showInfo={false} />
                        <span className="text-xs text-gray-500">{Math.round(score * 100)}%</span>
                        {record.isManual && <Tag color="blue" className="ml-1">人工</Tag>}
                    </div>
                );
            }
        },
        {
            title: '匹配库参数 (可修正)',
            key: 'matchedParam',
            render: (_: any, record: MatchItem) => (
                <Select
                    showSearch
                    style={{ width: '100%' }}
                    placeholder="选择匹配参数"
                    optionFilterProp="label"
                    value={record.matchedParam?.id}
                    onChange={(value) => {
                        const selected = libraryOptions.find(o => o.value === value);
                        if (selected) {
                            updateMatchResult(record.id, selected.param);
                        }
                    }}
                    options={libraryOptions.map(o => ({ value: o.value, label: o.label }))}
                    className={!record.matchedParam ? "border-red-300 rounded" : ""}
                    status={!record.matchedParam ? "error" : ""}
                />
            )
        },
        {
            title: '填报值',
            key: 'value',
            width: 200,
            render: (_: any, record: MatchItem) => (
                <span className="font-mono bg-gray-50 px-2 py-1 rounded">
                    {record.matchedParam?.value || '-'}
                </span>
            )
        }
    ];

    if (!matchResults.length) return null;

    return (
        <div className="mt-8 bg-white p-4 rounded shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircleOutlined className="text-green-600" />
                    匹配结果预览
                </h3>
                <Button type="primary" onClick={handleCopy}>
                    复制填报结果 (CSV)
                </Button>
            </div>

            <Table
                dataSource={matchResults}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 20 }}
                scroll={{ y: 600 }}
            />
        </div>
    );
};

export default MatchResultTable;
