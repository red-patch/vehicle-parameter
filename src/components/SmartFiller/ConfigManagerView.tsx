import React, { useState, useMemo, useEffect } from 'react';
import { Table, Input, Tag, Card, Spin, Empty, Typography, Tabs, Button, message, Popconfirm, Modal, Space, AutoComplete, Select } from 'antd';
import { SearchOutlined, SettingOutlined, DownloadOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { preloadEnumData, getAllAttributeNames, getEnumValuesSync, isEnumDataLoaded } from '../../utils/attributeEnums';
import { getFieldGroupsSync, reloadCustomFields, type FieldGroupConfigItem } from '../../utils/fieldLists';
import { assignTagToGroup, getAssetTagGroupsSync, reloadCustomAssetTagGroups, saveCustomAssetTagGroups, type AssetTagGroupKey } from '../../utils/assetTagGroups';
import { useVehicleStore } from '../../store/vehicleStore';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { parseFieldBatchInput } from './coreFieldRules';
import { loadAssetTags } from '../../utils/assetManager';

const { Text } = Typography;

interface EnumItem {
    key: string;
    name: string;
    values: string[];
    count: number;
}

interface TagGroupRow {
    key: string;
    tag: string;
    group: AssetTagGroupKey;
    source: 'asset' | 'manual';
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

    const [fieldGroups, setFieldGroups] = useState<FieldGroupConfigItem[]>(getFieldGroupsSync());
    const [selectedFieldGroupId, setSelectedFieldGroupId] = useState<string>(getFieldGroupsSync()[0]?.id || 'system-required');
    const [editManualTags, setEditManualTags] = useState<string[]>(getAssetTagGroupsSync().manualTags);
    const [editOtherTags, setEditOtherTags] = useState<string[]>(getAssetTagGroupsSync().otherTags);
    const [editVehicleFamilyTags, setEditVehicleFamilyTags] = useState<string[]>(getAssetTagGroupsSync().vehicleFamilyTags);
    const [editManufacturerTags, setEditManufacturerTags] = useState<string[]>(getAssetTagGroupsSync().manufacturerTags);
    const [availableAssetTags, setAvailableAssetTags] = useState<string[]>([]);
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
    const [tagSearch, setTagSearch] = useState('');
    const [tagCreateModal, setTagCreateModal] = useState<{ open: boolean; value: string; group: AssetTagGroupKey }>({
        open: false,
        value: '',
        group: 'other',
    });

    const { assetLibraryPath, bumpAssetTagGroupsVersion, bumpFieldGroupsVersion } = useVehicleStore();

    useEffect(() => {
        if (!isEnumDataLoaded()) {
            setLoading(true);
            preloadEnumData(assetLibraryPath || undefined).then(() => {
                setLoading(false);
                const nextFieldGroups = getFieldGroupsSync();
                setFieldGroups(nextFieldGroups);
                setSelectedFieldGroupId(nextFieldGroups[0]?.id || 'system-required');
                const nextTagGroups = getAssetTagGroupsSync();
                setEditManualTags(nextTagGroups.manualTags);
                setEditOtherTags(nextTagGroups.otherTags);
                setEditVehicleFamilyTags(nextTagGroups.vehicleFamilyTags);
                setEditManufacturerTags(nextTagGroups.manufacturerTags);
            });
        } else {
            setLoading(false);
            const nextFieldGroups = getFieldGroupsSync();
            setFieldGroups(nextFieldGroups);
            setSelectedFieldGroupId(nextFieldGroups[0]?.id || 'system-required');
            const tagGroups = getAssetTagGroupsSync();
            setEditManualTags(tagGroups.manualTags);
            setEditOtherTags(tagGroups.otherTags);
            setEditVehicleFamilyTags(tagGroups.vehicleFamilyTags);
            setEditManufacturerTags(tagGroups.manufacturerTags);
        }
    }, [assetLibraryPath]);

    useEffect(() => {
        if (!assetLibraryPath) {
            setAvailableAssetTags([]);
            return;
        }

        loadAssetTags(assetLibraryPath).then((tagsMap) => {
            const next = new Set<string>();
            Object.values(tagsMap).forEach((tags) => tags.forEach((tag) => next.add(tag)));
            setAvailableAssetTags(Array.from(next).sort((left, right) => left.localeCompare(right, 'zh-CN')));
        });
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
                groups: getFieldGroupsSync(),
            };
            const fieldPath = await join(assetLibraryPath, 'custom_fields.json');
            await writeTextFile(fieldPath, JSON.stringify(fieldDict, null, 2));

            const assetTagGroupPath = await join(assetLibraryPath, 'custom_asset_tag_groups.json');
            await writeTextFile(assetTagGroupPath, JSON.stringify(getAssetTagGroupsSync(), null, 2));

            message.success('导出成功！已在您的资产库生成 custom_enums.json、custom_fields.json 及 custom_asset_tag_groups.json');
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

    const assignTagGroup = (tag: string, group: AssetTagGroupKey) => {
        const normalized = assignTagToGroup({
            manualTags: editManualTags,
            otherTags: editOtherTags,
            vehicleFamilyTags: editVehicleFamilyTags,
            manufacturerTags: editManufacturerTags,
        }, tag, group);

        setEditManualTags(normalized.manualTags);
        setEditOtherTags(normalized.otherTags);
        setEditVehicleFamilyTags(normalized.vehicleFamilyTags);
        setEditManufacturerTags(normalized.manufacturerTags);
    };

    const handleSaveTagGroups = async () => {
        if (!assetLibraryPath) {
            message.warning('请先设置资产库大目录');
            return;
        }
        try {
            await saveCustomAssetTagGroups(assetLibraryPath, {
                manualTags: editManualTags,
                otherTags: editOtherTags,
                vehicleFamilyTags: editVehicleFamilyTags,
                manufacturerTags: editManufacturerTags,
            });
            await reloadCustomAssetTagGroups(assetLibraryPath);
            bumpAssetTagGroupsVersion();
            message.success('标签分组规则更新成功！已持久化并立即生效。');
        } catch (e) {
            console.error(e);
            message.error('标签分组规则保存失败');
        }
    };

    const allTagRows = useMemo<TagGroupRow[]>(() => {
        const assetTagSet = new Set(availableAssetTags);
        const tags = Array.from(new Set([
            ...availableAssetTags,
            ...editManualTags,
        ]))
            .filter((tag) => tag.trim())
            .sort((left, right) => left.localeCompare(right, 'zh-CN'));

        return tags
            .filter((tag) => !tagSearch.trim() || tag.toLowerCase().includes(tagSearch.trim().toLowerCase()))
            .map((tag) => ({
                key: tag,
                tag,
                group: editVehicleFamilyTags.includes(tag)
                    ? 'vehicleFamily'
                    : editManufacturerTags.includes(tag)
                        ? 'manufacturer'
                        : 'other',
                source: assetTagSet.has(tag) ? 'asset' : 'manual',
            }));
    }, [availableAssetTags, editManualTags, editOtherTags, editVehicleFamilyTags, editManufacturerTags, tagSearch]);

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
                            <div className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-5">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3 mb-3">
                                        <div className="text-[16px] font-bold text-slate-900">字段配置组</div>
                                        <Button size="small" icon={<PlusOutlined />} onClick={() => setFieldGroupModal({ open: true, mode: 'create', value: '' })}>
                                            新建组
                                        </Button>
                                    </div>

                                    <div className="space-y-2">
                                        {fieldGroups.map((group) => (
                                            <div
                                                key={group.id}
                                                className={`cursor-pointer rounded-xl px-3 py-2 border flex items-center justify-between gap-3 ${selectedFieldGroupId === group.id ? 'border-blue-300 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                                                onClick={() => setSelectedFieldGroupId(group.id)}
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-semibold text-slate-800 truncate">{group.name}</div>
                                                    <div className="text-xs text-slate-400">字段数 {group.fields.length}</div>
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

                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    {selectedFieldGroup ? (
                                        <>
                                            <div className="flex items-center justify-between gap-3 mb-3">
                                                <div>
                                                    <div className="text-[18px] font-bold text-slate-900">{selectedFieldGroup.name}</div>
                                                    <Text type="secondary">管理当前字段配置组中的字段集合</Text>
                                                </div>
                                                <Tag color="blue" className="m-0">字段数 {selectedFieldGroup.fields.length}</Tag>
                                            </div>

                                            <div className="flex flex-wrap gap-2 mb-3">
                                                <AutoComplete
                                                    value={fieldSearch}
                                                    onChange={setFieldSearch}
                                                    options={candidateFields.map((field) => ({ value: field }))}
                                                    placeholder="搜索或输入字段名称"
                                                    className="flex-1 min-w-[320px]"
                                                >
                                                    <Input prefix={<SearchOutlined className="text-gray-400" />} />
                                                </AutoComplete>
                                                <Button onClick={() => { addFieldToSelectedGroup(fieldSearch); setFieldSearch(''); }}>加入字段</Button>
                                                <Button onClick={() => setFieldCreateModal({ open: true, value: '' })} icon={<PlusOutlined />}>新建字段</Button>
                                                <Button onClick={() => setFieldBatchModal({ open: true, value: '' })}>批量导入</Button>
                                                <Button danger onClick={clearSelectedFieldGroup}>清空本组</Button>
                                            </div>

                                            {selectedFieldGroup.fields.length > 0 ? (
                                                <div className="rounded-xl border border-slate-100 overflow-hidden">
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
                        <div className="p-4 flex flex-col gap-6">
                            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex flex-wrap items-center gap-2 justify-between mb-3">
                                    <div>
                                        <div className="text-[16px] font-bold text-slate-900">全部标签池</div>
                                        <Text type="secondary">默认归入“其他标签”。仅当你手动指定时，才会进入“车型族群”或“厂商”。</Text>
                                    </div>
                                    <Space>
                                        <Input
                                            value={tagSearch}
                                            onChange={(event) => setTagSearch(event.target.value)}
                                            placeholder="搜索已有标签"
                                            prefix={<SearchOutlined className="text-gray-400" />}
                                            className="w-72"
                                        />
                                        <Button icon={<PlusOutlined />} onClick={() => setTagCreateModal({ open: true, value: '', group: 'other' })}>
                                            新建标签
                                        </Button>
                                    </Space>
                                </div>

                                <Table
                                    size="small"
                                    rowKey="key"
                                    pagination={{ pageSize: 12, showSizeChanger: false }}
                                    dataSource={allTagRows}
                                    columns={[
                                        {
                                            title: '标签',
                                            dataIndex: 'tag',
                                            key: 'tag',
                                        },
                                        {
                                            title: '当前分组',
                                            dataIndex: 'group',
                                            key: 'group',
                                            width: 140,
                                            render: (group: AssetTagGroupKey) => (
                                                <Tag color={group === 'vehicleFamily' ? 'blue' : group === 'manufacturer' ? 'green' : 'default'}>
                                                    {group === 'vehicleFamily' ? '车型族群' : group === 'manufacturer' ? '厂商' : '其他'}
                                                </Tag>
                                            ),
                                        },
                                        {
                                            title: '来源',
                                            dataIndex: 'source',
                                            key: 'source',
                                            width: 120,
                                            render: (source: 'asset' | 'manual') => (
                                                <Tag color={source === 'asset' ? 'blue' : 'purple'}>
                                                    {source === 'asset' ? '资产在用' : '手动新建'}
                                                </Tag>
                                            ),
                                        },
                                        {
                                            title: '归类动作',
                                            key: 'actions',
                                            width: 260,
                                            render: (_: unknown, row: TagGroupRow) => (
                                                <Space wrap>
                                                    <Button size="small" type={row.group === 'other' ? 'primary' : 'default'} onClick={() => assignTagGroup(row.tag, 'other')}>其他</Button>
                                                    <Button size="small" type={row.group === 'vehicleFamily' ? 'primary' : 'default'} onClick={() => assignTagGroup(row.tag, 'vehicleFamily')}>车型族群</Button>
                                                    <Button size="small" type={row.group === 'manufacturer' ? 'primary' : 'default'} onClick={() => assignTagGroup(row.tag, 'manufacturer')}>厂商</Button>
                                                </Space>
                                            ),
                                        },
                                    ]}
                                />
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="text-sm font-bold text-slate-800">其他标签</div>
                                        <Tag className="m-0">{editOtherTags.length}</Tag>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {editOtherTags.length > 0 ? editOtherTags.map((tag) => <Tag key={tag} className="m-0">{tag}</Tag>) : <Text type="secondary">暂无标签</Text>}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="text-sm font-bold text-slate-800">车型族群</div>
                                        <Tag color="blue" className="m-0">{editVehicleFamilyTags.length}</Tag>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {editVehicleFamilyTags.length > 0 ? editVehicleFamilyTags.map((tag) => <Tag color="blue" key={tag} className="m-0">{tag}</Tag>) : <Text type="secondary">暂无标签</Text>}
                                    </div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="text-sm font-bold text-slate-800">厂商</div>
                                        <Tag color="green" className="m-0">{editManufacturerTags.length}</Tag>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {editManufacturerTags.length > 0 ? editManufacturerTags.map((tag) => <Tag color="green" key={tag} className="m-0">{tag}</Tag>) : <Text type="secondary">暂无标签</Text>}
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end mt-2">
                                <Button type="primary" size="large" onClick={handleSaveTagGroups} icon={<SettingOutlined />}>
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

            <Modal
                title="新建标签"
                open={tagCreateModal.open}
                onOk={() => {
                    assignTagGroup(tagCreateModal.value, tagCreateModal.group)
                    setTagCreateModal({ open: false, value: '', group: 'other' })
                }}
                onCancel={() => setTagCreateModal({ open: false, value: '', group: 'other' })}
                okText="创建并归组"
                destroyOnClose
            >
                <div className="flex flex-col gap-4">
                    <Input
                        autoFocus
                        placeholder="输入新标签名称"
                        value={tagCreateModal.value}
                        onChange={(event) => setTagCreateModal((prev) => ({ ...prev, value: event.target.value }))}
                    />
                    <Select
                        value={tagCreateModal.group}
                        onChange={(value) => setTagCreateModal((prev) => ({ ...prev, group: value }))}
                        options={[
                            { value: 'other', label: '其他' },
                            { value: 'vehicleFamily', label: '车型族群' },
                            { value: 'manufacturer', label: '厂商' },
                        ]}
                    />
                </div>
            </Modal>
        </Card>
    );
};

export default ConfigManagerView;
