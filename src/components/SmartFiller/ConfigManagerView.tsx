import React, { useState, useMemo, useEffect } from 'react';
import { Table, Input, Tag, Card, Spin, Empty, Typography, Tabs, Button, message, Popconfirm, Modal, Space } from 'antd';
import { SearchOutlined, SettingOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { preloadEnumData, getAllAttributeNames, getEnumValuesSync, isEnumDataLoaded } from '../../utils/attributeEnums';
import { getSystemRequiredFieldsSync, getQualityCheckFieldsSync, reloadCustomFields } from '../../utils/fieldLists';
import { useVehicleStore } from '../../store/vehicleStore';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import CoreFieldRuleComposer from './CoreFieldRuleComposer';

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

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingKey, setEditingKey] = useState<string>('');
    const [editingValues, setEditingValues] = useState<string[]>([]);
    const [isCreatingNewEnum, setIsCreatingNewEnum] = useState(false);

    const [editSysFields, setEditSysFields] = useState<string[]>(getSystemRequiredFieldsSync());
    const [editQualFields, setEditQualFields] = useState<string[]>(getQualityCheckFieldsSync());
    const [recentFieldHistory, setRecentFieldHistory] = useState<string[]>([]);

    const { assetLibraryPath } = useVehicleStore();

    useEffect(() => {
        if (!isEnumDataLoaded()) {
            setLoading(true);
            preloadEnumData(assetLibraryPath || undefined).then(() => {
                setLoading(false);
                setEditSysFields(getSystemRequiredFieldsSync());
                setEditQualFields(getQualityCheckFieldsSync());
            });
        } else {
            setLoading(false);
            setEditSysFields(getSystemRequiredFieldsSync());
            setEditQualFields(getQualityCheckFieldsSync());
        }
    }, [assetLibraryPath]);

    const handleExportDefaults = async () => {
        if (!assetLibraryPath) {
            message.warning('请先在页面右上角设置您的资产库大目录');
            return;
        }
        try {
            const allNames = getAllAttributeNames();
            const enumDict: Record<string, string[]> = {};
            allNames.forEach(name => {
                enumDict[name] = getEnumValuesSync(name);
            });
            const enumPath = await join(assetLibraryPath, 'custom_enums.json');
            await writeTextFile(enumPath, JSON.stringify(enumDict, null, 2));

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

    const filteredData = useMemo(() => {
        if (!searchText.trim()) return enumData;
        const lower = searchText.toLowerCase();
        return enumData.filter(item =>
            item.name.toLowerCase().includes(lower) ||
            item.values.some(v => v.toLowerCase().includes(lower))
        );
    }, [enumData, searchText]);

    const candidateFields = useMemo(() => {
        const merged = new Set<string>([
            ...getAllAttributeNames(),
            ...editSysFields,
            ...editQualFields,
        ]);
        return Array.from(merged).sort((left, right) => left.localeCompare(right, 'zh-CN'));
    }, [editSysFields, editQualFields, loading]);

    const rememberRecentFields = (fields: string[]) => {
        setRecentFieldHistory(prev => {
            const merged = [...fields.slice().reverse(), ...prev];
            return Array.from(new Set(merged)).slice(0, 20);
        });
    };

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
            const allNames = getAllAttributeNames();
            const enumDict: Record<string, string[]> = {};
            allNames.forEach(name => {
                enumDict[name] = getEnumValuesSync(name);
            });

            enumDict[editingKey.trim()] = editingValues.filter(v => v.trim());

            const enumPath = await join(assetLibraryPath, 'custom_enums.json');
            await writeTextFile(enumPath, JSON.stringify(enumDict, null, 2));

            message.success('词典更新成功！已持久化并执行热重载。');
            setEditModalVisible(false);

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
            await reloadCustomFields(assetLibraryPath);
        } catch (e) {
            console.error(e);
            message.error('字段规则保存失败');
        }
    };

    const columns = [
        {
            title: '字段名称',
            dataIndex: 'name',
            key: 'name',
            width: '40%',
            sorter: (a: EnumItem, b: EnumItem) => a.name.localeCompare(b.name, 'zh-CN'),
        },
        {
            title: '枚举值数量',
            dataIndex: 'count',
            key: 'count',
            width: '15%',
            sorter: (a: EnumItem, b: EnumItem) => a.count - b.count,
            render: (count: number) => <Tag color={count > 0 ? 'success' : 'default'}>{count} 个</Tag>
        },
        {
            title: '枚举值预览',
            dataIndex: 'values',
            key: 'values',
            width: '35%',
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
            render: (_: unknown, record: EnumItem) => (
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
                        <div className="p-4 flex flex-col gap-6">
                            <CoreFieldRuleComposer
                                title="系统必填规则"
                                description="设定在此列的字段，如果在体检中未找到对应数值，将被判定为空缺警告。"
                                selectedFields={editSysFields}
                                candidateFields={candidateFields}
                                recentFields={recentFieldHistory}
                                onChange={(next) => {
                                    setEditSysFields(next)
                                    rememberRecentFields(next)
                                }}
                            />

                            <CoreFieldRuleComposer
                                title="质量验车规则"
                                description="设定在此列的字段，在多个版本或源文件中若出现值不一致，将触发修改比对高亮。"
                                selectedFields={editQualFields}
                                candidateFields={candidateFields}
                                recentFields={recentFieldHistory}
                                onChange={(next) => {
                                    setEditQualFields(next)
                                    rememberRecentFields(next)
                                }}
                            />

                            <div className="flex justify-end mt-2">
                                <Button type="primary" size="large" aria-label="保存并应用" onClick={handleSaveFields} icon={<SettingOutlined />}>
                                    保存并应用
                                </Button>
                            </div>
                        </div>
                    )
                }
            ]} />

            <Modal
                title={isCreatingNewEnum ? '新增枚举字典项' : `编辑枚举: ${editingKey}`}
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
                        <Input
                            placeholder="输入枚举项后用逗号、分号或换行分隔"
                            value={editingValues.join('，')}
                            onChange={(event) => {
                                const next = event.target.value
                                    .split(/[\n,，；;]+/)
                                    .map(item => item.trim())
                                    .filter(Boolean)
                                setEditingValues(next)
                            }}
                        />
                    </div>
                </div>
            </Modal>
        </Card>
    );
};

export default ConfigManagerView;
