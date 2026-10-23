import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Button, Input, Table, Tag, message, AutoComplete, Alert, Tooltip } from 'antd';
import { AimOutlined, CheckOutlined, ClearOutlined, BugOutlined, CopyOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { compactPagination, MODAL_TABLE_SCROLL_Y } from '../common/tablePresets';
import type { ResolvedField } from '../../utils/fieldMapping';
import { DSTCAR_FEEDBACK_BOOKMARKLET } from '../../utils/dstcarFeedbackScript';
import {
    matchIssuesToFields,
    mergeIssuesByField,
    parseUploadFeedback,
    summarizeIssues,
    type MergedIssue,
    type UploadIssueKind,
} from '../../utils/uploadFeedback';

/**
 * 「粘贴上传回执 → 定位到字段 → 就地修正」。
 *
 * 车上云的报错只给行号与一句中文，用户要自己回到 441 行里找。
 * 行号与导出文件严格同源，这里直接反查成字段名，并给出可执行动作。
 */
interface UploadFeedbackModalProps {
    open: boolean;
    fields: ResolvedField[];
    /** 该字段的允许值（空 = 词表未收录） */
    getEnums: (field: string) => string[];
    /** 写一个修正值 */
    onFixValue: (field: string, value: string) => void;
    /** 定位到表格该行（关弹窗并滚动/筛选） */
    onLocate: (field: string) => void;
    /** 当前字段组里已标记为必填的字段 */
    requiredFields?: string[];
    /**
     * 把字段在字段组里标记为必填。
     * 「必填未填」是车上云对整组的约束，不是单次填报的临时要求——
     * 在回执里直接标上，之后处理其他资产时就能提前看到哪些必须填。
     */
    onMarkRequired?: (field: string) => void;
    onClose: () => void;
}

/** 措辞与车上云回执一一对应，不要合并——它们是两层不同的校验 */
const KIND_META: Record<UploadIssueKind, { label: string; tone: 'danger' | 'warning' | 'neutral'; hint?: string }> = {
    column_not_in_template: {
        label: '列不属于该模版',
        tone: 'danger',
        hint: '该次上传选的类别模板里没有这一列',
    },
    attribute_missing: {
        label: '属性不存在',
        tone: 'danger',
        hint: '商品属性库里没有这个字段',
    },
    value_invalid: { label: '取值有误', tone: 'danger' },
    required_missing: { label: '必填未填', tone: 'warning' },
    other: { label: '其他', tone: 'neutral' },
};

const UploadFeedbackModal: React.FC<UploadFeedbackModalProps> = ({
    open, fields, getEnums, onFixValue, onLocate, requiredFields = [], onMarkRequired, onClose,
}) => {
    const [raw, setRaw] = useState('');
    const [edits, setEdits] = useState<Record<string, string>>({});
    /**
     * 显式清空：`edits[field] === ''` 本身也可能是「用户想填空」，
     * 与「尚未编辑」无法区分，所以单独记一份。
     */
    const [cleared, setCleared] = useState<Set<string>>(new Set());
    /** 本次会话里刚标为必填的字段（给即时反馈，不等父级回传） */
    const [markedRequired, setMarkedRequired] = useState<Set<string>>(new Set());
    const requiredSet = useMemo(
        () => new Set([...requiredFields, ...markedRequired]),
        [requiredFields, markedRequired],
    );

    const markRequired = useCallback((field: string) => {
        if (!onMarkRequired || requiredSet.has(field)) return;
        onMarkRequired(field);
        setMarkedRequired(prev => new Set(prev).add(field));
        message.success(`已把「${field}」设为必填，之后处理其他资产时会提前看到`);
    }, [onMarkRequired, requiredSet]);

    /** 一次把当前所有「必填未填」的字段标进字段组 */
    const markAllRequired = useCallback((list: string[]) => {
        if (!onMarkRequired) return;
        let count = 0;
        for (const field of list) {
            if (requiredSet.has(field)) continue;
            onMarkRequired(field);
            count++;
        }
        if (count === 0) { message.info('这些字段已经都是必填'); return; }
        setMarkedRequired(prev => {
            const next = new Set(prev);
            list.forEach(f => next.add(f));
            return next;
        });
        message.success(`已设为必填 ${count} 个字段`);
    }, [onMarkRequired, requiredSet]);
    // 拖拽书签：href 必须在挂载后写（React 会把 javascript: 协议当不安全链接拦掉）
    const bookmarkLinkRef = React.useRef<HTMLAnchorElement>(null);
    React.useEffect(() => {
        if (bookmarkLinkRef.current) bookmarkLinkRef.current.href = DSTCAR_FEEDBACK_BOOKMARKLET;
    }, []);

    /**
     * 粘贴即解析：raw 一变就重算问题表，不再要求用户点「解析回执」。
     * 空输入 → 回到首屏（书签 + 粘贴框）。
     */
    const parseResult = useMemo(() => {
        if (!raw.trim()) return { issues: null as MergedIssue[] | null, unparsed: 0 };
        const list = parseUploadFeedback(raw);
        // 同一字段的多条报错合并成一行：车上云对同一问题会同时报「列不属于模版」与「属性不存在」
        return { issues: mergeIssuesByField(matchIssuesToFields(list, fields)), unparsed: list.length };
    }, [raw, fields]);

    const liveIssues = parseResult.issues;
    const hasUnrecognized = !!raw.trim() && parseResult.unparsed === 0;

    const parsed = useMemo(
        () => (liveIssues ? summarizeIssues(liveIssues) : null),
        [liveIssues],
    );

    const setEdit = useCallback((field: string, value: string) => {
        setEdits(prev => ({ ...prev, [field]: value }));
        setCleared(prev => {
            const next = new Set(prev);
            if (value === '') next.add(field); else next.delete(field);
            return next;
        });
    }, []);

    const applyEdit = useCallback((field: string) => {
        const touched = edits[field] !== undefined || cleared.has(field);
        if (!touched) { message.info('先选一个值，或点「清空」把该字段留空'); return; }
        // 允许填空：车上云对某些字段接受空值（也用于「必填但确实没有」时的人工放行）
        const value = edits[field] ?? '';
        onFixValue(field, value);
        setEdit(field, '');
        setCleared(prev => { const next = new Set(prev); next.delete(field); return next; });
        message.success(value === '' ? `已把「${field}」置空` : `已修正「${field}」`);
    }, [edits, cleared, onFixValue, setEdit]);

    const applyAllEdits = () => {
        const entries = Object.entries(edits).filter(([, value]) => value !== undefined);
        const clearedOnly = Array.from(cleared).filter(field => !(field in edits));
        const total = entries.length + clearedOnly.length;
        if (total === 0) { message.warning('还没有填写任何修正值'); return; }
        // 空串是合法的「明确置空」，与未编辑区分开
        for (const [field, value] of entries) onFixValue(field, value);
        for (const field of clearedOnly) onFixValue(field, '');
        setEdits({});
        setCleared(new Set());
        message.success(`已修正 ${total} 个字段`);
    };

    const columns: ColumnsType<MergedIssue> = useMemo(() => [
        {
            title: '行号',
            dataIndex: 'rowNumber',
            key: 'rowNumber',
            width: 80,
            render: (rowNumber?: number) => (
                <span className="text-aux tabular-nums">{rowNumber ?? '—'}</span>
            ),
        },
        {
            title: '字段',
            key: 'field',
            ellipsis: true,
            render: (_: unknown, row) => (
                <div className="min-w-0">
                    <div className="text-1 truncate" title={row.resolvedField}>
                        {row.resolvedField ?? '（无法识别）'}
                    </div>
                    {row.resolvedField && row.field && row.resolvedField !== row.field && (
                        <div className="text-aux text-3 truncate">回执写的是「{row.field}」</div>
                    )}
                </div>
            ),
        },
        {
            title: '问题',
            key: 'kind',
            width: 190,
            render: (_: unknown, row) => (
                <span className="flex flex-wrap gap-1">
                    {row.kinds.map(kind => (
                        <Tag
                            key={kind}
                            title={KIND_META[kind].hint}
                            color={KIND_META[kind].tone === 'danger' ? 'error' : KIND_META[kind].tone === 'warning' ? 'warning' : 'default'}
                        >
                            {KIND_META[kind].label}
                        </Tag>
                    ))}
                </span>
            ),
        },
        {
            title: '当前值',
            key: 'current',
            width: 140,
            ellipsis: true,
            render: (_: unknown, row) => (
                row.currentValue
                    ? <span className="font-mono text-1">{row.currentValue}</span>
                    : <span className="text-3">（空）</span>
            ),
        },
        {
            title: '修正为',
            key: 'fix',
            width: 260,
            render: (_: unknown, row) => {
                const field = row.resolvedField;
                if (!field) return <span className="text-aux text-3">先确认字段</span>;
                const enums = getEnums(field);
                if (enums.length > 0) {
                    // AutoComplete：既是下拉（给合法值），也允许手输——
                    // 词表不全时用户仍要能填；空串 = 明确置空，也算一次有效修改
                    return (
                        <span className="flex items-center gap-1">
                            <AutoComplete
                                size="small"
                                style={{ flex: 1, minWidth: 0 }}
                                placeholder="选择或直接输入"
                                value={edits[field] ?? ''}
                                options={enums.map(v => ({ value: v }))}
                                filterOption={(input, option) =>
                                    String(option?.value ?? '').toLowerCase().includes(input.toLowerCase())}
                                onChange={value => setEdit(field, value)}
                                onKeyDown={e => { if (e.key === 'Enter') applyEdit(field); }}
                            />
                            {cleared.has(field) && <Tag className="m-0">置空</Tag>}
                            <Tooltip title="清空该字段（留空导出）">
                                <Button
                                    size="small"
                                    type="text"
                                    aria-label="清空该字段"
                                    onClick={() => { setEdit(field, ''); applyEdit(field); }}
                                >
                                    清空
                                </Button>
                            </Tooltip>
                            {(edits[field] !== undefined || cleared.has(field)) && (
                                <Button size="small" type="text" icon={<CheckOutlined />} aria-label="应用" onClick={() => applyEdit(field)} />
                            )}
                        </span>
                    );
                }
                const isRequiredIssue = row.kinds.includes('required_missing');
                return (
                    <span className="flex items-center gap-1">
                        <Input
                            size="small"
                            placeholder={isRequiredIssue ? '必填，输入值' : '输入正确值'}
                            value={edits[field] ?? ''}
                            onChange={e => setEdit(field, e.target.value)}
                            onPressEnter={() => applyEdit(field)}
                        />
                        <Button size="small" type="text" icon={<CheckOutlined />} aria-label="应用" onClick={() => applyEdit(field)} />
                    </span>
                );
            },
        },
        {
            /**
             * 必填是**字段组属性**，不是单次填报的临时要求。
             * 在回执里直接标上，之后处理其他资产时就能提前看到哪些必须填。
             */
            title: '必填',
            key: 'required',
            width: 110,
            render: (_: unknown, row) => {
                if (!row.kinds.includes('required_missing') || !row.resolvedField) return null;
                const field = row.resolvedField;
                if (requiredSet.has(field)) {
                    return <Tag color="success" className="m-0">已设为必填</Tag>;
                }
                return (
                    <Tooltip title="把该字段在字段组里标记为必填，下次处理其他车型时提前提示">
                        <Button
                            size="small"
                            type="link"
                            className="!px-1"
                            onClick={() => markRequired(field)}
                        >
                            设为必填
                        </Button>
                    </Tooltip>
                );
            },
        },
        {
            title: '',
            key: 'locate',
            width: 60,
            render: (_: unknown, row) => (
                <Button
                    size="small"
                    type="text"
                    icon={<AimOutlined />}
                    aria-label="定位到该行"
                    disabled={!row.resolvedField}
                    onClick={() => row.resolvedField && onLocate(row.resolvedField)}
                />
            ),
        },
    ], [edits, cleared, getEnums, applyEdit, setEdit, onLocate, requiredSet, markRequired]);

    const editCount = Object.values(edits).filter(v => v !== undefined && v !== '').length;
    /** 回执里所有「必填未填」的字段名（去重、排除已无字段名的） */
    const requiredMissingFields = useMemo(
        () => Array.from(new Set(
            (liveIssues ?? [])
                .filter(row => row.kinds.includes('required_missing') && row.resolvedField)
                .map(row => row.resolvedField as string),
        )),
        [liveIssues],
    );

    return (
        <Modal
            title="上传回执修正"
            open={open}
            onCancel={onClose}
            width={980}
            destroyOnHidden
            footer={
                liveIssues ? (
                    <div className="flex items-center justify-end gap-2">
                        <span className="mr-auto text-aux text-3">
                            共 {parsed?.total ?? 0} 条 ·
                            列不属于模版 {parsed?.columnNotInTemplate ?? 0} ·
                            属性不存在 {parsed?.attributeMissing ?? 0} ·
                            取值有误 {parsed?.valueInvalid ?? 0} ·
                            必填未填 {parsed?.requiredMissing ?? 0}
                        </span>
                        <Button icon={<ClearOutlined />} onClick={() => { setRaw(''); setEdits({}); }}>
                            重新粘贴
                        </Button>
                        {onMarkRequired && requiredMissingFields.length > 0 && (
                            <Button
                                onClick={() => markAllRequired(requiredMissingFields)}
                                title="把本次回执里所有「必填未填」的字段标记进字段组"
                            >
                                全部设为必填（{requiredMissingFields.filter(f => !requiredSet.has(f)).length}）
                            </Button>
                        )}
                        <Button type="primary" disabled={editCount === 0} onClick={applyAllEdits}>
                            应用全部修正（{editCount}）
                        </Button>
                    </div>
                ) : (
                    <Button onClick={onClose}>关闭</Button>
                )
            }
        >
            <div className="flex flex-col gap-4">
                {/* 首屏就是「拿回执」：书签 + 粘贴框并排，粘完立刻出结果 */}
                <div className="rounded-lg border border-default bg-surface-3 p-3">
                    <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-2 whitespace-nowrap">① 抓到回执</span>
                        <a
                            ref={bookmarkLinkRef}
                            className="ant-btn ant-btn-primary ant-btn-sm cursor-grab"
                            title="拖拽我到浏览器书签栏"
                            onClick={() => message.info('请把这个按钮拖到书签栏，而不是直接点击哦')}
                        >
                            <BugOutlined /> 抓取上传回执
                        </a>
                        <span className="text-aux text-3">
                            拖到书签栏；在车上云报错页点一下，回执自动进剪贴板
                        </span>
                        <Button
                            size="small"
                            type="text"
                            icon={<CopyOutlined />}
                            onClick={() => {
                                navigator.clipboard.writeText(DSTCAR_FEEDBACK_BOOKMARKLET)
                                    .then(() => message.success('书签代码已复制'))
                                    .catch(() => message.warning('复制失败，请手动全选复制'));
                            }}
                        >
                            复制代码
                        </Button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-2 whitespace-nowrap">② 粘贴到这里</span>
                    <span className="text-aux text-3">粘贴即自动解析，不用再点按钮</span>
                </div>

                <Input.TextArea
                    rows={liveIssues ? 4 : 10}
                    autoFocus
                    placeholder={'第[285]行  商品属性[前装易流温度监测设备]不存在\n第[288]行  属性[燃料类型]的取值[/]有误\n第[309]行  属性[尾板类型]必填'}
                    value={raw}
                    onChange={e => setRaw(e.target.value)}
                />

                {hasUnrecognized && (
                    <Alert
                        type="warning"
                        showIcon
                        title="没读到可识别的报错行"
                        description="确认粘贴内容里有「第[N]行」或「属性[...]」；也可以直接用上面的书签抓一次。"
                    />
                )}

                {liveIssues && (
                    <>
                        {parsed && parsed.columnNotInTemplate > 0 && (
                            <Alert
                                type="warning"
                                showIcon
                                title={`有 ${parsed.columnNotInTemplate} 列的字段名不在该次上传所选模板里`}
                                description="车上云按你上传时选的类别模板校验列。请确认导出的字段组与该模板一致（换模板后需重新导出）。"
                            />
                        )}
                        {parsed && parsed.attributeMissing > 0 && (
                            <Alert
                                type="error"
                                showIcon
                                title={`有 ${parsed.attributeMissing} 个字段在车上云商品属性库里不存在`}
                                description="这是字段名本身的问题，不是模板选择问题：该属性在系统里没有，填什么都传不上去。"
                            />
                        )}
                        <Table
                            size="small"
                            rowKey={(row, index) => `${row.rowNumber ?? 'x'}-${row.field ?? ''}-${index}`}
                            columns={columns}
                            dataSource={liveIssues}
                            pagination={compactPagination()}
                            scroll={{ y: MODAL_TABLE_SCROLL_Y }}
                        />
                    </>
                )}
            </div>
        </Modal>
    );
};

export default UploadFeedbackModal;
