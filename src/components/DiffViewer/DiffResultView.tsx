import React, { useMemo, useState } from 'react';
import { Table, Tabs, Tag, Badge, Typography, Descriptions, Select, Radio, Input, Tooltip, Button, message } from 'antd';
import { SearchOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useVehicleStore } from '../../store/vehicleStore';
import ParametersTable from './ParametersTable';
import type { CompareMode } from '../../types';
import { isFieldRequired } from '../../assets/requiredFields';
import { FilterBar, FilterItem } from '../common/FilterBar';

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
    const [miitSearchText, setMiitSearchText] = useState<string>('');
    // V3.0: PDF导出状态
    const [isExporting, setIsExporting] = useState(false);

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

    // Filter MIIT Data based on search
    const filteredMiitData = useMemo(() => {
        if (!miitSearchText) return miitComparisonData;
        const lower = miitSearchText.toLowerCase();
        return miitComparisonData.filter(item => 
            item.targetName.toLowerCase().includes(lower) ||
            item.targetValue.toLowerCase().includes(lower) ||
            item.baseName.toLowerCase().includes(lower) ||
            item.baseValue.toLowerCase().includes(lower)
        );
    }, [miitComparisonData, miitSearchText]);

    // V3.0 美化版PDF导出：使用 html2canvas 渲染整个报告
    const handleExportPdf = async () => {
        if (!diffResult || !baseFile || !targetFile) {
            message.warning('暂无对比结果可导出');
            return;
        }

        try {
            setIsExporting(true); // 显示隐藏的报告模版
            message.loading({ content: '正在生成高清PDF报告...', key: 'pdfExport' });
            
            // 给React一点时间渲染DOM
            await new Promise(resolve => setTimeout(resolve, 500));

            const element = document.getElementById('pdf-report-container');
            if (!element) {
                throw new Error('Report container not found');
            }

            const { default: html2canvas } = await import('html2canvas');
            const { default: jsPDF } = await import('jspdf');

            const canvas = await html2canvas(element, {
                scale: 2, // 提高清晰度
                useCORS: true,
                logging: false,
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight
            });

            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            
            // A4 尺寸
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            const imgWidth = pdfWidth;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            let heightLeft = imgHeight;
            let position = 0;

            // 第一页
            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;

            // 如果内容超过一页，分页处理
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            const now = new Date();
            const fileName = `comparison_report_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.pdf`;
            pdf.save(fileName);
            
            message.success({ content: `PDF已导出: ${fileName}`, key: 'pdfExport' });
        } catch (err) {
            console.error('PDF export error:', err);
            message.error({ content: 'PDF导出失败', key: 'pdfExport' });
        } finally {
            setIsExporting(false);
        }
    };


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
            title: '是否必填',
            key: 'isRequired',
            width: 80,
            render: (_: unknown, record: { oldParam: { name: string }, newParam: { name: string } }) => {
                const required = isFieldRequired(record.oldParam.name) || isFieldRequired(record.newParam.name);
                return required ? <Tag color="orange">必填</Tag> : <Tag color="default">选填</Tag>;
            },
            filters: [
                { text: '必填', value: true },
                { text: '选填', value: false },
            ],
            onFilter: (value: unknown, record: { oldParam: { name: string }, newParam: { name: string } }) => {
                const required = isFieldRequired(record.oldParam.name) || isFieldRequired(record.newParam.name);
                return required === value;
            },
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
        {
            title: '是否必填',
            key: 'isRequired',
            width: 80,
            render: (_: unknown, record: { targetName: string; baseName: string }) => {
                const required = isFieldRequired(record.targetName) || isFieldRequired(record.baseName);
                return required ? <Tag color="orange">必填</Tag> : <Tag color="default">选填</Tag>;
            },
            filters: [
                { text: '必填', value: true },
                { text: '选填', value: false },
            ],
            onFilter: (value: unknown, record: { targetName: string; baseName: string }) => {
                const required = isFieldRequired(record.targetName) || isFieldRequired(record.baseName);
                return required === value;
            },
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
                        rowClassName={(record) => {
                             const isRequired = isFieldRequired(record.oldParam.name) || isFieldRequired(record.newParam.name);
                             return isRequired ? 'required-row' : '';
                        }}
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
           <div className="mb-4">
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索公告字段名、值..."
                    onChange={e => setMiitSearchText(e.target.value)}
                    allowClear
                    className="max-w-md"
                />
            </div>
            <div className="mb-4 flex items-center gap-4">
                <Tag color="green">一致: {miitComparisonData.filter(r => r.status === 'matched').length}</Tag>
                <Tag color="orange">差异: {miitComparisonData.filter(r => r.status === 'modified').length}</Tag>
                <Tag color="volcano">缺失: {miitComparisonData.filter(r => r.status === 'missing').length}</Tag>
            </div>
            <Table
                dataSource={filteredMiitData}
                columns={miitColumns}
                rowKey="key"
                pagination={{ pageSize: 20 }}
                size="small"
                bordered
                rowClassName={(record) => {
                    const isRequired = isFieldRequired(record.targetName) || isFieldRequired(record.baseName);
                    
                    let className = '';
                    if (record.status === 'matched') className += 'bg-green-50 ';
                    if (record.status === 'modified') className += 'bg-orange-50 ';
                    if (record.status === 'missing') className += 'bg-red-50 ';
                    
                    if (isRequired) {
                        className += 'required-row ';
                    }
                    
                    return className;
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

                {/* V3.0: PDF导出按钮 */}
                <div className="mt-4">
                    <Button 
                        type="primary" 
                        icon={<FilePdfOutlined />}
                        onClick={handleExportPdf}
                    >
                        导出PDF
                    </Button>
                </div>
            </div>

            {/* Filters Row: Compare Mode + Sheet Filter */}
            <FilterBar>
                {/* Compare Mode Selector */}
                <FilterItem label="对比模式:">
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
                </FilterItem>

                {/* Sheet Filter */}
                {allSheets.length > 0 && (
                    <FilterItem label="按工作表筛选:">
                        <Select
                            value={selectedSheet}
                            onChange={setSelectedSheet}
                            style={{ width: 220 }}
                            options={[
                                { label: '全部工作表 (All Sheets)', value: 'all' },
                                ...allSheets.map(s => ({ label: s, value: s }))
                            ]}
                        />
                    </FilterItem>
                )}
            </FilterBar>


            {compareMode === 'miit' ? miitView : <Tabs defaultActiveKey="all" items={items} />}

            {/* V3.0: 隐藏的PDF导出模版 - 为了支持中文和更好看的排版 */}
            {isExporting && diffResult && (
                <div 
                    id="pdf-report-container" 
                    className="fixed left-0 top-0 bg-white p-8"
                    style={{ 
                        width: '1000px', 
                        // 导出时置顶显示，确保 html2canvas 能完整捕获
                        zIndex: 9999, 
                        position: 'absolute',
                        minHeight: '100vh',
                    }}
                >
                    {/* Header */}
                    <div className="border-b-2 border-blue-600 pb-4 mb-6 flex justify-between items-end">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-800 mb-2">车辆参数对比报告</h1>
                            <div className="text-gray-500 text-sm">生成的参数差异分析报告</div>
                        </div>
                        <div className="text-right">
                            <div className="text-gray-400 text-xs">生成时间</div>
                            <div className="text-gray-700 font-mono">
                                {new Date().toLocaleString('zh-CN', { hour12: false })}
                            </div>
                        </div>
                    </div>

                    {/* File Info */}
                    <div className="bg-gray-50 p-6 rounded mb-8 grid grid-cols-2 gap-8 border border-gray-100">
                        <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">基准文件 (Base)</div>
                            <div className="font-bold text-gray-800 text-lg break-all leading-relaxed" style={{ minHeight: '3rem' }}>{baseFile?.fileName}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">对比文件 (Target)</div>
                            <div className="font-bold text-gray-800 text-lg break-all leading-relaxed" style={{ minHeight: '3rem' }}>{targetFile?.fileName}</div>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="mb-8">
                        <h3 className="text-lg font-bold text-gray-700 mb-4 border-l-4 border-blue-500 pl-3">统计概览</h3>
                        <div className="grid grid-cols-4 gap-4">
                            {stats.map(s => (
                                <div key={s.label} className="bg-white border rounded p-4 shadow-sm flex flex-col items-center justify-center">
                                    <div className="text-3xl font-bold mb-1" style={{ color: 
                                        s.color === 'green' ? '#52c41a' : 
                                        s.color === 'red' ? '#ff4d4f' : 
                                        s.color === 'orange' ? '#faad14' : '#666' 
                                    }}>
                                        {s.value}
                                    </div>
                                    <div className="text-gray-500 text-sm">{s.label}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Modified Parameters */}
                    {diffResult.modified.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-gray-700 mb-4 border-l-4 border-orange-500 pl-3">
                                变更参数 ({diffResult.modified.length})
                            </h3>
                            <table className="w-full text-sm border-collapse border border-gray-200">
                                <thead>
                                    <tr className="bg-orange-50">
                                        <th className="border border-gray-200 p-2 text-left w-1/4">参数名</th>
                                        <th className="border border-gray-200 p-2 text-left w-1/4">分组</th>
                                        <th className="border border-gray-200 p-2 text-left w-1/4 text-gray-500">基准值</th>
                                        <th className="border border-gray-200 p-2 text-left w-1/4 font-bold text-gray-800">新版本值</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diffResult.modified.map((m, idx) => (
                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="border border-gray-200 p-2 font-medium">{m.oldParam.name}</td>
                                            <td className="border border-gray-200 p-2 text-gray-500">{m.oldParam.group}</td>
                                            <td className="border border-gray-200 p-2 text-gray-500 line-through decoration-red-300 decoration-2">{m.oldParam.value}</td>
                                            <td className="border border-gray-200 p-2 text-orange-700 font-bold bg-orange-50/50">{m.newParam.value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Added Parameters */}
                    {diffResult.added.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-gray-700 mb-4 border-l-4 border-green-500 pl-3">
                                新增参数 ({diffResult.added.length})
                            </h3>
                            <table className="w-full text-sm border-collapse border border-gray-200">
                                <thead>
                                    <tr className="bg-green-50">
                                        <th className="border border-gray-200 p-2 text-left w-1/3">参数名</th>
                                        <th className="border border-gray-200 p-2 text-left w-1/3">分组</th>
                                        <th className="border border-gray-200 p-2 text-left w-1/3">值</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diffResult.added.map((p, idx) => (
                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="border border-gray-200 p-2 font-medium">{p.name}</td>
                                            <td className="border border-gray-200 p-2 text-gray-500">{p.group}</td>
                                            <td className="border border-gray-200 p-2">{p.value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Removed Parameters */}
                    {diffResult.removed.length > 0 && (
                        <div className="mb-8">
                            <h3 className="text-lg font-bold text-gray-700 mb-4 border-l-4 border-red-500 pl-3">
                                移除参数 ({diffResult.removed.length})
                            </h3>
                            <table className="w-full text-sm border-collapse border border-gray-200">
                                <thead>
                                    <tr className="bg-red-50">
                                        <th className="border border-gray-200 p-2 text-left w-1/3">参数名</th>
                                        <th className="border border-gray-200 p-2 text-left w-1/3">分组</th>
                                        <th className="border border-gray-200 p-2 text-left w-1/3">值</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diffResult.removed.map((p, idx) => (
                                        <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="border border-gray-200 p-2 font-medium text-gray-400">{p.name}</td>
                                            <td className="border border-gray-200 p-2 text-gray-400">{p.group}</td>
                                            <td className="border border-gray-200 p-2 text-gray-400 decoration-red-300 line-through">{p.value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    
                    {/* Footer */}
                    <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-400 text-xs">
                        <p>Powered by Smart Vehicle Parameter Tool</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DiffResultView;
