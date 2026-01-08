import React, { useMemo, useState } from 'react';
import { Table, Tag, Select, Progress, Button, message, Input, Space, Switch } from 'antd';
import { useVehicleStore } from '../../store/vehicleStore';
import type { MatchItem } from '../../types';
import { CheckCircleOutlined, DownloadOutlined, SearchOutlined, EditOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';


const MatchResultTable: React.FC = () => {
    const { matchResults, baseFile, updateMatchResult, updateManualValue, selectedProduct } = useVehicleStore();
    
    // V3.0: 过滤状态
    const [searchText, setSearchText] = useState('');
    const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'perfect' | 'imperfect'>('all');
    // 记录哪些行处于手动输入模式
    const [manualInputMode, setManualInputMode] = useState<Record<string, boolean>>({});

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

    // V3.0: 过滤后的数据
    const filteredResults = useMemo(() => {
        let results = matchResults;
        
        // 字段搜索
        if (searchText) {
            const lower = searchText.toLowerCase();
            results = results.filter(m => 
                m.requirementName.toLowerCase().includes(lower) ||
                m.matchedParam?.name?.toLowerCase().includes(lower) ||
                String(m.matchedParam?.value || '').toLowerCase().includes(lower)
            );
        }
        
        // 匹配度过滤
        if (confidenceFilter === 'perfect') {
            results = results.filter(m => m.confidence === 1);
        } else if (confidenceFilter === 'imperfect') {
            results = results.filter(m => m.confidence < 1);
        }
        
        return results;
    }, [matchResults, searchText, confidenceFilter]);

    const handleCopy = () => {
        if (!filteredResults.length) {
            message.warning('暂无内容可复制');
            return;
        }

        // Prepare data for export
        const headers = ['需求参数名', '匹配库参数名', '填报值', '置信度', '状态'];
        const rows = filteredResults.map(m => {
            // 优先使用手动输入的值
            const displayValue = m.manualValue !== undefined 
                ? m.manualValue 
                : ((m.matchedParam?.value !== undefined && m.matchedParam?.value !== null) 
                    ? String(m.matchedParam.value) 
                    : '');

            return [
                m.requirementName,
                m.manualValue !== undefined ? '(手动输入)' : (m.matchedParam?.name || '(未匹配)'),
                displayValue,
                (m.confidence * 100).toFixed(0) + '%',
                m.manualValue !== undefined ? '手动' : (m.matchedParam ? '已匹配' : '未匹配')
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

    const handleDownload = async () => {
        if (!filteredResults.length) {
            message.warning('暂无内容可下载');
            return;
        }

        // Prepare data for export
        const headers = ['需求参数名', '匹配库参数名', '填报值', '置信度', '状态'];
        const rows = filteredResults.map(m => {
            const displayValue = m.manualValue !== undefined 
                ? m.manualValue 
                : ((m.matchedParam?.value !== undefined && m.matchedParam?.value !== null) 
                    ? String(m.matchedParam.value) 
                    : '');

            return [
                m.requirementName,
                m.manualValue !== undefined ? '(手动输入)' : (m.matchedParam?.name || '(未匹配)'),
                displayValue,
                (m.confidence * 100).toFixed(0) + '%',
                m.manualValue !== undefined ? '手动' : (m.matchedParam ? '已匹配' : '未匹配')
            ];
        });

        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const csvOutput = XLSX.utils.sheet_to_csv(ws);

        const { downloadCsv } = await import('../../utils/downloadCsv');
        await downloadCsv(csvOutput, '智能填报结果.csv');
    };

    const toggleManualMode = (id: string) => {
        setManualInputMode(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
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
            width: 300,
            render: (_: unknown, record: MatchItem) => {
                const isManualMode = manualInputMode[record.id];
                
                return (
                    <div className="flex items-center gap-2">
                        {isManualMode ? (
                            <Input
                                placeholder="手动输入参数值..."
                                value={record.manualValue || ''}
                                onChange={(e) => updateManualValue(record.id, e.target.value)}
                                style={{ flex: 1 }}
                            />
                        ) : (
                            <Select
                                showSearch
                                style={{ flex: 1 }}
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
                        )}
                        <Switch
                            checkedChildren={<EditOutlined />}
                            unCheckedChildren="选"
                            checked={isManualMode}
                            onChange={() => toggleManualMode(record.id)}
                            title={isManualMode ? "切换为选择模式" : "切换为手动输入模式"}
                        />
                    </div>
                );
            }
        },
        {
            title: '填报值',
            key: 'value',
            width: 200,
            render: (_: unknown, record: MatchItem) => {
                // 优先显示手动输入的值
                const displayValue = record.manualValue !== undefined 
                    ? record.manualValue 
                    : (record.matchedParam?.value || '-');
                const isManual = record.manualValue !== undefined;
                
                return (
                    <span className={`font-mono px-2 py-1 rounded ${isManual ? 'bg-blue-50 text-blue-700' : 'bg-gray-50'}`}>
                        {displayValue}
                        {isManual && <Tag color="blue" className="ml-2">手动</Tag>}
                    </span>
                );
            }
        }
    ];

    if (!matchResults.length) return null;

    return (
        <div className="mt-8 bg-white p-4 rounded shadow">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold flex items-center gap-2">
                    <CheckCircleOutlined className="text-green-600" />
                    匹配结果预览
                    <Tag>{filteredResults.length}/{matchResults.length}</Tag>
                </h3>
                <div className="flex gap-2">
                    <Button onClick={handleCopy}>
                        复制填报结果 (CSV)
                    </Button>
                    <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownload}>
                        下载 CSV
                    </Button>
                </div>
            </div>

            {/* V3.0: 过滤器区域 */}
            <div className="mb-4 flex items-center gap-4 flex-wrap">
                <Space>
                    <span className="text-gray-500">搜索:</span>
                    <Input
                        prefix={<SearchOutlined />}
                        placeholder="搜索参数名、匹配名或值..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        allowClear
                        style={{ width: 280 }}
                    />
                </Space>
                <Space>
                    <span className="text-gray-500">匹配度:</span>
                    <Select
                        value={confidenceFilter}
                        onChange={setConfidenceFilter}
                        style={{ width: 140 }}
                        options={[
                            { label: '全部', value: 'all' },
                            { label: '100%匹配', value: 'perfect' },
                            { label: '<100%匹配', value: 'imperfect' },
                        ]}
                    />
                </Space>
            </div>

            <Table
                dataSource={filteredResults}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `共 ${total} 条` }}
                scroll={{ y: 600 }}
            />
        </div>
    );
};

export default MatchResultTable;
