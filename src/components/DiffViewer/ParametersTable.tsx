import React, { useMemo, useState, useEffect } from 'react';
import { Table, Input, Tag, Checkbox, Dropdown, Button, Space, message } from 'antd';
import { SettingOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import type { VehicleParameter } from '../../types';
import { isFieldRequired } from '../../assets/requiredFields';
import type { ColumnsType } from 'antd/es/table';
import * as XLSX from 'xlsx';

const { TextArea } = Input;

interface ParametersTableProps {
    data: VehicleParameter[];
}

const ParametersTable: React.FC<ParametersTableProps> = ({ data }) => {
    // V3.0: 改为多字段搜索（换行分隔）
    const [searchText, setSearchText] = useState('');
    const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
    const [pageSize, setPageSize] = useState(20);

    // Pivot Data Logic
    const { tableData, productColumns, allProductNames } = useMemo(() => {
        // 1. Identify all unique product names
        const products = Array.from(new Set(data.map(p => p.productName).filter(Boolean))) as string[];

        // DEBUG
        console.log('[ParametersTable] products:', products);
        console.log('[ParametersTable] data sample:', data.slice(0, 2));

        // 2. Group by "Group + Name" to create rows
        const rowMap = new Map<string, any>();

        data.forEach(p => {
            const rowKey = `${p.group}::${p.name}`; // Unique identifying row key
            if (!rowMap.has(rowKey)) {
                rowMap.set(rowKey, {
                    key: rowKey,
                    group: p.group,
                    name: p.name,
                });
            }
            const row = rowMap.get(rowKey);
            
            // CRITICAL FIX: If only 1 product, always use 'value' key for simpler column mapping
            if (products.length <= 1) {
                row['value'] = p.value;
            } else if (p.productName) {
                row[p.productName] = p.value;
            } else {
                row['value'] = p.value;
            }
        });

        const rows = Array.from(rowMap.values());

        // 3. Generate Columns
        const cols: ColumnsType<any> = [
            {
                title: '分组',
                dataIndex: 'group',
                key: 'group',
                width: 100,
                render: (text: string) => <Tag color="blue">{text}</Tag>,
                sorter: (a, b) => a.group.localeCompare(b.group),
            },
            {
                title: '参数名',
                dataIndex: 'name',
                key: 'name',
                width: 160,
                fixed: 'left',
                sorter: (a, b) => a.name.localeCompare(b.name),
            },
            {
                title: '必填',
                key: 'isRequired',
                width: 60,
                render: (_: unknown, record: { name: string }) => {
                    const required = isFieldRequired(record.name);
                    return required ? <Tag color="orange">是</Tag> : <span className="text-gray-400">-</span>;
                },
                filters: [
                    { text: '必填', value: true },
                    { text: '选填', value: false },
                ],
                onFilter: (value: unknown, record: { name: string }) => {
                    const required = isFieldRequired(record.name);
                    return required === value;
                },
            }
        ];

        // CRITICAL FIX: If only 1 product (or none), use simple 参数值 column
        if (products.length <= 1) {
            cols.push({
                title: products[0] || '参数值',
                dataIndex: 'value',
                key: 'value',
                ellipsis: true,
            });
        } else {
            products.forEach(prod => {
                cols.push({
                    title: prod,
                    dataIndex: prod,
                    key: prod,
                    width: 180,
                    ellipsis: true,
                });
            });
        }

        return { tableData: rows, productColumns: cols, allProductNames: products };
    }, [data]);

    // Initialize visible columns when product columns change (only on first load)
    useEffect(() => {
        if (allProductNames.length > 0) {
            setVisibleColumns(prev => prev.length === 0 ? allProductNames : prev);
        }
    }, [allProductNames]);

    // Filter columns based on visibility selection
    const displayColumns = useMemo(() => {
        // 如果只有一个产品或没有产品，直接返回所有列（包括 value 列）
        if (allProductNames.length <= 1) return productColumns;
        
        if (visibleColumns.length === 0) return productColumns;
        
        const fixedKeys = ['group', 'name', 'isRequired'];
        return productColumns.filter(col => {
            const key = col.key as string;
            if (fixedKeys.includes(key)) return true;
            return visibleColumns.includes(key);
        });
    }, [productColumns, visibleColumns, allProductNames]);

    // Column visibility dropdown content
    const columnSelectorContent = (
        <div className="p-3 bg-white rounded shadow-lg border max-h-64 overflow-auto">
            <div className="mb-2 text-gray-500 text-sm">选择显示的列：</div>
            <Checkbox.Group
                value={visibleColumns}
                onChange={(checked) => setVisibleColumns(checked as string[])}
            >
                <Space direction="vertical">
                    {allProductNames.map(prod => (
                        <Checkbox key={prod} value={prod}>
                            {prod}
                        </Checkbox>
                    ))}
                </Space>
            </Checkbox.Group>
        </div>
    );

    // V3.0: 多字段搜索逻辑（换行分隔，任一匹配即显示）
    const filteredData = useMemo(() => {
        if (!searchText.trim()) return tableData;
        
        // 按换行符分割搜索关键词
        const keywords = searchText
            .split('\n')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);
        
        if (keywords.length === 0) return tableData;
        
        return tableData.filter(item => {
            // 任一关键词匹配即显示
            return keywords.some(keyword => 
                item.name.toLowerCase().includes(keyword) ||
                item.group.toLowerCase().includes(keyword) ||
                allProductNames.some(prod => String(item[prod] || '').toLowerCase().includes(keyword))
            );
        });
    }, [tableData, searchText, allProductNames]);

    // V3.0: 复制数据
    const handleCopy = () => {
        if (!filteredData.length) {
            message.warning('暂无数据可复制');
            return;
        }

        const columnsToExport = visibleColumns.length > 0 ? visibleColumns : allProductNames;
        const headers = ['分组', '参数名', '是否必填', ...columnsToExport];
        
        const rows = filteredData.map(item => [
            item.group,
            item.name,
            isFieldRequired(item.name) ? '必填' : '选填',
            ...columnsToExport.map(col => String(item[col] || ''))
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const csvOutput = XLSX.utils.sheet_to_csv(ws);

        navigator.clipboard.writeText(csvOutput)
            .then(() => message.success('数据已复制到剪贴板'))
            .catch(err => message.error('复制失败: ' + err));
    };

    // V3.0: 下载CSV
    const handleDownload = async () => {
        if (!filteredData.length) {
            message.warning('暂无数据可下载');
            return;
        }

        const columnsToExport = visibleColumns.length > 0 ? visibleColumns : allProductNames;
        const headers = ['分组', '参数名', '是否必填', ...(columnsToExport.length > 0 ? columnsToExport : ['参数值'])];
        
        const rows = filteredData.map(item => [
            item.group,
            item.name,
            isFieldRequired(item.name) ? '必填' : '选填',
            ...(columnsToExport.length > 0 
                ? columnsToExport.map(col => String(item[col] || ''))
                : [String(item.value || '')])
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        const csvOutput = XLSX.utils.sheet_to_csv(ws);

        const { downloadCsv } = await import('../../utils/downloadCsv');
        await downloadCsv(csvOutput, '参数表导出.csv');
    };

    return (
        <div>
            <div className="mb-4 flex items-center gap-4 flex-wrap">
                {/* V3.0: 多字段搜索 */}
                <div className="flex-1 min-w-[300px]">
                    <TextArea
                        placeholder="搜索参数名、分组或值...（支持多个关键词，换行分隔）"
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        autoSize={{ minRows: 1, maxRows: 4 }}
                        allowClear
                    />
                </div>
                
                <Space>
                    {allProductNames.length > 1 && (
                        <Dropdown dropdownRender={() => columnSelectorContent} trigger={['click']}>
                            <Button icon={<SettingOutlined />}>
                                列显示 ({visibleColumns.length}/{allProductNames.length})
                            </Button>
                        </Dropdown>
                    )}
                    
                    {/* V3.0: 复制和下载按钮 */}
                    <Button icon={<CopyOutlined />} onClick={handleCopy}>
                        复制
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                        下载CSV
                    </Button>
                </Space>
            </div>

            {/* 搜索结果提示 */}
            {searchText && (
                <div className="mb-2 text-gray-500 text-sm">
                    搜索结果：{filteredData.length} / {tableData.length} 条
                </div>
            )}

            <Table
                dataSource={filteredData}
                columns={displayColumns}
                rowKey="key"
                pagination={{ 
                    pageSize: pageSize,
                    showSizeChanger: true,
                    pageSizeOptions: ['10', '20', '50', '100'],
                    showTotal: (total) => `共 ${total} 条`,
                    onShowSizeChange: (_current, size) => setPageSize(size),
                }}
                size="small"
                scroll={{ x: 'max-content' }}
                bordered
                rowClassName={(record) => {
                    const isRequired = isFieldRequired(record.name);
                    if (!isRequired) return '';
                    
                    // Check if value is considered empty: 空值、"-"、"NA"
                    const isEmpty = (val: unknown) => 
                        val === undefined || val === null || val === '' || 
                        val === '-' || val === 'NA';
                    
                    const columnsToCheck = visibleColumns.length > 0 ? visibleColumns : allProductNames;
                    const hasEmptyInVisible = columnsToCheck.length > 0
                        ? columnsToCheck.some(prod => isEmpty(record[prod]))
                        : isEmpty(record.value);
                    
                    return hasEmptyInVisible ? 'required-empty' : '';
                }}
            />
        </div>
    );
};

export default ParametersTable;
