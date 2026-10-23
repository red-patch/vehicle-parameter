import React, { useMemo, useState, useEffect } from 'react';
import { Table, Tag, Checkbox, Dropdown, Button, Space, message } from 'antd';
import { SettingOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons';
import type { VehicleParameter } from '../../types';
import type { RequiredBaseline } from '../../utils/requiredBaseline';
import type { ColumnsType } from 'antd/es/table';
import * as XLSX from 'xlsx';
import SearchInput from '../common/SearchInput';
import { PAGE_SIZE, pagePagination } from '../common/tablePresets';


interface ParametersTableProps {
    data: VehicleParameter[];
    /**
     * 必填基准（来自当前字段组的 `required`）。为 `null` 时**不出现必填列**，
     * 复制/导出的表头也不带「是否必填」——没有基准就没有必填可言。
     */
    requiredBaseline?: RequiredBaseline | null;
}

const ParametersTable: React.FC<ParametersTableProps> = ({ data, requiredBaseline = null }) => {
    const isRequired = (name: string) => requiredBaseline?.has(name) ?? false;
    // V3.0: 改为多字段搜索（换行分隔）
    const [searchText, setSearchText] = useState('');
    const [visibleColumns, setVisibleColumns] = useState<string[]>([]);
    const [pageSize, setPageSize] = useState(PAGE_SIZE);

    // Pivot Data Logic
    const { tableData, productColumns, allProductNames } = useMemo(() => {
        // 1. Identify all unique product names
        const products = Array.from(new Set(data.map(p => p.productName).filter(Boolean))) as string[];

        // 2. Group by "Group + Name" to create rows
        // 行 = 固定三列 + 每个产品一列（列名是产品名或 'value'），值是参数文本
        type ParamRow = { key: string; group: string; name: string } & Record<string, string | number | undefined>;
        const rowMap = new Map<string, ParamRow>();

        data.forEach(p => {
            const rowKey = `${p.group}::${p.name}`; // Unique identifying row key
            if (!rowMap.has(rowKey)) {
                rowMap.set(rowKey, {
                    key: rowKey,
                    group: p.group,
                    name: p.name,
                });
            }
            const row = rowMap.get(rowKey)!;
            
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
        const cols: ColumnsType<ParamRow> = [
            {
                title: '分组',
                dataIndex: 'group',
                key: 'group',
                width: 100,
                render: (text: string) => <Tag color="default">{text}</Tag>,
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
        ];

        // 必填列只在有基准时出现；没有基准就整列收起（不给每行画一个无意义的「-」）
        if (requiredBaseline) {
            cols.push({
                title: '必填',
                key: 'isRequired',
                width: 60,
                render: (_: unknown, record: { name: string }) => {
                    const required = isRequired(record.name);
                    return required ? <Tag color="warning">是</Tag> : <span className="text-3">-</span>;
                },
                filters: [
                    { text: '必填', value: true },
                    { text: '选填', value: false },
                ],
                onFilter: (value: unknown, record: { name: string }) => {
                    const required = isRequired(record.name);
                    return required === value;
                },
            });
        }

        // CRITICAL FIX: If only 1 product (or none), use simple 参数值 column
        if (products.length <= 1) {
            cols.push({
                title: products[0] || '参数值',
                dataIndex: 'value',
                key: 'value',
                ellipsis: true,
                className: 'tabular-nums',
            });
        } else {
            products.forEach(prod => {
                cols.push({
                    title: prod,
                    dataIndex: prod,
                    key: prod,
                    width: 180,
                    ellipsis: true,
                    className: 'tabular-nums',
                });
            });
        }

        return { tableData: rows, productColumns: cols, allProductNames: products };
        // isRequired 由 requiredBaseline 派生，跟着它变；两者一起进依赖才不违背渲染完整性
    }, [data, requiredBaseline, isRequired]);

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
        <div className="p-3 surface-container rounded border border-default shadow-lg max-h-64 overflow-auto">
            <div className="mb-2 text-2 text-sm">选择显示的列：</div>
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
        // 有基准才带「是否必填」列，否则导出的表头与页面上看到的列一致
        const headers = ['分组', '参数名', ...(requiredBaseline ? ['是否必填'] : []), ...columnsToExport];

        const rows = filteredData.map(item => [
            item.group,
            item.name,
            ...(requiredBaseline ? [isRequired(item.name) ? '必填' : '选填'] : []),
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
        const headers = [
            '分组', '参数名',
            ...(requiredBaseline ? ['是否必填'] : []),
            ...(columnsToExport.length > 0 ? columnsToExport : ['参数值']),
        ];

        const rows = filteredData.map(item => [
            item.group,
            item.name,
            ...(requiredBaseline ? [isRequired(item.name) ? '必填' : '选填'] : []),
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
                {/* V3.0: 多字段搜索 —— 走 SearchInput 的 multiline（规范唯一搜索形态；
                    此前拿裸 TextArea 当搜索框，是规范点名要消灭的写法） */}
                <div className="flex-1 min-w-[300px]">
                    <SearchInput
                        multiline
                        width="lg"
                        hint="支持换行搜索多个"
                        placeholder="搜索参数名、分组或值"
                        value={searchText}
                        onChange={setSearchText}
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

                    {/* V3.0: 复制和下载按钮（§5.2 文案两段式：动作 + 格式） */}
                    <Button icon={<CopyOutlined />} onClick={handleCopy}>
                        复制
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleDownload}>
                        下载 CSV
                    </Button>
                </Space>
            </div>

            {/* 搜索结果提示 */}
            {searchText && (
                <div className="mb-2 text-2 text-sm">
                    搜索结果：{filteredData.length} / {tableData.length} 条
                </div>
            )}

            <Table
                dataSource={filteredData}
                columns={displayColumns}
                rowKey="key"
                pagination={pagePagination({
                    pageSize,
                    onShowSizeChange: (_current, size) => setPageSize(size),
                })}
                size="small"
                scroll={{ x: 'max-content' }}
                rowClassName={(record) => {
                    if (!isRequired(record.name)) return '';
                    
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
