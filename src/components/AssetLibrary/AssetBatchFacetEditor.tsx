import React, { useMemo, useState } from 'react';
import { Drawer, Table, Select, AutoComplete, InputNumber, Checkbox, Button, Tag, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { AssetFacetOverride, FacetVocab, ResolvedFacets } from '../../utils/assetFacets';
import { FACET_NONE } from '../../utils/facetFilters';

export interface BatchFacetRow {
    fileName: string;
    productName: string;
    facets: ResolvedFacets;
}

interface AssetBatchFacetEditorProps {
    open: boolean;
    title?: string;
    rows: BatchFacetRow[];
    vocab: FacetVocab;
    onClose: () => void;
    /** 保存修正（fileName → 覆盖值），父级落盘 */
    onSaveOverrides: (updates: Record<string, AssetFacetOverride>) => void | Promise<void>;
}

type EditableField = 'manufacturer' | 'batteryBrand' | 'capacityKwh' | 'admissionLevel';

/**
 * 资产级受控属性批量补录表格：多选行 + 批量设值 + 单格编辑，
 * 保存为 _facet_values.json 的人工修正层（覆盖派生值）。
 */
const AssetBatchFacetEditor: React.FC<AssetBatchFacetEditorProps> = ({
    open, title, rows, vocab, onClose, onSaveOverrides,
}) => {
    const [draft, setDraft] = useState<Record<string, AssetFacetOverride>>({});
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [onlyMissing, setOnlyMissing] = useState(true);
    const [batchField, setBatchField] = useState<EditableField>('manufacturer');
    const [batchValue, setBatchValue] = useState<string | number | null>(null);
    const [saving, setSaving] = useState(false);

    const isMissing = (f: ResolvedFacets) =>
        f.manufacturer === null || f.batteryBrand === null || f.capacityKwh === null || f.admissionLevel === null;

    const displayRows = useMemo(
        () => (onlyMissing ? rows.filter(r => isMissing(r.facets) || Object.keys(draft[r.fileName] || {}).length > 0) : rows),
        [rows, onlyMissing, draft],
    );

    const valueOf = (row: BatchFacetRow, field: EditableField): string | number | null => {
        const d = draft[row.fileName];
        if (d && d[field] !== undefined) return d[field] as string | number | null;
        return row.facets[field] as string | number | null;
    };

    const setCell = (row: BatchFacetRow, field: EditableField, value: string | number | null | undefined) => {
        setDraft(prev => {
            const base = { ...(prev[row.fileName] || {}) } as Record<string, unknown>;
            if (value === undefined || value === null || value === '') delete base[field];
            else base[field] = value;
            const next = { ...prev };
            if (Object.keys(base).length === 0) delete next[row.fileName];
            else next[row.fileName] = base as AssetFacetOverride;
            return next;
        });
    };

    const applyBatch = () => {
        if (selected.size === 0) { message.warning('请先勾选要修改的行'); return; }
        if (batchValue === null || batchValue === '') { message.warning('请先填写批量值'); return; }
        setDraft(prev => {
            const next = { ...prev };
            selected.forEach(fileName => {
                const base = { ...(next[fileName] || {}) } as Record<string, unknown>;
                base[batchField] = batchValue;
                next[fileName] = base as AssetFacetOverride;
            });
            return next;
        });
        message.success(`已应用到 ${selected.size} 行（保存后生效）`);
    };

    const handleSave = async () => {
        if (Object.keys(draft).length === 0) { message.info('没有待保存的修改'); return; }
        setSaving(true);
        try {
            await onSaveOverrides(draft);
            setDraft({});
            setSelected(new Set());
        } finally {
            setSaving(false);
        }
    };

    const allChecked = displayRows.length > 0 && displayRows.every(r => selected.has(r.fileName));

    return (
        <Drawer
            open={open}
            title={title || '批量补录（资产级受控属性）'}
            width={860}
            onClose={onClose}
            destroyOnHidden
            extra={
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave}
                    disabled={Object.keys(draft).length === 0}>
                    保存修正（{Object.keys(draft).length}）
                </Button>
            }
        >
            <div className="flex items-center gap-2 flex-wrap mb-2">
                <Checkbox checked={allChecked} onChange={e => setSelected(e.target.checked ? new Set(displayRows.map(r => r.fileName)) : new Set())}>
                    全选（{selected.size}/{displayRows.length}）
                </Checkbox>
                <Checkbox checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)}>
                    只看待补全
                </Checkbox>
                <span className="w-px h-4 bg-[color:var(--border-default)]" />
                <span className="text-[12px] text-2">批量设值</span>
                <Select size="small" value={batchField} style={{ width: 110 }} onChange={v => { setBatchField(v); setBatchValue(null); }}
                    options={[
                        { value: 'manufacturer', label: '主机厂' },
                        { value: 'batteryBrand', label: '电池品牌' },
                        { value: 'capacityKwh', label: '电量' },
                        { value: 'admissionLevel', label: '准入等级' },
                    ]}
                />
                {batchField === 'manufacturer' && (
                    <AutoComplete size="small" allowClear placeholder="选择或输入主机厂（可新增）" style={{ width: 200 }}
                        value={typeof batchValue === 'string' ? batchValue : undefined}
                        onChange={v => setBatchValue(v ?? null)}
                        options={vocab.manufacturer.map(e => ({
                            value: e.name,
                            label: e.group && e.group !== e.name ? `${e.group}·${e.name}` : e.name,
                        }))}
                        filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    />
                )}
                {batchField === 'batteryBrand' && (
                    <AutoComplete size="small" allowClear placeholder="选择或输入电池品牌（可新增）" style={{ width: 200 }}
                        value={typeof batchValue === 'string' ? batchValue : undefined}
                        onChange={v => setBatchValue(v ?? null)}
                        options={vocab.batteryBrand.map(e => ({ value: e.name, label: e.name }))}
                        filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    />
                )}
                {batchField === 'capacityKwh' && (
                    <InputNumber size="small" placeholder="kWh" min={0} style={{ width: 110 }}
                        value={typeof batchValue === 'number' ? batchValue : undefined}
                        onChange={v => setBatchValue(v ?? null)}
                    />
                )}
                {batchField === 'admissionLevel' && (
                    <AutoComplete size="small" allowClear placeholder="选择或输入等级（可新增）" style={{ width: 140 }}
                        value={typeof batchValue === 'string' ? batchValue : undefined}
                        onChange={v => setBatchValue(v ?? null)}
                        options={vocab.admissionLevel.map(l => ({ value: l, label: l }))}
                        filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                    />
                )}
                <Button size="small" onClick={applyBatch} disabled={selected.size === 0}>应用到已选</Button>
            </div>

            <Table<BatchFacetRow>
                size="small"
                rowKey="fileName"
                dataSource={displayRows}
                pagination={displayRows.length > 50 ? { pageSize: 50, size: 'small' } : false}
                rowSelection={{
                    selectedRowKeys: Array.from(selected),
                    onChange: keys => setSelected(new Set(keys as string[])),
                    columnWidth: 36,
                }}
                columns={[
                    {
                        title: '资产',
                        dataIndex: 'fileName',
                        width: 220,
                        ellipsis: true,
                        render: (_, row) => (
                            <div className="min-w-0">
                                <div className="text-[12px] text-1 truncate" title={row.fileName}>{row.productName}</div>
                                <div className="text-[10px] text-3 truncate" title={row.fileName}>{row.fileName}</div>
                            </div>
                        ),
                    },
                    {
                        title: '主机厂',
                        key: 'manufacturer',
                        width: 200,
                        render: (_, row) => (
                            <AutoComplete size="small" allowClear placeholder="待补全（可输入新增）" className="w-full"
                                value={valueOf(row, 'manufacturer') as string | null || undefined}
                                onChange={v => setCell(row, 'manufacturer', v)}
                                options={vocab.manufacturer.map(e => ({
                                    value: e.name,
                                    label: e.group && e.group !== e.name ? `${e.group}·${e.name}` : e.name,
                                }))}
                                filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            />
                        ),
                    },
                    {
                        title: '电池品牌',
                        key: 'batteryBrand',
                        width: 170,
                        render: (_, row) => (
                            <AutoComplete size="small" allowClear placeholder="待补全（可输入新增）" className="w-full"
                                value={valueOf(row, 'batteryBrand') as string | null || undefined}
                                onChange={v => setCell(row, 'batteryBrand', v)}
                                options={vocab.batteryBrand.map(e => ({ value: e.name, label: e.name }))}
                                filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            />
                        ),
                    },
                    {
                        title: '电量(kWh)',
                        key: 'capacityKwh',
                        width: 110,
                        render: (_, row) => (
                            <InputNumber size="small" placeholder="待补全" className="w-full" min={0}
                                value={valueOf(row, 'capacityKwh') as number | null ?? undefined}
                                onChange={v => setCell(row, 'capacityKwh', v)}
                            />
                        ),
                    },
                    {
                        title: '准入等级',
                        key: 'admissionLevel',
                        width: 110,
                        render: (_, row) => (
                            <AutoComplete size="small" allowClear placeholder="待补全（可输入新增）" className="w-full"
                                value={valueOf(row, 'admissionLevel') as string | null || undefined}
                                onChange={v => setCell(row, 'admissionLevel', v)}
                                options={vocab.admissionLevel.map(l => ({ value: l, label: l }))}
                                filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                            />
                        ),
                    },
                    {
                        title: '状态',
                        key: 'flags',
                        width: 90,
                        render: (_, row) => (
                            <span className="flex flex-wrap gap-1">
                                {isMissing(row.facets) && <Tag className="m-0 text-[10px] px-1">待补全</Tag>}
                                {row.facets.announceNos.length === 0 && <Tag className="m-0 text-[10px] px-1">{FACET_NONE}公告号</Tag>}
                                {draft[row.fileName] && <Tag color="warning" className="m-0 text-[10px] px-1">已改</Tag>}
                            </span>
                        ),
                    },
                ]}
                scroll={{ y: 480 }}
            />
        </Drawer>
    );
};

export default AssetBatchFacetEditor;
