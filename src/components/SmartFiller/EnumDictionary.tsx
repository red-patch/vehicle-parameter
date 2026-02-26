import React, { useState, useMemo, useEffect } from 'react';
import { Table, Input, Tag, Card, Spin, Empty, Typography } from 'antd';
import { SearchOutlined, DatabaseOutlined } from '@ant-design/icons';
import { preloadEnumData, getAllAttributeNames, getEnumValuesSync, isEnumDataLoaded } from '../../utils/attributeEnums';

const { Text } = Typography;

interface EnumItem {
    key: string;
    name: string;
    values: string[];
    count: number;
}

const EnumDictionary: React.FC = () => {
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(!isEnumDataLoaded());
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);

    useEffect(() => {
        if (!isEnumDataLoaded()) {
            setLoading(true);
            preloadEnumData().then(() => setLoading(false));
        }
    }, []);

    // 构建枚举数据列表
    const enumData: EnumItem[] = useMemo(() => {
        if (loading) return [];
        const names = getAllAttributeNames();
        return names.map(name => ({
            key: name,
            name,
            values: getEnumValuesSync(name),
            count: getEnumValuesSync(name).length
        }));
    }, [loading]);

    // 过滤后的数据
    const filteredData = useMemo(() => {
        if (!searchText.trim()) return enumData;
        const lower = searchText.toLowerCase();
        return enumData.filter(item => 
            item.name.toLowerCase().includes(lower) ||
            item.values.some(v => v.toLowerCase().includes(lower))
        );
    }, [enumData, searchText]);

    const columns = [
        {
            title: '字段名称',
            dataIndex: 'name',
            key: 'name',
            width: '40%',
            render: (name: string) => (
                <Text strong className="text-gray-800">{name}</Text>
            ),
            sorter: (a: EnumItem, b: EnumItem) => a.name.localeCompare(b.name, 'zh-CN'),
        },
        {
            title: '枚举值数量',
            dataIndex: 'count',
            key: 'count',
            width: '15%',
            render: (count: number) => (
                <Tag color={count > 10 ? 'blue' : count > 5 ? 'cyan' : 'green'}>{count} 个</Tag>
            ),
            sorter: (a: EnumItem, b: EnumItem) => a.count - b.count,
        },
        {
            title: '枚举值预览',
            dataIndex: 'values',
            key: 'values',
            render: (values: string[]) => {
                const preview = values.slice(0, 5);
                const hasMore = values.length > 5;
                return (
                    <div className="flex flex-wrap gap-1">
                        {preview.map((v, i) => (
                            <Tag key={i} className="text-xs">{v}</Tag>
                        ))}
                        {hasMore && (
                            <Tag color="default" className="text-xs">+{values.length - 5} 更多</Tag>
                        )}
                    </div>
                );
            }
        }
    ];

    // 展开行显示完整枚举值
    const expandedRowRender = (record: EnumItem) => (
        <div className="p-4 bg-gray-50 rounded">
            <Text type="secondary" className="mb-2 block">全部枚举值 ({record.count} 个):</Text>
            <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                {record.values.map((v, i) => (
                    <Tag 
                        key={i} 
                        color="blue" 
                        className="cursor-pointer hover:opacity-80"
                        onClick={() => navigator.clipboard.writeText(v)}
                        title="点击复制"
                    >
                        {v}
                    </Tag>
                ))}
            </div>
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Spin size="large" tip="加载枚举数据中..." />
            </div>
        );
    }

    return (
        <Card 
            title={
                <div className="flex items-center gap-2">
                    <DatabaseOutlined className="text-blue-500" />
                    <span>枚举字典</span>
                    <Tag>{enumData.length} 个字段</Tag>
                </div>
            }
            className="shadow-sm"
        >
            <div className="mb-4">
                <Input
                    placeholder="搜索字段名或枚举值..."
                    prefix={<SearchOutlined className="text-gray-400" />}
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    allowClear
                    size="large"
                    className="max-w-md"
                />
            </div>

            {filteredData.length === 0 ? (
                <Empty description="未找到匹配的枚举字段" />
            ) : (
                <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="key"
                    pagination={{ 
                        pageSize: 20, 
                        showSizeChanger: true,
                        showTotal: (total) => `共 ${total} 个字段`
                    }}
                    expandable={{
                        expandedRowRender,
                        expandedRowKeys,
                        onExpandedRowsChange: (keys) => setExpandedRowKeys(keys as string[]),
                        rowExpandable: () => true,
                    }}
                    size="middle"
                />
            )}
        </Card>
    );
};

export default EnumDictionary;
