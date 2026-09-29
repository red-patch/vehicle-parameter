import React, { useState, useMemo, useEffect } from 'react';
import { Table, Input, Tag, Card, Skeleton, Empty, Typography, Tabs, Button, message, Modal, Space, AutoComplete, Select, Switch } from 'antd';
import { SearchOutlined, SettingOutlined, EditOutlined, PlusOutlined, FileExcelOutlined, FileTextOutlined, CopyOutlined, DeleteOutlined } from '@ant-design/icons';
import { preloadEnumData, getAllAttributeNames, getEnumValuesSync, isEnumDataLoaded, getEnumActiveFilter, setEnumActiveFilter, getAllCategoryPaths, getAllCategories, isEnumActive } from '../../utils/attributeEnums';
import { getFieldGroupsSync, reloadCustomFields, type FieldGroupConfigItem } from '../../utils/fieldLists';
import {
    getAssetTagGroupsSync,
    reloadCustomAssetTagGroups,
    saveCustomAssetTagGroups,
    normalizeTagGroupsConfig,
    normalizeTagList,
    purgeTagFromLibrary,
    DEFAULT_GROUP_ID,
    type TagGroupItem,
} from '../../utils/assetTagGroups';
import { useVehicleStore } from '../../store/vehicleStore';
import { useShallow } from 'zustand/react/shallow';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { parseFieldBatchInput } from './coreFieldRules';
import EnumImportModal from './EnumImportModal';

const { Text } = Typography;

interface EnumItem {
    key: string;
    name: string;
    values: string[];
    count: number;
    fieldKey: string;
    category: string;
    required: string;
    categoryPath: string;
    isActive: boolean;
}

interface EnumMeta {
    [fieldName: string]: {
        category?: string;
        required?: string;
        key?: string;
        categoryPath?: string;
    };
}

interface FieldRow {
    key: string;
    name: string;
}

const ConfigManagerView: React.FC = () => {
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(!isEnumDataLoaded());
    const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);

    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editingKey, setEditingKey] = useState<string>('');
    const [editingValues, setEditingValues] = useState<string[]>([]);
    const [isCreatingNewEnum, setIsCreatingNewEnum] = useState(false);
    const [enumImportVisible, setEnumImportVisible] = useState(false);
    const [enumMeta, setEnumMeta] = useState<EnumMeta>({});
    const [enumPageSize, setEnumPageSize] = useState(20);
    const [filterModalVisible, setFilterModalVisible] = useState(false);
    const [editingFilter, setEditingFilter] = useState<{ categoryPaths: string[]; categories: string[] }>({ categoryPaths: [], categories: [] });

    const [fieldGroups, setFieldGroups] = useState<FieldGroupConfigItem[]>(getFieldGroupsSync());
    const [selectedFieldGroupId, setSelectedFieldGroupId] = useState<string>(getFieldGroupsSync()[0]?.id || 'system-required');
    const [tagGroups, setTagGroups] = useState<TagGroupItem[]>(getAssetTagGroupsSync().groups);
    const [editExclusiveGroups, setEditExclusiveGroups] = useState<string[]>(getAssetTagGroupsSync().exclusiveGroups || []);

    const [fieldSearch, setFieldSearch] = useState('');
    const [fieldCreateModal, setFieldCreateModal] = useState<{ open: boolean; value: string }>({
        open: false,
        value: '',
    });
    const [fieldBatchModal, setFieldBatchModal] = useState<{ open: boolean; value: string }>({
        open: false,
        value: '',
    });
    const [fieldGroupModal, setFieldGroupModal] = useState<{ open: boolean; mode: 'create' | 'rename'; value: string }>({
        open: false,
        mode: 'create',
        value: '',
    });



    const { assetLibraryPath, bumpAssetTagGroupsVersion, bumpFieldGroupsVersion, bumpAssetVersion } = useVehicleStore(useShallow(state => ({
        assetLibraryPath: state.assetLibraryPath,
        bumpAssetTagGroupsVersion: state.bumpAssetTagGroupsVersion,
        bumpFieldGroupsVersion: state.bumpFieldGroupsVersion,
        bumpAssetVersion: state.bumpAssetVersion,
    })));

    useEffect(() => {
        const init = async () => {
            try {
                if (assetLibraryPath) await reloadCustomFields(assetLibraryPath);
                if (!isEnumDataLoaded()) {
                    setLoading(true);
                    await preloadEnumData(assetLibraryPath || undefined);
                }
                const nextFieldGroups = getFieldGroupsSync();
                setFieldGroups(nextFieldGroups);
                setSelectedFieldGroupId(nextFieldGroups[0]?.id || 'system-required');
                const tagGroupsConfig = getAssetTagGroupsSync();
                setTagGroups(tagGroupsConfig.groups);
                setEditExclusiveGroups(tagGroupsConfig.exclusiveGroups || []);

                // 加载枚举元数据 + 激活过滤器
                if (assetLibraryPath) {
                    try {
                    const metaPath = await join(assetLibraryPath, 'custom_enum_meta.json');
                    setEnumMeta(JSON.parse(await readTextFile(metaPath)));
                    } catch { /* 文件可能不存在 */ }
                }
                setEditingFilter(getEnumActiveFilter());
            } catch (e) {
                console.error('系统配置初始化失败', e);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [assetLibraryPath]);



    const enumData: EnumItem[] = useMemo(() => {
        if (loading) return [];
        const names = getAllAttributeNames();
        return names.map(name => {
            const meta = enumMeta[name] || {};
            return {
                key: name,
                name,
                values: getEnumValuesSync(name),
                count: getEnumValuesSync(name).length,
                fieldKey: meta.key || '',
                category: meta.category || '',
                required: meta.required || '',
                categoryPath: meta.categoryPath || '',
                isActive: isEnumActive(name),
            };
        });
    }, [loading, enumMeta]);

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
            ...fieldGroups.flatMap((group) => group.fields),
        ]);
        return Array.from(merged).sort((left, right) => left.localeCompare(right, 'zh-CN'));
    }, [fieldGroups, loading]);

    const selectedFieldGroup = useMemo(
        () => fieldGroups.find((group) => group.id === selectedFieldGroupId) || fieldGroups[0] || null,
        [fieldGroups, selectedFieldGroupId]
    );

    const selectedFieldRows = useMemo<FieldRow[]>(
        () => (selectedFieldGroup?.fields || []).map((field) => ({ key: field, name: field })),
        [selectedFieldGroup]
    );

    const updateSelectedFieldGroup = (updater: (group: FieldGroupConfigItem) => FieldGroupConfigItem) => {
        if (!selectedFieldGroup) return;
        setFieldGroups((prev) => prev.map((group) => group.id === selectedFieldGroup.id ? updater(group) : group));
    };

    const addFieldToSelectedGroup = (field: string) => {
        const trimmed = field.trim();
        if (!trimmed) return;
        updateSelectedFieldGroup((group) => ({
            ...group,
            fields: Array.from(new Set([...group.fields, trimmed])).sort((left, right) => left.localeCompare(right, 'zh-CN')),
        }));
    };

    const removeFieldFromSelectedGroup = (field: string) => {
        updateSelectedFieldGroup((group) => ({
            ...group,
            fields: group.fields.filter((item) => item !== field),
        }));
    };

    const clearSelectedFieldGroup = () => {
        updateSelectedFieldGroup((group) => ({
            ...group,
            fields: [],
        }));
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
                groups: fieldGroups,
            };
            const fieldPath = await join(assetLibraryPath, 'custom_fields.json');
            await writeTextFile(fieldPath, JSON.stringify(fieldDict, null, 2));

            message.success('字段规则更新成功！已持久化并执行热重载。');
            await reloadCustomFields(assetLibraryPath);
            bumpFieldGroupsVersion();
        } catch (e) {
            console.error(e);
            message.error('字段规则保存失败');
        }
    };

    const handleSaveTagGroups = async () => {
        if (!assetLibraryPath) {
            message.warning('请先设置资产库大目录');
            return;
        }
        try {
            const normalizedGroups = normalizeTagGroupsConfig({
                groups: tagGroups,
                exclusiveGroups: editExclusiveGroups,
            }).groups;
            setTagGroups(normalizedGroups);
            await saveCustomAssetTagGroups(assetLibraryPath, {
                groups: normalizedGroups,
                exclusiveGroups: editExclusiveGroups,
            });
            await reloadCustomAssetTagGroups(assetLibraryPath);
            bumpAssetTagGroupsVersion();
            message.success('标签分组规则更新成功！已持久化并立即生效。');
        } catch (e) {
            console.error(e);
            message.error('标签分组规则保存失败');
        }
    };

    const openConfigFile = async (fileName: string) => {
        if (!assetLibraryPath) { message.warning('请先设置资产库目录'); return; }
        try {
            const { openPath } = await import('@tauri-apps/plugin-opener');
            const fullPath = await join(assetLibraryPath, fileName);
            await openPath(fullPath);
        } catch (e) {
            message.error(`无法打开文件: ${e}`);
        }
    };

;



    const columns = [
        {
            title: '字段名称',
            dataIndex: 'name',
            key: 'name',
            width: 180,
            fixed: 'left' as const,
            sorter: (a: EnumItem, b: EnumItem) => a.name.localeCompare(b.name, 'zh-CN'),
        },
        {
            title: '字段标识',
            dataIndex: 'fieldKey',
            key: 'fieldKey',
            width: 130,
            ellipsis: true,
            render: (v: string) => v || <span className="text-4">-</span>,
        },
        {
            title: '已激活',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 65,
            filters: [
                { text: '已激活', value: true },
                { text: '未激活', value: false },
            ],
            onFilter: (value: any, record: EnumItem) => record.isActive === value,
            render: (v: boolean) => v ? <Tag color="success" className="text-xs">已激活</Tag> : <span className="text-4">-</span>,
        },
        {
            title: '属性类别',
            dataIndex: 'category',
            key: 'category',
            width: 90,
            filters: enumData.length > 0
                ? [...new Set(enumData.map(d => d.category).filter(Boolean))].map(v => ({ text: v, value: v }))
                : undefined,
            onFilter: (value: any, record: EnumItem) => record.category === value,
            render: (v: string) => v ? <Tag className="text-xs">{v}</Tag> : <span className="text-4">-</span>,
        },
        {
            title: '必填',
            dataIndex: 'required',
            key: 'required',
            width: 60,
            filters: [
                { text: '是', value: '是' },
                { text: '否', value: '否' },
            ],
            onFilter: (value: any, record: EnumItem) => record.required === value,
            render: (v: string) => v === '是' ? <Tag color="error" className="text-xs">是</Tag> : v === '否' ? <Tag className="text-xs">否</Tag> : <span className="text-4">-</span>,
        },
        {
            title: '所属类目',
            dataIndex: 'categoryPath',
            key: 'categoryPath',
            width: 120,
            ellipsis: true,
            filters: enumData.length > 0
                ? [...new Set(enumData.map(d => d.categoryPath).filter(Boolean))].map(v => ({ text: v, value: v }))
                : undefined,
            onFilter: (value: any, record: EnumItem) => record.categoryPath === value,
            render: (v: string) => v || <span className="text-4">-</span>,
        },
        {
            title: '枚举数',
            dataIndex: 'count',
            key: 'count',
            width: 70,
            sorter: (a: EnumItem, b: EnumItem) => a.count - b.count,
            render: (count: number) => <Tag color={count > 0 ? 'success' : 'default'}>{count}</Tag>
        },
        {
            title: '枚举值预览',
            dataIndex: 'values',
            key: 'values',
            width: 260,
            render: (values: string[]) => {
                const preview = values.slice(0, 5);
                const hasMore = values.length > 5;
                return (
                    <div className="flex flex-wrap gap-1">
                        {preview.map((v, i) => (
                            <Tag key={i} className="text-xs max-w-[120px] overflow-hidden text-ellipsis">{v}</Tag>
                        ))}
                        {hasMore && (
                            <Tag color="default" className="text-xs">+{values.length - 5}</Tag>
                        )}
                    </div>
                );
            }
        },
        {
            title: '',
            key: 'action',
            width: 60,
            render: (_: unknown, record: EnumItem) => (
                <Button
                    type="link"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                        setIsCreatingNewEnum(false);
                        setEditingKey(record.name);
                        setEditingValues([...record.values]);
                        setEditModalVisible(true);
                    }}
                />
            )
        }
    ];

    const expandedRowRender = (record: EnumItem) => (
        <EnumExpandedRow record={record} />
    );

    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <Skeleton active paragraph={{ rows: 1 }} title={{ width: '40%' }} />
                <Skeleton active paragraph={{ rows: 6 }} />
                <Skeleton active paragraph={{ rows: 3 }} />
            </div>
        );
    }

    return (
        <Card
            title={
                <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                        <SettingOutlined className="text-brand" />
                        <span>系统配置中控台</span>
                    </div>
                    <Button icon={<FileExcelOutlined />} onClick={() => setEnumImportVisible(true)}>
                        从 Excel 导入枚举
                    </Button>
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
                                    prefix={<SearchOutlined className="text-3" />}
                                    value={searchText}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    allowClear
                                    size="large"
                                    className="max-w-md"
                                />
                                <Space wrap>
                                    <Tag>{enumData.length} 个字段</Tag>
                                    <Tag color="processing">{enumData.filter(d => isEnumActive(d.name)).length} 激活</Tag>
                                    <Button size="small" icon={<CopyOutlined />} onClick={() => {
                                        const required = enumData.filter(d => d.required === '是').map(d => d.name);
                                        if (required.length === 0) { message.info('没有必填字段'); return; }
                                        navigator.clipboard.writeText(required.join('\n'));
                                        message.success(`已复制 ${required.length} 个必填字段名`);
                                    }}>复制必填</Button>
                                    <Button size="small" icon={<FileTextOutlined />} onClick={() => openConfigFile('custom_enums.json')}>枚举字典</Button>
                                    <Button size="small" icon={<FileTextOutlined />} onClick={() => openConfigFile('custom_enum_meta.json')}>枚举元数据</Button>
                                    <Button size="small" onClick={() => {
                                        setEditingFilter(getEnumActiveFilter());
                                        setFilterModalVisible(true);
                                    }}>激活配置</Button>
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
                                        pageSize: enumPageSize,
                                        showSizeChanger: true,
                                        pageSizeOptions: ['10', '20', '50', '100', '200'],
                                        onShowSizeChange: (_current: number, size: number) => setEnumPageSize(size),
                                        showTotal: (total: number) => `共 ${total} 个字段`
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
                            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-5">
                                <div className="rounded-md border border-default surface-container p-4">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <div className="text-[16px] font-bold text-1">字段配置组</div>
                                        <Button size="small" icon={<PlusOutlined />} onClick={() => setFieldGroupModal({ open: true, mode: 'create', value: '' })}>
                                            新建组
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {fieldGroups.map((group) => (
                                            <div
                                                key={group.id}
                                                className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-3 ${selectedFieldGroupId === group.id ? 'border-brand bg-brand-weak' : 'border-default hover:border-line'}`}
                                                onClick={() => setSelectedFieldGroupId(group.id)}
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-1 truncate">{group.name}</div>
                                                    <div className="text-xs text-3">字段数 {group.fields.length}</div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="link"
                                                        size="small"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setSelectedFieldGroupId(group.id);
                                                            setFieldGroupModal({ open: true, mode: 'rename', value: group.name });
                                                        }}
                                                    >
                                                        重命名
                                                    </Button>
                                                    <Button
                                                        type="link"
                                                        danger
                                                        size="small"
                                                        disabled={fieldGroups.length <= 1}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            setFieldGroups((prev) => {
                                                                const next = prev.filter((item) => item.id !== group.id);
                                                                setSelectedFieldGroupId(next[0]?.id || '');
                                                                return next;
                                                            });
                                                        }}
                                                    >
                                                        删除
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-md border border-default surface-container p-4">
                                    {selectedFieldGroup ? (
                                        <>
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <div>
                                                    <div className="text-[18px] font-bold text-1">{selectedFieldGroup.name}</div>
                                                    <Text type="secondary">管理当前字段配置组中的字段集合</Text>
                                                </div>
                                                <Tag color="default" className="m-0">字段数 {selectedFieldGroup.fields.length}</Tag>
                                                <Button size="small" icon={<FileTextOutlined />} onClick={() => openConfigFile('custom_fields.json')}>配置文件</Button>
                                            </div>

                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <AutoComplete
                                                    value={fieldSearch}
                                                    onChange={setFieldSearch}
                                                    options={candidateFields.map((field) => ({ value: field }))}
                                                    placeholder="搜索或输入字段名称"
                                                    className="flex-1 min-w-[320px]"
                                                >
                                                    <Input prefix={<SearchOutlined className="text-3" />} />
                                                </AutoComplete>
                                                <Button onClick={() => { addFieldToSelectedGroup(fieldSearch); setFieldSearch(''); }}>加入字段</Button>
                                                <Button onClick={() => setFieldCreateModal({ open: true, value: '' })} icon={<PlusOutlined />}>新建字段</Button>
                                                <Button onClick={() => setFieldBatchModal({ open: true, value: '' })}>批量导入</Button>
                                                <Button danger onClick={clearSelectedFieldGroup}>清空本组</Button>
                                            </div>

                                            {selectedFieldGroup.fields.length > 0 ? (
                                                <div className="rounded-xl border border-default overflow-hidden">
                                                    <Table
                                                        size="small"
                                                        rowKey="key"
                                                        pagination={false}
                                                        dataSource={selectedFieldRows}
                                                        columns={[
                                                            {
                                                                title: '字段名称',
                                                                dataIndex: 'name',
                                                                key: 'name',
                                                                render: (value: string) => value,
                                                            },
                                                            {
                                                                title: '操作',
                                                                key: 'action',
                                                                width: 100,
                                                                render: (_: unknown, row: FieldRow) => (
                                                                    <Button type="link" danger onClick={() => removeFieldFromSelectedGroup(row.name)}>
                                                                        删除
                                                                    </Button>
                                                                ),
                                                            },
                                                        ]}
                                                    />
                                                </div>
                                            ) : (
                                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前分组暂无字段" />
                                            )}
                                        </>
                                    ) : (
                                        <Empty description="请先选择或创建字段配置组" />
                                    )}
                                </div>
                            </div>

                            <div className="flex justify-end mt-2">
                                <Button type="primary" size="large" aria-label="保存并应用" onClick={handleSaveFields} icon={<SettingOutlined />}>
                                    保存并应用
                                </Button>
                            </div>

                        </div>
                    )
                },
                {
                    key: 'asset-tag-groups',
                    label: '标签分组配置',
                    children: (
                        <TagGroupsConfig
                            groups={tagGroups}
                            exclusiveGroups={editExclusiveGroups}
                            onGroupsChange={setTagGroups}
                            onExclusiveGroupsChange={setEditExclusiveGroups}
                            onSave={handleSaveTagGroups}
                            onAddGroup={() => {
                                const id = 'group_' + Date.now();
                                setTagGroups(prev => [...prev, { id, name: '新标签分组', tags: [] }]);
                            }}
                            openConfigFile={openConfigFile}
                            assetLibraryPath={assetLibraryPath}
                            onAfterTagPurged={() => {
                                bumpAssetTagGroupsVersion();
                                bumpAssetVersion();
                            }}
                        />
                    )
                }
            ]} />

            <Modal
                title={isCreatingNewEnum ? '新增枚举字典项' : `编辑枚举: ${editingKey}`}
                open={editModalVisible}
                onOk={handleSaveEnum}
                onCancel={() => setEditModalVisible(false)}
                okText="保存并使之生效"
                width={640}
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
                    <EnumEditPanel
                        values={editingValues}
                        onChange={setEditingValues}
                    />
                </div>
            </Modal>

            <Modal
                title="新建字段"
                open={fieldCreateModal.open}
                onOk={() => {
                    addFieldToSelectedGroup(fieldCreateModal.value)
                    setFieldCreateModal({ open: false, value: '' })
                }}
                onCancel={() => setFieldCreateModal({ open: false, value: '' })}
                okText="创建并加入"
                destroyOnClose
            >
                <Input
                    autoFocus
                    placeholder="输入新字段名称"
                    value={fieldCreateModal.value}
                    onChange={(event) => setFieldCreateModal((prev) => ({ ...prev, value: event.target.value }))}
                />
            </Modal>

            <Modal
                title="批量导入字段"
                open={fieldBatchModal.open}
                onOk={() => {
                    const fields = parseFieldBatchInput(fieldBatchModal.value)
                    fields.forEach((field) => addFieldToSelectedGroup(field))
                    setFieldBatchModal({ open: false, value: '' })
                }}
                onCancel={() => setFieldBatchModal({ open: false, value: '' })}
                okText="导入并去重"
                destroyOnClose
            >
                <Input.TextArea
                    rows={6}
                    autoFocus
                    placeholder="粘贴字段列表，支持换行、逗号、分号"
                    value={fieldBatchModal.value}
                    onChange={(event) => setFieldBatchModal((prev) => ({ ...prev, value: event.target.value }))}
                />
            </Modal>

            <Modal
                title={fieldGroupModal.mode === 'create' ? '新建字段配置组' : '重命名字段配置组'}
                open={fieldGroupModal.open}
                onOk={() => {
                    const name = fieldGroupModal.value.trim()
                    if (!name) return

                    if (fieldGroupModal.mode === 'create') {
                        const id = name
                            .toLowerCase()
                            .replace(/\s+/g, '-')
                            .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
                        const nextGroup: FieldGroupConfigItem = { id: `${id || 'group'}-${Date.now()}`, name, fields: [] }
                        setFieldGroups((prev) => [...prev, nextGroup])
                        setSelectedFieldGroupId(nextGroup.id)
                    } else if (selectedFieldGroup) {
                        setFieldGroups((prev) => prev.map((group) => group.id === selectedFieldGroup.id ? { ...group, name } : group))
                    }

                    setFieldGroupModal({ open: false, mode: 'create', value: '' })
                }}
                onCancel={() => setFieldGroupModal({ open: false, mode: 'create', value: '' })}
                okText="确认"
                destroyOnClose
            >
                <Input
                    autoFocus
                    placeholder="输入字段配置组名称"
                    value={fieldGroupModal.value}
                    onChange={(event) => setFieldGroupModal((prev) => ({ ...prev, value: event.target.value }))}
                />
            </Modal>


            {/* 激活配置弹窗 */}
            <Modal
                title="配置激活的枚举字段范围"
                open={filterModalVisible}
                onOk={async () => {
                    if (!assetLibraryPath) return;
                    try {
                        await setEnumActiveFilter(assetLibraryPath, editingFilter);
                        message.success('激活配置已保存');
                        setFilterModalVisible(false);
                        // 刷新枚举数据
                        await preloadEnumData(assetLibraryPath);
                    } catch (e) {
                        message.error('保存失败');
                        console.error(e);
                    }
                }}
                onCancel={() => setFilterModalVisible(false)}
                width={550}
                okText="保存配置"
            >
                <div className="space-y-4 mt-2">
                    <div>
                        <div className="text-sm font-medium mb-2 text-2">选择激活的所属类目（不选 = 全部激活）</div>
                        <Select
                            mode="multiple"
                            value={editingFilter.categoryPaths}
                            onChange={v => setEditingFilter(p => ({ ...p, categoryPaths: v }))}
                            style={{ width: '100%' }}
                            placeholder="选择所属类目..."
                            options={getAllCategoryPaths().map(v => ({ value: v, label: v }))}
                            allowClear
                        />
                    </div>
                    <div>
                        <div className="text-sm font-medium mb-2 text-2">选择激活的属性类别（不选 = 全部激活）</div>
                        <Select
                            mode="multiple"
                            value={editingFilter.categories}
                            onChange={v => setEditingFilter(p => ({ ...p, categories: v }))}
                            style={{ width: '100%' }}
                            placeholder="选择属性类别..."
                            options={getAllCategories().map(v => ({ value: v, label: v }))}
                            allowClear
                        />
                    </div>
                    <div className="text-xs text-3 pt-2 border-t">
                        <p>激活规则：字段需同时满足选中的"所属类目"和"属性类别"才会在数据体检匹配等模块中生效。</p>
                        <p>留空 = 全部字段都激活（默认行为）。</p>
                    </div>
                </div>
            </Modal>

            <EnumImportModal
                open={enumImportVisible}
                onClose={() => setEnumImportVisible(false)}
                assetLibraryPath={assetLibraryPath}
                onImported={async () => {
                    await preloadEnumData(assetLibraryPath || undefined);
                    message.info('枚举数据已刷新');
                }}
            />
        </Card>
    );
};

// 标签分组配置面板（双栏布局：左侧分组列表 + 右侧标签管理）

// 标签分组配置（动态 CRUD，跟核心字段配置一样）
interface TagGroupsConfigProps {
    groups: TagGroupItem[];
    exclusiveGroups: string[];
    onGroupsChange: (groups: TagGroupItem[]) => void;
    onExclusiveGroupsChange: (groups: string[]) => void;
    onSave: () => void;
    onAddGroup: () => void;
    openConfigFile: (fileName: string) => void;
    assetLibraryPath: string | null;
    onAfterTagPurged?: () => void;
}

const UNGROUPED_ID = '_ungrouped';

const TagGroupsConfig: React.FC<TagGroupsConfigProps> = ({
    groups, exclusiveGroups, onGroupsChange, onExclusiveGroupsChange,
    onSave, onAddGroup, openConfigFile, assetLibraryPath, onAfterTagPurged,
}) => {
    const [selectedId, setSelectedId] = useState<string>(groups[0]?.id || '');
    const [addInput, setAddInput] = useState('');
    const [renaming, setRenaming] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [orphanTags, setOrphanTags] = useState<string[]>([]);

    // 加载所有资产标签，找出未归入任何分组的游离标签
    useEffect(() => {
        if (!assetLibraryPath) { setOrphanTags([]); return; }
        import('../../utils/assetManager').then(({ loadAssetTags }) => {
            loadAssetTags(assetLibraryPath).then(tagsMap => {
                const allAssetTags = Array.from(new Set(Object.values(tagsMap).flat()));
                const grouped = new Set(groups.flatMap(g => g.tags));
                setOrphanTags(allAssetTags.filter(t => !grouped.has(t)));
            }).catch(() => {});
        });
    }, [assetLibraryPath, groups]);

    useEffect(() => {
        if (groups.length > 0 && !groups.find(g => g.id === selectedId) && selectedId !== UNGROUPED_ID) {
            setSelectedId(groups[0].id);
        }
    }, [groups]);

    const selected = selectedId === UNGROUPED_ID
        ? { id: UNGROUPED_ID, name: '未分组', tags: orphanTags }
        : groups.find(g => g.id === selectedId);

    const updateGroup = (id: string, updater: (g: TagGroupItem) => TagGroupItem) => {
        onGroupsChange(groups.map(g => g.id === id ? updater(g) : g));
    };

    const handleAddTag = () => {
        const t = addInput.trim();
        if (!t || !selected || selected.id === UNGROUPED_ID) return;
        updateGroup(selected.id, g => ({ ...g, tags: normalizeTagList([...g.tags, t]) }));
        setAddInput('');
    };

    const applyGroupsWithoutTag = (tag: string) => {
        onGroupsChange(groups.map(g => ({ ...g, tags: g.tags.filter(t => t !== tag) })));
    };

    const confirmPurgeTag = (tag: string) => {
        if (!assetLibraryPath) {
            message.warning('请先设置资产库大目录');
            return;
        }
        Modal.confirm({
            title: '彻底删除标签',
            content: (
                <span>
                    将从<strong>所有分组词典</strong>及<strong>已绑定该标签的资产</strong>中移除「{tag}」，此操作不可恢复。
                </span>
            ),
            okText: '彻底删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    const assetsUpdated = await purgeTagFromLibrary(assetLibraryPath, tag);
                    applyGroupsWithoutTag(tag);
                    setOrphanTags(prev => prev.filter(t => t !== tag));
                    onAfterTagPurged?.();
                    message.success(
                        assetsUpdated > 0
                            ? `已删除「${tag}」，并从 ${assetsUpdated} 个资产中移除`
                            : `已从分组词典中删除「${tag}」`,
                    );
                } catch (e) {
                    console.error(e);
                    message.error('删除标签失败');
                }
            },
        });
    };

    const handleRemoveGroup = (id: string) => {
        if (id === UNGROUPED_ID) return;
        const next = groups.filter(g => g.id !== id);
        onGroupsChange(next);
        if (selectedId === id) setSelectedId(next[0]?.id || '');
    };

    // 候选标签：当选择「未分组」时显示所有分组标签供添加；选择普通分组时显示游离标签
    const candidateTags = selected?.id === UNGROUPED_ID
        ? groups.flatMap(g => g.tags).slice(0, 30)  // 未分组：展示所有已分组标签
        : orphanTags.slice(0, 30);                   // 普通分组：展示游离标签

    return (
        <div className="p-4 flex flex-col gap-6">
            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-5">
                <div className="rounded-md border border-default surface-container p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div className="text-[16px] font-bold text-1">标签分组</div>
                        <Button size="small" icon={<PlusOutlined />} onClick={onAddGroup}>新建分组</Button>
                    </div>
                    <div className="space-y-2">
                        {groups.map(g => (
                            <div key={g.id}
                                className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-2 ${
                                    selectedId === g.id ? 'border-brand bg-brand-weak' : 'border-default hover:border-line'
                                }`}
                                onClick={() => setSelectedId(g.id)}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-1 truncate">{g.name}</div>
                                    <div className="text-xs text-3">标签数 {normalizeTagList(g.tags).length}</div>
                                </div>
                                <Button type="text" size="small" icon={<DeleteOutlined />} danger
                                    onClick={e => { e.stopPropagation(); handleRemoveGroup(g.id); }}
                                />
                            </div>
                        ))}
                        {orphanTags.length > 0 && (
                            <div key={UNGROUPED_ID}
                                className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-2 ${
                                    selectedId === UNGROUPED_ID ? 'border-brand bg-brand-weak' : 'border-dashed border-strong hover:border-line-strong'
                                }`}
                                onClick={() => setSelectedId(UNGROUPED_ID)}
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-1 truncate">未分组</div>
                                    <div className="text-xs text-3">{orphanTags.length} 个游离标签</div>
                                </div>
                            </div>
                        )}
                        {groups.length === 0 && orphanTags.length === 0 && (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分组，请新建" />
                        )}
                    </div>
                </div>

                                <div className="rounded-md border border-default surface-container p-4">
                    {selected ? (
                        selected.id === UNGROUPED_ID ? (
                            <>
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        <div className="text-[18px] font-bold text-1">未分组</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Tag color="warning">游离标签 {orphanTags.length}</Tag>
                                        <Button size="small" onClick={() => {
                                            // 一键归入默认分组
                                            if (orphanTags.length === 0) return;
                                            const g = groups.find(gr => gr.id === DEFAULT_GROUP_ID || gr.name === '其他标签' || gr.name === '其他');
                                            if (g) {
                                                updateGroup(g.id, gr => ({
                                                    ...gr,
                                                    tags: normalizeTagList([...gr.tags, ...orphanTags]),
                                                }));
                                                setOrphanTags([]);
                                            }
                                            message.success('已归入默认分组');
                                        }} disabled={orphanTags.length === 0}>一键归入</Button>
                                        <Button size="small" icon={<FileTextOutlined />} onClick={() => openConfigFile('custom_asset_tag_groups.json')}>配置文件</Button>
                                    </div>
                                </div>
                                {orphanTags.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 max-h-80 overflow-y-auto">
                                        {orphanTags.map(tag => (
                                            <div key={tag} className="flex items-center gap-2 mb-1 w-full">
                                                <Tag className="text-xs flex-1">{tag}</Tag>
                                                <Select
                                                    size="small"
                                                    style={{ width: 140 }}
                                                    placeholder="归入分组..."
                                                    onChange={groupId => {
                                                        updateGroup(groupId, gr => ({
                                                            ...gr,
                                                            tags: normalizeTagList([...gr.tags, tag]),
                                                        }));
                                                        setOrphanTags(prev => prev.filter(t => t !== tag));
                                                    }}
                                                    options={groups.map(g => ({ value: g.id, label: g.name }))}
                                                />
                                                <Button
                                                    type="text"
                                                    size="small"
                                                    danger
                                                    icon={<DeleteOutlined />}
                                                    title="彻底删除"
                                                    onClick={() => confirmPurgeTag(tag)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所有标签已归组" />
                                )}
                            </>
                        ) : (
                            <>
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-2">
                                        {renaming === selected.id ? (
                                            <Input size="small" value={renameValue}
                                                onChange={e => setRenameValue(e.target.value)}
                                                onPressEnter={() => {
                                                    if (renameValue.trim()) updateGroup(selected.id, g => ({ ...g, name: renameValue.trim() }));
                                                    setRenaming(null);
                                                }}
                                                style={{ width: 200 }}
                                                onBlur={() => setRenaming(null)}
                                                autoFocus
                                            />
                                        ) : (
                                            <div className="text-[18px] font-bold text-1">{selected.name}</div>
                                        )}
                                        <Button type="text" size="small" icon={<EditOutlined />}
                                            onClick={() => { setRenaming(selected.id); setRenameValue(selected.name); }}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-3">互斥</span>
                                        <Switch size="small" checked={exclusiveGroups.includes(selected.id)}
                                            onChange={checked => {
                                                if (checked) onExclusiveGroupsChange([...exclusiveGroups, selected.id]);
                                                else onExclusiveGroupsChange(exclusiveGroups.filter(g => g !== selected.id));
                                            }}
                                        />
                                        <Tag color="default">标签数 {normalizeTagList(selected.tags).length}</Tag>
                                        <Button size="small" icon={<FileTextOutlined />} onClick={() => openConfigFile('custom_asset_tag_groups.json')}>配置文件</Button>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    <Input
                                        value={addInput}
                                        onChange={e => setAddInput(e.target.value)}
                                        onPressEnter={handleAddTag}
                                        placeholder="输入标签名称，回车添加"
                                        style={{ flex: 1, minWidth: 200 }}
                                    />
                                    <Button type="primary" onClick={handleAddTag} disabled={!addInput.trim()}>添加</Button>
                                </div>
                                {addInput && candidateTags.filter(t => t.includes(addInput)).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {candidateTags.filter(t => t.includes(addInput)).slice(0, 8).map(t => (
                                            <Tag key={t} className="text-xs" onClick={() => { setAddInput(t); }}>{t}</Tag>
                                        ))}
                                    </div>
                                )}

                                {selected.tags.length > 0 ? (
                                    <div className="flex flex-wrap gap-2 mb-3 max-h-80 overflow-y-auto">
                                        {selected.tags.map(tag => (
                                            <Tag
                                                key={tag}
                                                closable
                                                className="text-xs"
                                                onClose={(e) => {
                                                    e.preventDefault();
                                                    confirmPurgeTag(tag);
                                                }}
                                            >
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前分组暂无标签" />
                                )}

                                {candidateTags.length > 0 && (
                                    <div className="border-t border-default pt-3 mt-2">
                                        <Text type="secondary" className="text-xs mb-2 block">
                                            {selected?.id === UNGROUPED_ID ? '从已分组标签添加' : '从游离标签添加'}
                                        </Text>
                                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                                            {candidateTags.map(tag => (
                                                <Tag key={tag} className="text-xs"
                                                    onClick={() => updateGroup(selected.id, g => ({ ...g, tags: normalizeTagList([...g.tags, tag]) }))}
                                                >+ {tag}</Tag>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )
                    ) : (
                        <Empty description="请先选择或创建标签分组" />
                    )}
                </div>
            </div>

            <div className="flex justify-end mt-2">
                <Button type="primary" size="large" onClick={onSave} icon={<SettingOutlined />}>保存并应用</Button>
            </div>
        </div>
    );
};
// 展开行组件（独立组件避免 hook 数量不一致）
const EnumExpandedRow: React.FC<{ record: EnumItem }> = ({ record }) => {
    const [valSearch, setValSearch] = useState('');
    const filtered = valSearch.trim()
        ? record.values.filter(v => v.toLowerCase().includes(valSearch.toLowerCase()))
        : record.values;
    return (
        <div className="p-3 bg-surface-3 rounded">
            <div className="flex items-center gap-2 mb-2">
                <Typography.Text type="secondary">全部枚举值 ({record.count} 个):</Typography.Text>
                <Input
                    size="small"
                    placeholder="搜索枚举值..."
                    prefix={<SearchOutlined />}
                    value={valSearch}
                    onChange={e => setValSearch(e.target.value)}
                    style={{ width: 200 }}
                />
            </div>
            <div className="flex flex-wrap gap-1 max-h-60 overflow-y-auto">
                {filtered.map((v, i) => (
                    <Tag
                        key={i}
                        color="blue"
                        className="hover:opacity-80 text-xs"
                        onClick={() => navigator.clipboard.writeText(v)}
                        title="点击复制"
                    >
                        {v}
                    </Tag>
                ))}
                {filtered.length === 0 && <span className="text-xs text-3">无匹配</span>}
            </div>
        </div>
    );
};

// 枚举值编辑面板：搜索 + 标签式管理，替代原来的 Input 编辑大文本
const EnumEditPanel: React.FC<{ values: string[]; onChange: (v: string[]) => void }> = ({ values, onChange }) => {
    const [search, setSearch] = React.useState('');
    const [newVal, setNewVal] = React.useState('');
    const filtered = search.trim()
        ? values.filter(v => v.toLowerCase().includes(search.toLowerCase()))
        : values;

    const handleAdd = () => {
        const trimmed = newVal.trim();
        if (!trimmed) return;
        if (!values.includes(trimmed)) {
            onChange([...values, trimmed]);
        }
        setNewVal('');
    };

    const handleRemove = (val: string) => {
        onChange(values.filter(v => v !== val));
    };

    const handlePasteBatch = (text: string) => {
        const items = text.split(/[\n,，；;、]+/).map(s => s.trim()).filter(Boolean);
        const merged = [...new Set([...values, ...items])];
        onChange(merged);
        setNewVal('');
    };

    return (
        <div>
            <Text strong className="mb-1 block">允许的枚举值集合</Text>
            <Text type="secondary" className="mb-2 block text-xs">代表这些选项是合规库内的绝对权威标准。</Text>

            <div className="flex items-center gap-2 mb-3">
                <Input
                    size="small"
                    placeholder="搜索已有枚举值..."
                    prefix={<SearchOutlined />}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: 220 }}
                    allowClear
                />
                <span className="text-xs text-3">{values.length} 个</span>
            </div>

            <div className="flex items-center gap-2 mb-3">
                <Input
                    size="small"
                    placeholder="新增枚举值，回车添加"
                    value={newVal}
                    onChange={e => setNewVal(e.target.value)}
                    onPressEnter={handleAdd}
                    style={{ flex: 1 }}
                />
                <Button size="small" type="primary" onClick={handleAdd} disabled={!newVal.trim()}>添加</Button>
                <Button size="small" onClick={() => {
                    const batch = prompt('批量粘贴枚举值，用逗号、分号或换行分隔:');
                    if (batch) handlePasteBatch(batch);
                }}>批量粘贴</Button>
            </div>

            <div className="flex flex-wrap gap-1.5 max-h-80 overflow-y-auto p-3 border rounded-lg bg-surface-3 min-h-[80px]">
                {filtered.map(v => (
                    <Tag
                        key={v}
                        closable
                        onClose={() => handleRemove(v)}
                        className="text-xs max-w-[200px] overflow-hidden text-ellipsis cursor-default"
                    >
                        {v}
                    </Tag>
                ))}
                {filtered.length === 0 && (
                    <span className="text-xs text-3 w-full text-center py-4">
                        {search.trim() ? '无匹配的枚举值' : '暂无枚举值，请在上方添加'}
                    </span>
                )}
            </div>
        </div>
    );
};

export default ConfigManagerView;
