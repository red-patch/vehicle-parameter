import React, { useMemo, useState } from 'react';
import { Modal, Button, message, Radio, Table, Tag, Segmented } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { compactPagination, MODAL_TABLE_SCROLL_Y } from '../common/tablePresets';
import { diffFields, extractTemplateFields, type TemplateDiff } from './coreFieldImport';
import type { FieldGroupConfigItem } from '../../utils/fieldLists';

/**
 * 字段组「从模板 Excel 更新」。
 *
 * 为什么必须先进预览：公司模板一换就是几百个字段，直接覆盖不可撤销。
 * 预览里明确列出 新增 / 移除 / 保留，并让用户选「覆盖」还是「合并」。
 */
interface FieldGroupImportModalProps {
    open: boolean;
    group: FieldGroupConfigItem;
    onCancel: () => void;
    /** 应用字段清单；父级负责落盘 */
    onApply: (fields: string[], mode: 'replace' | 'merge') => Promise<void>;
}

type Mode = 'replace' | 'merge';

type PreviewRow = { key: string; field: string; kind: 'added' | 'removed' | 'kept' };

interface ImportState {
    fileName: string;
    fields: string[];
    duplicates: string[];
    headerSkipped: boolean;
}

const FieldGroupImportModal: React.FC<FieldGroupImportModalProps> = ({
    open, group, onCancel, onApply,
}) => {
    const [state, setState] = useState<ImportState | null>(null);
    const [mode, setMode] = useState<Mode>('replace');
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [previewFilter, setPreviewFilter] = useState<'all' | 'added' | 'removed' | 'kept'>('all');

    const pickFile = async () => {
        try {
            const { open: dialogOpen } = await import('@tauri-apps/plugin-dialog');
            const selected = await dialogOpen({
                multiple: false,
                filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
                title: '选择车上云模板 Excel',
            });
            if (!selected || typeof selected !== 'string') return;

            setLoading(true);
            const { readFirstSheetRowsFromPathAsync } = await import('../../utils/excelParserAsync');
            const { rows } = await readFirstSheetRowsFromPathAsync(selected);
            const result = extractTemplateFields(rows);
            if (result.fields.length === 0) {
                message.warning('未从第一列读到字段名');
                return;
            }
            setState({
                fileName: selected.split(/[\\/]/).pop() ?? selected,
                fields: result.fields,
                duplicates: result.duplicates,
                headerSkipped: result.headerSkipped,
            });
        } catch (err) {
            console.error(err);
            message.error(`读取文件失败：${(err as Error).message}`);
        } finally {
            setLoading(false);
        }
    };

    const diff: TemplateDiff | null = useMemo(
        () => (state ? diffFields(group.fields, state.fields) : null),
        [state, group.fields],
    );

    const previewRows = useMemo<PreviewRow[]>(() => {
        if (!state || !diff) return [];
        const added = new Set(diff.added);
        const rows: PreviewRow[] = state.fields.map(field => ({
            key: `new-${field}`,
            field,
            kind: added.has(field) ? 'added' : 'kept',
        }));
        for (const field of diff.removed) {
            rows.push({ key: `old-${field}`, field, kind: 'removed' as const });
        }
        return rows.filter(row =>
            previewFilter === 'all'
            || (previewFilter === 'added' && row.kind === 'added')
            || (previewFilter === 'removed' && row.kind === 'removed')
            || (previewFilter === 'kept' && row.kind === 'kept'));
    }, [state, diff, previewFilter]);

    const columns: ColumnsType<PreviewRow> = [
        {
            title: '字段名',
            dataIndex: 'field',
            key: 'field',
            ellipsis: true,
            render: (field: string) => <span className="text-1">{field}</span>,
        },
        {
            title: '变化',
            key: 'kind',
            width: 120,
            render: (_: unknown, row) => {
                if (row.kind === 'added') return <Tag color="success">新增</Tag>;
                if (row.kind === 'removed') return <Tag color="error">移除</Tag>;
                return <span className="text-aux text-3">保留</span>;
            },
        },
    ];

    const handleApply = async () => {
        if (!state) return;
        setApplying(true);
        try {
            await onApply(state.fields, mode);
            message.success(
                mode === 'replace'
                    ? `字段组已更新：${state.fields.length} 个字段`
                    : `已合并：新增 ${diff?.added.length ?? 0}，共 ${Math.max(group.fields.length, state.fields.length)} 个字段`,
            );
            onCancel();
        } catch (err) {
            console.error(err);
            message.error('应用失败');
        } finally {
            setApplying(false);
        }
    };

    const footer = state ? (
        <div className="flex items-center justify-end gap-2">
            <span className="mr-auto text-aux text-3">
                当前 {group.fields.length} 项 → 应用后 {
                    mode === 'replace'
                        ? state.fields.length
                        : new Set([...group.fields, ...state.fields]).size
                } 项
            </span>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" loading={applying} onClick={() => void handleApply()}>
                应用并保存
            </Button>
        </div>
    ) : null;

    return (
        <Modal
            title={`从 Excel 更新字段组 · ${group.name}`}
            open={open}
            onCancel={onCancel}
            width={720}
            destroyOnHidden
            footer={footer}
        >
            <div className="flex flex-col gap-3 mt-4">
                {!state ? (
                    <>
                        <div className="text-2">
                            选择车上云提供的模板 Excel，第一列即字段清单（自动跳过「参数项名称」表头）
                        </div>
                        <div>
                            <Button
                                icon={<FileExcelOutlined />}
                                loading={loading}
                                onClick={() => void pickFile()}
                            >
                                选择 Excel 文件
                            </Button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="flex items-center gap-2 text-2 flex-wrap">
                            <span className="text-3">来源</span>
                            <span className="truncate">{state.fileName}</span>
                            <Button size="small" type="link" onClick={() => void pickFile()}>
                                换一个文件
                            </Button>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap text-2">
                            <span>文件内 <span className="tabular-nums font-medium">{state.fields.length}</span> 个字段</span>
                            {diff && (
                                <>
                                    <span className="text-success">新增 <span className="tabular-nums">{diff.added.length}</span></span>
                                    <span className="text-danger">移除 <span className="tabular-nums">{diff.removed.length}</span></span>
                                    <span className="text-aux text-3">
                                        保留 <span className="tabular-nums">{state.fields.length - diff.added.length}</span>
                                    </span>
                                </>
                            )}
                            {state.duplicates.length > 0 && (
                                <span className="text-warning">
                                    重复 {state.duplicates.length} 项已去重
                                </span>
                            )}
                        </div>

                        {!state.headerSkipped && (
                            <div className="text-aux text-3">
                                首行不是「参数项名称」等标准表头，已按第一列全部计入
                            </div>
                        )}

                        <Radio.Group
                            value={mode}
                            onChange={e => setMode(e.target.value as Mode)}
                            className="flex flex-col gap-1"
                        >
                            <Radio value="replace">
                                覆盖：字段清单换成文件里的（{state.fields.length} 项）
                                <span className="text-aux text-3 ml-2">移除的字段，其来源映射一并清除</span>
                            </Radio>
                            <Radio value="merge">
                                合并：保留现有字段，只追加文件里的新字段
                                <span className="text-aux text-3 ml-2">适合模板只做增量更新</span>
                            </Radio>
                        </Radio.Group>

                        <div className="flex items-center gap-2">
                            <span className="text-aux text-3">预览</span>
                            <Segmented
                                size="small"
                                value={previewFilter}
                                onChange={value => setPreviewFilter(value as typeof previewFilter)}
                                options={[
                                    { label: '全部', value: 'all' },
                                    { label: '新增', value: 'added' },
                                    { label: '移除', value: 'removed' },
                                    { label: '保留', value: 'kept' },
                                ]}
                            />
                        </div>

                        <Table
                            size="small"
                            rowKey="key"
                            columns={columns}
                            dataSource={previewRows}
                            pagination={compactPagination()}
                            scroll={{ y: MODAL_TABLE_SCROLL_Y }}
                        />
                    </>
                )}
            </div>
        </Modal>
    );
};

export default FieldGroupImportModal;
