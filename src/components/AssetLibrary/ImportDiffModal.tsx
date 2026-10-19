import React, { useMemo } from 'react';
import { Modal, Table, Tag, Empty, Tooltip } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import type { SheetData } from '../../types';
import { compareSheets } from '../../utils/comparator';
import { compactPagination, MODAL_TABLE_SCROLL_Y } from '../common/tablePresets';

interface ImportDiffModalProps {
    open: boolean;
    baseFileName: string;
    targetName: string;
    /** 现有资产（基准） */
    base: SheetData | null;
    /** 本次导入数据（候选） */
    target: SheetData | null;
    onClose: () => void;
}

interface DiffRow {
    key: string;
    kind: 'modified' | 'added' | 'removed';
    name: string;
    oldValue: string;
    newValue: string;
}

const isEmptyValue = (v: unknown): boolean => String(v ?? '').trim() === '';

/**
 * 导入预览逐行 diff：现有资产 vs 本次导入数据。
 * 与 DiffResultView 不同，这里传入两份 SheetData 纯展示，不读 store。
 * Excel 模板带来的「新增但无值」字段不算差异（两边都是空，纯结构噪音），只计数展示。
 */
const ImportDiffModal: React.FC<ImportDiffModalProps> = ({ open, baseFileName, targetName, base, target, onClose }) => {
    const { rows, stubCount, unchangedCount, noSubstantive } = useMemo(() => {
        if (!base || !target) return { rows: [] as DiffRow[], stubCount: 0, unchangedCount: 0, noSubstantive: false };
        const result = compareSheets(base, target, 'content');
        // 「新增但无值」= 模板结构差异，不列为数据差异
        const stubs = result.added.filter(p => isEmptyValue(p.value));
        const substantiveAdded = result.added.filter(p => !isEmptyValue(p.value));
        const rows: DiffRow[] = [
            ...result.modified.map(m => ({
                key: `m-${m.id}`,
                kind: 'modified' as const,
                name: m.newParam?.name || m.oldParam?.name || '',
                oldValue: String(m.oldParam?.value ?? ''),
                newValue: String(m.newParam?.value ?? ''),
            })),
            ...substantiveAdded.map(p => ({
                key: `a-${p.id}`,
                kind: 'added' as const,
                name: p.name,
                oldValue: '',
                newValue: String(p.value ?? ''),
            })),
            ...result.removed.map(p => ({
                key: `r-${p.id}`,
                kind: 'removed' as const,
                name: p.name,
                oldValue: String(p.value ?? ''),
                newValue: '',
            })),
        ];
        return {
            rows,
            stubCount: stubs.length,
            unchangedCount: result.unchanged.length,
            noSubstantive: result.modified.length === 0 && result.removed.length === 0 && substantiveAdded.length === 0,
        };
    }, [base, target]);

    const counts = useMemo(() => ({
        modified: rows.filter(r => r.kind === 'modified').length,
        added: rows.filter(r => r.kind === 'added').length,
        removed: rows.filter(r => r.kind === 'removed').length,
    }), [rows]);

    return (
        <Modal
            open={open}
            title={`参数差异：${baseFileName} → ${targetName}`}
            width={720}
            onCancel={onClose}
            footer={null}
            destroyOnHidden
        >
            {!base || !target ? (
                <Empty description="无法加载对比数据" />
            ) : (
                <>
                    <div className="flex items-center gap-2 mb-3 text-[12px] flex-wrap">
                        <Tag color="warning" className="m-0">变更 {counts.modified}</Tag>
                        <Tag color="success" className="m-0">新增 {counts.added}</Tag>
                        <Tag color="error" className="m-0">缺失 {counts.removed}</Tag>
                        {stubCount > 0 && (
                            <Tooltip title="导入模板比现有资产多出的字段，但没有填任何值——纯模板结构差异，不算数据变化">
                                <Tag className="m-0 cursor-help">空模板字段 {stubCount}</Tag>
                            </Tooltip>
                        )}
                        <span className="text-3">仅列出有差异的参数，其余 {unchangedCount} 项一致</span>
                    </div>
                    {noSubstantive && (
                        <div className="mb-3 text-[12px] text-[color:var(--success-text,var(--text-2))] surface-inset border border-[color:var(--success,#52c41a)] rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                            <CheckCircleOutlined />
                            <span>
                                无实质数据差异：导入内容与现有资产一致{stubCount > 0 ? `，仅多出 ${stubCount} 个空模板字段` : ''}。可直接「跳过」。
                            </span>
                        </div>
                    )}
                    <Table<DiffRow>
                        size="small"
                        rowKey="key"
                        dataSource={rows}
                        pagination={compactPagination()}
                        columns={[
                            {
                                title: '差异',
                                dataIndex: 'kind',
                                width: 64,
                                render: (k: DiffRow['kind']) => (
                                    k === 'modified' ? <Tag color="warning" className="m-0">变更</Tag>
                                        : k === 'added' ? <Tag color="success" className="m-0">新增</Tag>
                                            : <Tag color="error" className="m-0">缺失</Tag>
                                ),
                            },
                            { title: '参数', dataIndex: 'name', ellipsis: true },
                            { title: '现有值', dataIndex: 'oldValue', ellipsis: true, render: v => v || <span className="text-3">—</span> },
                            { title: '导入值', dataIndex: 'newValue', ellipsis: true, render: v => v || <span className="text-3">—</span> },
                        ]}
                        scroll={{ y: MODAL_TABLE_SCROLL_Y }}
                        locale={{ emptyText: '无数据差异' }}
                    />
                </>
            )}
        </Modal>
    );
};

export default ImportDiffModal;
