import React, { useMemo, useState } from 'react';
import { Table, Button, Modal, Input, Select, message, Empty } from 'antd';
import { PlusOutlined, SaveOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '../common/RowActions';

import {
    DEFAULT_FILE_NAME_PATTERN,
    DEFAULT_SHEET_NAME,
    type ExportFormat,
    type FieldGroupConfigItem,
} from '../../utils/fieldLists';
import { createId, renderFileName } from '../../utils/fieldMapping';

/**
 * 「字段与词表 · 导出格式」。
 *
 * 一个格式 = 名字 + 指向哪个字段组 + sheet 名 + 文件名模板。
 * **格式不存字段**：字段永远来自核心字段配置里的字段组，避免两处维护后不一致。
 */
interface ExportFormatTabProps {
    formats: ExportFormat[];
    groups: FieldGroupConfigItem[];
    onChange: (formats: ExportFormat[]) => void;
    /** 落盘（字段组与格式同文件，避免两处各写各的） */
    onSave: (formats: ExportFormat[]) => Promise<void>;
}

const EMPTY_DRAFT: Omit<ExportFormat, 'id'> = {
    name: '',
    fieldGroupId: '',
    sheetName: DEFAULT_SHEET_NAME,
    fileNamePattern: DEFAULT_FILE_NAME_PATTERN,
};

const ExportFormatTab: React.FC<ExportFormatTabProps> = ({
    formats, groups, onChange, onSave,
}) => {
    const [draft, setDraft] = useState<{ open: boolean; id?: string; value: typeof EMPTY_DRAFT }>({
        open: false,
        value: EMPTY_DRAFT,
    });

    const rows = useMemo(
        () => formats.map(f => ({ ...f, fieldCount: groups.find(g => g.id === f.fieldGroupId)?.fields.length ?? 0 })),
        [formats, groups],
    );

    const openEdit = (format?: ExportFormat) => {
        setDraft({
            open: true,
            id: format?.id,
            value: format
                ? { name: format.name, fieldGroupId: format.fieldGroupId, sheetName: format.sheetName, fileNamePattern: format.fileNamePattern }
                : { ...EMPTY_DRAFT, fieldGroupId: groups[0]?.id ?? '' },
        });
    };

    const commit = async (next: ExportFormat[], successText: string) => {
        onChange(next);
        try {
            // 立即落盘：格式只在配置页用，没有「忘点保存」的第二次机会
            await onSave(next);
            message.success(successText);
        } catch (err) {
            console.error(err);
            message.error('保存导出格式失败');
        }
    };

    const confirmDraft = () => {
        const value = draft.value;
        if (!value.name.trim()) { message.warning('请填写格式名称'); return; }
        if (!value.fieldGroupId) { message.warning('请选择字段组'); return; }
        const next: ExportFormat = {
            id: draft.id ?? createId('fmt'),
            name: value.name.trim(),
            fieldGroupId: value.fieldGroupId,
            sheetName: value.sheetName.trim() || DEFAULT_SHEET_NAME,
            fileNamePattern: value.fileNamePattern.trim() || DEFAULT_FILE_NAME_PATTERN,
        };
        const nextFormats = draft.id
            ? formats.map(f => (f.id === draft.id ? next : f))
            : [...formats, next];
        void commit(nextFormats, draft.id ? '导出格式已更新' : '导出格式已创建');
        setDraft({ open: false, value: EMPTY_DRAFT });
    };

    const columns: ColumnsType<(typeof rows)[number]> = [
        {
            title: '格式名称',
            dataIndex: 'name',
            key: 'name',
            ellipsis: true,
            render: (name: string) => <span className="text-1">{name}</span>,
        },
        {
            title: '字段组',
            key: 'group',
            width: 220,
            ellipsis: true,
            render: (_: unknown, row) => {
                const group = groups.find(g => g.id === row.fieldGroupId);
                return group
                    ? <span>{group.name}<span className="text-aux text-3 ml-1 tabular-nums">{row.fieldCount} 项</span></span>
                    : <span className="text-danger">字段组已删除</span>;
            },
        },
        {
            title: 'Sheet 名',
            dataIndex: 'sheetName',
            key: 'sheetName',
            width: 180,
            ellipsis: true,
        },
        {
            title: '文件名',
            dataIndex: 'fileNamePattern',
            key: 'fileNamePattern',
            ellipsis: true,
            render: (pattern: string) => (
                <span className="text-aux">
                    {renderFileName(
                        { id: '', name: '示例', fieldGroupId: '', sheetName: '', fileNamePattern: pattern },
                        { vehicle: 'V8E', date: '20261019' },
                    )}
                </span>
            ),
        },
        {
            title: '操作',
            key: 'action',
            width: 90,
            render: (_: unknown, row) => (
                <RowActions
                    actions={[
                        { key: 'edit', label: '编辑格式', icon: <EditOutlined />, onClick: () => openEdit(row) },
                        {
                            key: 'delete',
                            label: '删除格式',
                            icon: <DeleteOutlined />,
                            danger: true,
                            confirm: `确定删除「${row.name}」？字段组本身不会删除。`,
                            onClick: () => void commit(formats.filter(f => f.id !== row.id), '导出格式已删除'),
                        },
                    ]}
                />
            ),
        },
    ];

    return (
        <div className="p-4">
            <div className="mb-4 flex items-center gap-2 flex-wrap">
                <Button icon={<PlusOutlined />} onClick={() => openEdit()}>新建格式</Button>
                <span className="text-aux text-3">
                    格式只决定「怎么出文件」，字段来自核心字段配置的字段组
                </span>
                <span className="ml-auto" />
                <Button
                    icon={<SaveOutlined />}
                    onClick={() => void commit(formats, '导出格式已保存')}
                >
                    保存格式
                </Button>
            </div>

            {rows.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有导出格式" />
            ) : (
                <Table
                    size="small"
                    rowKey="id"
                    columns={columns}
                    dataSource={rows}
                    pagination={false}
                />
            )}

            <Modal
                title={draft.id ? '编辑导出格式' : '新建导出格式'}
                open={draft.open}
                onCancel={() => setDraft({ open: false, value: EMPTY_DRAFT })}
                onOk={confirmDraft}
                okText="确定"
                destroyOnHidden
                width={560}
            >
                <div className="flex flex-col gap-3 mt-4">
                    <div className="flex items-center gap-2">
                        <span className="text-3" style={{ width: 76 }}>格式名称</span>
                        <Input
                            value={draft.value.name}
                            placeholder="如：货运类模板"
                            onChange={e => setDraft(prev => ({ ...prev, value: { ...prev.value, name: e.target.value } }))}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-3" style={{ width: 76 }}>字段组</span>
                        <Select
                            style={{ flex: 1 }}
                            value={draft.value.fieldGroupId || undefined}
                            placeholder="选择核心字段配置里的字段组"
                            options={groups.map(g => ({ value: g.id, label: `${g.name}（${g.fields.length} 项）` }))}
                            onChange={value => setDraft(prev => ({ ...prev, value: { ...prev.value, fieldGroupId: value } }))}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-3" style={{ width: 76 }}>Sheet 名</span>
                        <Input
                            value={draft.value.sheetName}
                            onChange={e => setDraft(prev => ({ ...prev, value: { ...prev.value, sheetName: e.target.value } }))}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-3" style={{ width: 76 }}>文件名</span>
                        <Input
                            value={draft.value.fileNamePattern}
                            onChange={e => setDraft(prev => ({ ...prev, value: { ...prev.value, fileNamePattern: e.target.value } }))}
                        />
                    </div>
                    <div className="text-aux text-3 pl-[84px]">
                        可用占位符：&#123;车型&#125; &#123;日期&#125; &#123;格式&#125;
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default ExportFormatTab;
