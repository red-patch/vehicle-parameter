import React, { useMemo, useState } from 'react';
import { Drawer, Table, Select, AutoComplete, InputNumber, Checkbox, Button, Tag, message } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import type { FacetVocab } from '../../utils/assetFacets';
import {
    ASSET_LEVEL_FACET_DIMS,
    FACET_DIM_LABELS,
    buildFieldEditPlan,
    isWritableTarget,
    type FieldEditRow,
    type FieldEditSourceRow,
    type FieldEditVerdict,
    type FieldTarget,
} from '../../utils/assetFieldEdit';

/**
 * 批量字段维护抽屉（设计：docs/plans/2026-10-13-batch-field-maintenance-design.md）。
 * 参数行与受控属性共用一个字段选择器：选字段 → 填新值 → 逐台预览判定 → 确认写入。
 * 只负责交互与预览，落盘由宿主（AssetPoolLayout）分派，纯逻辑在 assetFieldEdit.ts。
 */

export interface ParamFieldOption {
    name: string;
    group?: string;
}

interface AssetBatchFieldEditorProps {
    open: boolean;
    title?: string;
    /** 候选资产（含参数行 / 解析后的受控属性） */
    rows: FieldEditSourceRow[];
    /** 参数层可选字段（受控词表） */
    paramFields: ParamFieldOption[];
    vocab: FacetVocab;
    /** 取某参数字段的受控取值（词表），用于值输入建议 */
    getParamEnumValues: (fieldName: string) => string[];
    onClose: () => void;
    /** 确认写入：仅 checkout 出的行（verdict 非 same/null） */
    onSave: (payload: { target: FieldTarget; value: string | number; rows: FieldEditRow[] }) => void | Promise<void>;
}

const encodeTarget = (t: FieldTarget): string => (t.layer === 'facet' ? `facet:${t.dim}` : `param:${t.name}`);

const VERDICT_META: Record<FieldEditVerdict, { label: string; color?: string; className: string }> = {
    fill: { label: '补全', color: 'success', className: '' },
    addRow: { label: '新增行', color: 'processing', className: '' },
    overwrite: { label: '覆盖 ⚠', color: 'error', className: '' },
    same: { label: '一致（跳过）', className: 'text-3' },
};

const isActionable = (r: FieldEditRow): boolean => r.verdict !== null && r.verdict !== 'same';

const AssetBatchFieldEditor: React.FC<AssetBatchFieldEditorProps> = ({
    open, title, rows, paramFields, vocab, getParamEnumValues, onClose, onSave,
}) => {
    const [target, setTarget] = useState<FieldTarget | null>(null);
    const [value, setValue] = useState<string | number | null>(null);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [onlyLatest, setOnlyLatest] = useState(false);
    const [onlyEmpty, setOnlyEmpty] = useState(false);

    const fieldOptions = useMemo(() => [
        {
            label: '受控属性',
            options: ASSET_LEVEL_FACET_DIMS.map(dim => ({ value: `facet:${dim}`, label: FACET_DIM_LABELS[dim] })),
        },
        {
            label: '参数',
            options: paramFields.map(f => ({ value: `param:${f.name}`, label: f.group ? `${f.group}·${f.name}` : f.name })),
        },
    ], [paramFields]);

    // 范围收窄：仅最新版 / 仅此字段当前为空（在计划生成前先过滤候选行）
    const scopedRows = useMemo(() => {
        if (!target) return rows;
        return rows.filter(r => {
            if (onlyLatest && !r.isLatest) return false;
            if (onlyEmpty) {
                const { value: cur } = target.layer === 'facet'
                    ? { value: (r.facets?.[target.dim] as string | number | null | undefined) ?? null }
                    : { value: r.params.find(p => p.name === (target as { name: string }).name)?.value ?? null };
                if (cur !== null && String(cur).trim() !== '') return false;
            }
            return true;
        });
    }, [rows, target, onlyLatest, onlyEmpty]);

    // 选中字段即出预览（当前值可见），新值未填时 verdict 为 null、不可勾选；
    // 不能等新值才建计划，否则用户选完字段看到的是空表，误以为字段不存在。
    const plan = useMemo(
        () => (target ? buildFieldEditPlan(scopedRows, target, value) : []),
        [scopedRows, target, value],
    );

    // 勾选：行一旦变得「可动作」（补全/覆盖/新增行）就默认勾上；
    // 用户手动取消过的行不再自动复活（touchedRef 记录用户的取舍）。
    // 换字段/范围时先清 touchedRef，再按默认重勾（同一个 effect 内顺序执行，避免两个 effect 互相覆盖）。
    const touchedRef = React.useRef<Set<string>>(new Set());
    const scopeKey = `${encodeTarget(target ?? { layer: 'param', name: '' })}\u0000${onlyLatest}\u0000${onlyEmpty}`;
    const planSig = `${scopeKey}\u0000${plan.map(r => `${r.fileName}:${r.verdict ?? ''}`).join(',')}`;
    const scopeRef = React.useRef(scopeKey);

    React.useEffect(() => {
        if (scopeRef.current !== scopeKey) {
            scopeRef.current = scopeKey;
            touchedRef.current = new Set();
        }
        const actionable = new Set(plan.filter(isActionable).map(r => r.fileName));
        setChecked(prev => {
            const next = new Set<string>();
            actionable.forEach(f => {
                if (touchedRef.current.has(f)) {
                    if (prev.has(f)) next.add(f);
                } else {
                    next.add(f);
                }
            });
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planSig]);

    const actionableChecked = plan.filter(r => checked.has(r.fileName) && r.verdict && r.verdict !== 'same');
    const canSave = isWritableTarget(target) && value !== null && actionableChecked.length > 0;

    const applyBatchValue = (v: string | number | null) => { setValue(v); };

    const handleSave = async () => {
        if (!canSave || !target || value === null) return;
        setSaving(true);
        try {
            await onSave({ target, value, rows: actionableChecked });
            setChecked(new Set());
            setValue(null);
        } finally {
            setSaving(false);
        }
    };

    const setPreset = (preset: 'latest' | 'empty' | 'all') => {
        if (!target) { message.info('请先选择字段'); return; }
        // 重置勾选：清掉用户取舍，回到「可动作行全勾」
        touchedRef.current = new Set();
        if (preset === 'all') {
            setOnlyLatest(false); setOnlyEmpty(false);
            setChecked(new Set(buildFieldEditPlan(rows, target, value).filter(isActionable).map(r => r.fileName)));
            return;
        }
        if (preset === 'latest') { setOnlyLatest(true); setOnlyEmpty(false); return; }
        setOnlyEmpty(true); setOnlyLatest(false);
    };

    const renderValueInput = () => {
        if (!target) return null;
        if (target.layer === 'facet') {
            if (target.dim === 'capacityKwh') {
                return (
                    <InputNumber size="small" placeholder="kWh" min={0} style={{ width: 140 }}
                        value={typeof value === 'number' ? value : undefined}
                        onChange={v => applyBatchValue(v ?? null)} />
                );
            }
            const entries = target.dim === 'admissionLevel'
                ? vocab.admissionLevel.map(l => ({ value: l, label: l }))
                : (vocab[target.dim] as { name: string; group?: string }[]).map(e => ({
                    value: e.name,
                    label: e.group && e.group !== e.name ? `${e.group}·${e.name}` : e.name,
                }));
            return (
                <AutoComplete size="small" allowClear style={{ width: 240 }}
                    placeholder="选择或输入（可新增）"
                    value={typeof value === 'string' ? value : undefined}
                    onChange={v => applyBatchValue(v ?? null)}
                    options={entries}
                    filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())} />
            );
        }
        return (
            <AutoComplete size="small" allowClear style={{ width: 240 }}
                placeholder="选择或输入字段值"
                value={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}
                onChange={v => applyBatchValue(v ?? null)}
                options={getParamEnumValues(target.name).map(v => ({ value: v, label: v }))}
                filterOption={(input, option) => String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())} />
        );
    };

    const allChecked = plan.length > 0 && plan.every(r => checked.has(r.fileName));

    return (
        <Drawer
            open={open}
            title={title || '批量字段维护'}
            width={900}
            onClose={onClose}
            destroyOnHidden
            extra={
                <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSave} disabled={!canSave}>
                    预览并保存（{actionableChecked.length}）
                </Button>
            }
        >
            <div className="space-y-2 mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] text-2 w-10 shrink-0">字段</span>
                    <Select
                        size="small" style={{ width: 280 }} placeholder="选择受控属性或参数字段"
                        value={target ? encodeTarget(target) : undefined}
                        showSearch optionFilterProp="label"
                        onChange={v => {
                            const next = v.startsWith('facet:')
                                ? ({ layer: 'facet', dim: v.slice(6) } as FieldTarget)
                                : ({ layer: 'param', name: v.slice(6) } as FieldTarget);
                            setTarget(next);
                            setValue(null);
                            setChecked(new Set());
                        }}
                        options={fieldOptions}
                    />
                    <span className="text-[12px] text-2 w-10 shrink-0">新值</span>
                    {renderValueInput()}
                </div>
                <div className="flex items-center gap-3 flex-wrap text-[12px] text-2">
                    <Checkbox checked={allChecked} disabled={plan.length === 0}
                        onChange={e => {
                            touchedRef.current = new Set(plan.map(r => r.fileName));
                            setChecked(e.target.checked ? new Set(plan.map(r => r.fileName)) : new Set());
                        }}>
                        全选（{checked.size}/{plan.length}）
                    </Checkbox>
                    <span className="w-px h-4 bg-[color:var(--border-default)]" />
                    <span className="text-3">范围</span>
                    <Checkbox checked={onlyLatest} onChange={e => setOnlyLatest(e.target.checked)}>仅最新版</Checkbox>
                    <Checkbox checked={onlyEmpty} onChange={e => setOnlyEmpty(e.target.checked)}>仅此字段为空</Checkbox>
                    <Button size="small" type="link" className="!px-1" onClick={() => setPreset('all')}>重置勾选</Button>
                </div>
            </div>

            <Table<FieldEditRow>
                size="small"
                rowKey="fileName"
                dataSource={plan}
                pagination={plan.length > 50 ? { pageSize: 50, size: 'small' } : false}
                rowSelection={{
                    selectedRowKeys: Array.from(checked),
                    onChange: keys => {
                        // 用户逐行取舍：记为 touched，后续自动勾选不再复活被取消的行
                        touchedRef.current = new Set([...touchedRef.current, ...plan.map(r => r.fileName)]);
                        setChecked(new Set(keys as string[]));
                    },
                    getCheckboxProps: r => ({ disabled: r.verdict === null || r.verdict === 'same' }),
                    columnWidth: 36,
                }}
                locale={{ emptyText: target ? '没有符合条件的资产' : '先选择要维护的字段' }}
                columns={[
                    {
                        title: '资产', dataIndex: 'fileName', width: 260, ellipsis: true,
                        render: (_, row) => (
                            <div className="min-w-0">
                                <div className="text-[12px] text-1 truncate flex items-center gap-1" title={row.productName}>
                                    <span className="truncate">{row.productName}</span>
                                    {row.isLatest && <Tag className="m-0 text-[10px] px-1 leading-[16px] text-brand border-brand">最新</Tag>}
                                </div>
                                <div className="text-[10px] text-3 truncate" title={row.fileName}>{row.fileName}</div>
                            </div>
                        ),
                    },
                    {
                        title: '当前值', key: 'current', width: 180, ellipsis: true,
                        render: (_, row) => (
                            <span className={row.currentValue === null || String(row.currentValue).trim() === '' ? 'text-4' : 'text-1'}>
                                {row.currentValue === null || String(row.currentValue).trim() === ''
                                    ? '—（空）'
                                    : String(row.currentValue)}
                            </span>
                        ),
                    },
                    {
                        title: '新值', key: 'next', width: 160, ellipsis: true,
                        render: (_, row) => <span className={row.verdict === 'same' ? 'text-3' : 'text-brand'}>{row.nextValue === null ? '—' : String(row.nextValue)}</span>,
                    },
                    {
                        title: '判定', key: 'verdict', width: 130,
                        render: (_, row) => {
                            if (!row.verdict) return <span className="text-3">—</span>;
                            const meta = VERDICT_META[row.verdict];
                            return row.verdict === 'same'
                                ? <Tag className={`m-0 text-[11px] ${meta.className}`}>{meta.label}</Tag>
                                : <Tag color={meta.color} className="m-0 text-[11px]">{meta.label}</Tag>;
                        },
                    },
                    {
                        title: '命中', key: 'hit', width: 70,
                        render: (_, row) => (
                            <span className="text-[11px] text-3 tabular-nums">
                                {row.verdict === 'addRow' ? '新增' : row.hitCount > 1 ? `${row.hitCount} 行` : '—'}
                            </span>
                        ),
                    },
                ]}
                scroll={{ y: 460 }}
            />
        </Drawer>
    );
};

export default AssetBatchFieldEditor;
