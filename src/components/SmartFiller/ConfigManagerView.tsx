import React, { useState, useMemo, useEffect } from 'react';
import { Table, Input, Tag, Card, Spin, Empty, Typography, Tabs, Button, message, Popconfirm, Modal, Space, Select, Divider } from 'antd';
import { SearchOutlined, SettingOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { preloadEnumData, getAllAttributeNames, getEnumValuesSync, isEnumDataLoaded } from '../../utils/attributeEnums';
import { getSystemRequiredFieldsSync, getQualityCheckFieldsSync, reloadCustomFields } from '../../utils/fieldLists';
import { useVehicleStore } from '../../store/vehicleStore';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

const { Text } = Typography;

interface EnumItem {
    key: string;
    name: string;
    values: string[];
    count: number;
}

const ConfigManagerView: React.FC = () => {
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(!isEnumDataLoaded());
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
    
    // Editor States
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingKey, setEditingKey] = useState<string>('');
    const [editingValues, setEditingValues] = useState<string[]>([]);
    const [isCreatingNewEnum, setIsCreatingNewEnum] = useState(false);

    // Fields Editor States
    const [editSysFields, setEditSysFields] = useState<string[]>(getSystemRequiredFieldsSync());
    const [editQualFields, setEditQualFields] = useState<string[]>(getQualityCheckFieldsSync());

    const { assetLibraryPath } = useVehicleStore();

    useEffect(() => {
        if (!isEnumDataLoaded()) {
            setLoading(true);
            preloadEnumData(assetLibraryPath || undefined).then(() => {
                setLoading(false);
                setEditSysFields(getSystemRequiredFieldsSync());
                setEditQualFields(getQualityCheckFieldsSync());
            });
        }
    }, [assetLibraryPath]);

    const handleExportDefaults = async () => {
        if (!assetLibraryPath) {
            message.warning('请先在页面右上角设置您的资产库大目录');
            return;
        }
        try {
            // 1. 导出所有的 Enum
            const allNames = getAllAttributeNames();
            const enumDict: Record<string, string[]> = {};
            allNames.forEach(name => {
                enumDict[name] = getEnumValuesSync(name);
            });
            const enumPath = await join(assetLibraryPath, 'custom_enums.json');
            await writeTextFile(enumPath, JSON.stringify(enumDict, null, 2));

            // 2. 导出所有的 Fields
            const fieldDict = {
                systemRequired: getSystemRequiredFieldsSync(),
                qualityCheck: getQualityCheckFieldsSync()
            };
            const fieldPath = await join(assetLibraryPath, 'custom_fields.json');
            await writeTextFile(fieldPath, JSON.stringify(fieldDict, null, 2));

            message.success('导出成功！已在您的资产库生成 custom_enums.json 及 custom_fields.json');
        } catch (e) {
            console.error(e);
            message.error('导出系统预设模版失败');
        }
    };

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

    // --- Save Actions ---
    const handleSaveEnum = async () => {
        if (!assetLibraryPath) {
            message.warning('请先设置资产库大目录');
            return;
        }
        if (!editingKey.trim()) {
            message.warning('字典主键不能为空');
            return;
        }
        try {
            // Build current full enum map
            const allNames = getAllAttributeNames();
            const enumDict: Record<string, string[]> = {};
            allNames.forEach(name => {
                enumDict[name] = getEnumValuesSync(name);
            });

            // Update with our edited/new enum
            enumDict[editingKey.trim()] = editingValues.filter(v => v.trim());

            // Write to file
            const enumPath = await join(assetLibraryPath, 'custom_enums.json');
            await writeTextFile(enumPath, JSON.stringify(enumDict, null, 2));

            message.success('词典更新成功！已持久化并执行热重载。');
            setEditModalVisible(false);
            
            // Reload into memory
            setLoading(true);
            await preloadEnumData(assetLibraryPath);
            setLoading(false);
        } catch (e) {
            console.error(e);
            message.error('字典保存失败');
        }
    };

    const handleSaveFields = async () => {
        if (!assetLibraryPath) {
            message.warning('请先设置资产库大目录');
            return;
        }
        try {
            const fieldDict = {
                systemRequired: editSysFields,
                qualityCheck: editQualFields
            };
            const fieldPath = await join(assetLibraryPath, 'custom_fields.json');
            await writeTextFile(fieldPath, JSON.stringify(fieldDict, null, 2));

            message.success('字段规则更新成功！已持久化并执行热重载。');
            // Reload into memory
            await reloadCustomFields(assetLibraryPath);
        } catch (e) {
            console.error(e);
            message.error('规则字段保存失败');
        }
    };

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
        },
        {
            title: '操作',
            key: 'action',
            width: '10%',
            render: (_: any, record: EnumItem) => (
                <Button 
                    type="link" 
                    icon={<EditOutlined />} 
                    onClick={() => {
                        setIsCreatingNewEnum(false);
                        setEditingKey(record.name);
                        setEditingValues([...record.values]);
                        setEditModalVisible(true);
                    }}
                >
                    编辑
                </Button>
            )
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
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                        <SettingOutlined className="text-blue-500" />
                        <span>系统配置中控台</span>
                    </div>
                    <Popconfirm 
                        title="导出系统默认配置" 
                        description="此操作将在您的资产库内生成两份带有当前所有规则的 JSON 文件（若已存在则会覆盖）。确定继续吗？" 
                        onConfirm={handleExportDefaults}
                        okText="确认覆盖导出"
                        cancelText="取消"
                    >
                        <Button type="primary" icon={<DownloadOutlined />}>
                            导出当前系统配置模板
                        </Button>
                    </Popconfirm>
                </div>
            }
            className="shadow-sm"
        >
            <Tabs defaultActiveKey="enums" items={[
                {
                    key: 'enums',
                    label: '枚举字典配置',
                    children: (
                        <div>
                            <div className="mb-4 flex justify-between items-center">
                                <Input
                                    placeholder="搜索字段名或枚举值..."
                                    prefix={<SearchOutlined className="text-gray-400" />}
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    allowClear
                                    size="large"
                                    className="max-w-md"
                                />
                                <Space>
                                    <Tag>{enumData.length} 个字段</Tag>
                                    <Button 
                                        type="primary" 
                                        icon={<PlusOutlined />} 
                                        onClick={() => {
                                            setIsCreatingNewEnum(true);
                                            setEditingKey('');
                                            setEditingValues([]);
                                            setEditModalVisible(true);
                                        }}
                                    >
                                        新增业务字典
                                    </Button>
                                </Space>
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
                        </div>
                    )
                },
                {
                    key: 'fields',
                    label: '核心字段配置',
                    children: (
                        <div className="p-4">
                            <div className="mb-6">
                                <Text strong className="text-lg block mb-2">系统必填排查雷达 (System Required)</Text>
                                <Text type="secondary" className="block mb-4">设定在此列的字段，如果在体检中未找到对应数值，将被判定为空缺警告。</Text>
                                <Select
                                    mode="tags"
                                    style={{ width: '100%' }}
                                    placeholder="输入必须检查的字段名"
                                    value={editSysFields}
                                    onChange={setEditSysFields}
                                />
                            </div>
                            <Divider />
                            <div className="mb-6">
                                <Text strong className="text-lg block mb-2">质量交叉比对雷达 (Quality Check)</Text>
                                <Text type="secondary" className="block mb-4">设定在此列的字段，在多个版本或源文件中若出现值不一致，将触发修改比对高亮。</Text>
                                <Select
                                    mode="tags"
                                    style={{ width: '100%' }}
                                    placeholder="输入质量关注的字段名"
                                    value={editQualFields}
                                    onChange={setEditQualFields}
                                />
                            </div>
                            <div className="flex justify-end mt-8">
                                <Button type="primary" size="large" onClick={handleSaveFields} icon={<SettingOutlined />}>
                                    保存当前字段规则并应用
                                </Button>
                            </div>
                        </div>
                    )
                }
            ]} />

            <Modal
                title={isCreatingNewEnum ? "新增枚举字典项" : `编辑枚举: ${editingKey}`}
                open={editModalVisible}
                onOk={handleSaveEnum}
                onCancel={() => setEditModalVisible(false)}
                okText="保存并使之生效"
                width={600}
                destroyOnClose
            >
                <div className="flex flex-col gap-4 mt-4">
                    {isCreatingNewEnum && (
                        <div>
                            <Text strong className="mb-1 block">新字典属性名称:</Text>
                            <Input 
                                placeholder="例如: 轮辋材质" 
                                value={editingKey} 
                                onChange={e => setEditingKey(e.target.value)} 
                            />
                        </div>
                    )}
                    <div>
                        <Text strong className="mb-1 block">允许的枚举值集合:</Text>
                        <Text type="secondary" className="mb-2 block text-xs">录入后回车即可分块。代表这些选项是合规库内的绝对权威标准。</Text>
                        <Select
                            mode="tags"
                            style={{ width: '100%' }}
                            placeholder="输入枚举项并回车"
                            value={editingValues}
                            onChange={setEditingValues}
                            open={false}
                        />
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default ConfigManagerView;
