import React, { useMemo, useState, useEffect } from 'react';
import { Table, Input, Tag, Checkbox, Dropdown, Button, Space } from 'antd';
import { SearchOutlined, SettingOutlined } from '@ant-design/icons';
import type { VehicleParameter } from '../../types';
import { isFieldRequired } from '../../assets/requiredFields';
import type { ColumnsType } from 'antd/es/table';

interface ParametersTableProps {
    data: VehicleParameter[];
}

const ParametersTable: React.FC<ParametersTableProps> = ({ data }) => {
    const [searchText, setSearchText] = useState('');
    const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
    const [pageSize, setPageSize] = useState(20);
    // Pivot Data Logic
    const { tableData, productColumns, allProductNames } = useMemo(() => {
        // 1. Identify all unique product names
        const products = Array.from(new Set(data.map(p => p.productName).filter(Boolean))) as string[];

        // 2. Group by "Group + Name" to create rows
        const rowMap = new Map<string, any>();

        data.forEach(p => {
            const rowKey = `${p.group}::${p.name}`; // Unique identifying row key
            if (!rowMap.has(rowKey)) {
                rowMap.set(rowKey, {
                    key: rowKey,
                    group: p.group,
                    name: p.name,
                    // Initialize product values as empty or handle dynamically
                });
            }
            const row = rowMap.get(rowKey);
            // If we have a product name, assign value to that column. 
            // If not (legacy/single col), assign to 'value'
            if (p.productName) {
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
                width: 150,
                fixed: 'left',
                render: (text: string) => <Tag color="blue">{text}</Tag>,
                sorter: (a, b) => a.group.localeCompare(b.group),
                onCell: () => {
                    // Simple merge logic if sorted could be added here, but keeping it simple for now
                    return {};
                }
            },
            {
                title: '参数名',
                dataIndex: 'name',
                key: 'name',
                width: 200,
                fixed: 'left',
                sorter: (a, b) => a.name.localeCompare(b.name),
            },
            {
                title: '是否必填',
                key: 'isRequired',
                width: 90,
                fixed: 'left',
                render: (_: unknown, record: { name: string }) => {
                    const required = isFieldRequired(record.name);
                    return required ? <Tag color="orange">必填</Tag> : <Tag color="default">选填</Tag>;
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

        if (products.length > 0) {
            products.forEach(prod => {
                cols.push({
                    title: prod, // Product Name as Header
                    dataIndex: prod,
                    key: prod,
                    width: 200,
                    // Optional: render customization
                });
            });
        } else {
            // Fallback for flat list without product names
            cols.push({
                title: '参数值',
                dataIndex: 'value',
                key: 'value',
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
        if (visibleColumns.length === 0) return productColumns;
        
        // Fixed columns (group, name, isRequired) + visible product columns
        const fixedKeys = ['group', 'name', 'isRequired'];
        return productColumns.filter(col => {
            const key = col.key as string;
            if (fixedKeys.includes(key)) return true;
            return visibleColumns.includes(key);
        });
    }, [productColumns, visibleColumns]);

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

    const filteredData = useMemo(() => {
        if (!searchText) return tableData;
        const lower = searchText.toLowerCase();
        return tableData.filter(item =>
            item.name.toLowerCase().includes(lower) ||
            item.group.toLowerCase().includes(lower) ||
            allProductNames.some(prod => String(item[prod] || '').toLowerCase().includes(lower))
        );
    }, [tableData, searchText, allProductNames]);

    return (
        <div>
            <div className="mb-4 flex items-center gap-4">
                <Input
                    prefix={<SearchOutlined />}
                    placeholder="搜索参数名、分组或值..."
                    onChange={e => setSearchText(e.target.value)}
                    allowClear
                    className="max-w-md"
                />
                {allProductNames.length > 1 && (
                    <Dropdown dropdownRender={() => columnSelectorContent} trigger={['click']}>
                        <Button icon={<SettingOutlined />}>
                            列显示 ({visibleColumns.length}/{allProductNames.length})
                        </Button>
                    </Dropdown>
                )}
            </div>
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
                scroll={{ x: 'max-content' }} // Enable horizontal scroll for many products
                bordered
                rowClassName={(record) => {
                    const isRequired = isFieldRequired(record.name);
                    if (!isRequired) return '';
                    
                    // Check if value is considered empty
                    const isEmpty = (val: unknown) => 
                        val === undefined || val === null || val === '' || 
                        val === '/' || val === '\\' || val === '无' || val === '-' || val === 'NA';
                    
                    // Check only VISIBLE columns - highlight if ANY visible column has empty value
                    const columnsToCheck = visibleColumns.length > 0 ? visibleColumns : allProductNames;
                    const hasEmptyInVisible = columnsToCheck.length > 0
                        ? columnsToCheck.some(prod => isEmpty(record[prod]))
                        : isEmpty(record.value);
                    
                    // Highlight if required AND has empty value in visible columns
                    return hasEmptyInVisible ? 'required-empty' : '';
                }}
            />
        </div>
    );
};

export default ParametersTable;
