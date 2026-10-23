import React, { useState } from 'react';
import { Select, Button, Popover, Input, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import type { FieldSourceRule } from '../../utils/fieldLists';

/**
 * 字段取值来源编辑器（核心字段配置表格的一列）。
 *
 * 1 对 N 是常态：
 * - 候选：同一个目标字段在不同车型上叫法不同（A 车「颜色」、B 车「车颜色」）
 * - 组合：一个目标字段由多个资产字段拼成（外扩尺寸 ← 长×宽×高），需显式给模板
 *
 * 设计：docs/plans/2026-10-19-车上云模板导出-design.md
 */
interface FieldSourceEditorProps {
    /** 自动解析出的来源（未配置时展示，作为占位提示） */
    resolved: string[];
    suggested?: boolean;
    rule?: FieldSourceRule;
    candidates: string[];
    onChange: (rule: FieldSourceRule | null) => void;
}

const FieldSourceEditor: React.FC<FieldSourceEditorProps> = ({
    resolved, suggested, rule, candidates, onChange,
}) => {
    const [open, setOpen] = useState(false);
    // 编辑中的草稿：点确定才写回，避免每改一下都触发整表重算
    const [draft, setDraft] = useState<FieldSourceRule>(
        rule ?? { candidates: resolved.length ? resolved : [] },
    );

    const handleOpenChange = (next: boolean) => {
        if (next) setDraft(rule ?? { candidates: resolved.length ? resolved : [] });
        setOpen(next);
    };

    const updateCandidate = (index: number, value: string) => {
        setDraft(prev => {
            const next = [...prev.candidates];
            next[index] = value;
            return { ...prev, candidates: next };
        });
    };

    const addCandidate = () => setDraft(prev => ({ ...prev, candidates: [...prev.candidates, ''] }));
    const removeCandidate = (index: number) =>
        setDraft(prev => ({ ...prev, candidates: prev.candidates.filter((_, i) => i !== index) }));

    const content = (
        <div style={{ width: 340 }} className="flex flex-col gap-2">
            <div className="text-aux text-3">
                按顺序尝试；未填组合模板时取第一个命中的字段
            </div>
            {draft.candidates.length === 0 && (
                <div className="text-aux text-3">还没有候选字段，先添加一个</div>
            )}
            <div className="flex flex-col gap-1.5 w-full">
                {draft.candidates.map((candidate, index) => (
                    <div key={index} className="flex items-center gap-1">
                        <span className="text-aux text-3 tabular-nums" style={{ width: 16 }}>{index + 1}</span>
                        <Select
                            showSearch
                            style={{ flex: 1 }}
                            value={candidate || undefined}
                            placeholder="选择车型资产字段"
                            optionFilterProp="label"
                            options={candidates.map(name => ({ value: name, label: name }))}
                            onChange={value => updateCandidate(index, value)}
                        />
                        <Button
                            type="text"
                            size="small"
                            aria-label="移除候选"
                            icon={<DeleteOutlined />}
                            onClick={() => removeCandidate(index)}
                        />
                    </div>
                ))}
            </div>
            <Button size="small" icon={<PlusOutlined />} onClick={addCandidate}>添加候选字段</Button>
            <div className="flex items-center gap-2">
                <span className="text-aux text-3 whitespace-nowrap">组合模板</span>
                <Input
                    size="small"
                    value={draft.template ?? ''}
                    placeholder="如 {0}×{1}×{2}（留空 = 只取一个）"
                    onChange={e => setDraft(prev => ({ ...prev, template: e.target.value }))}
                />
            </div>
            <div className="flex justify-end gap-2">
                <Button size="small" onClick={() => setOpen(false)}>取消</Button>
                <Button
                    size="small"
                    type="primary"
                    onClick={() => {
                        const cleaned = draft.candidates.map(c => c.trim()).filter(Boolean);
                        const template = (draft.template ?? '').trim();
                        onChange(cleaned.length ? { candidates: cleaned, ...(template ? { template } : {}) } : null);
                        setOpen(false);
                    }}
                >
                    确定
                </Button>
                {rule && (
                    <Button size="small" danger onClick={() => { onChange(null); setOpen(false); }}>
                        恢复自动
                    </Button>
                )}
            </div>
        </div>
    );

    const label = resolved.length === 0
        ? <span className="text-danger">未匹配</span>
        : (
            <span className={suggested ? 'text-warning' : 'text-1'}>
                {resolved.join(rule?.template ? ` ${rule.template} ` : ' / ')}
                {suggested && <Tooltip title="来自模糊建议，建议点开确认"><span className="ml-1 text-aux">?</span></Tooltip>}
            </span>
        );

    return (
        <Popover
            open={open}
            onOpenChange={handleOpenChange}
            trigger="click"
            placement="bottomLeft"
            content={content}
            title="取值来源"
        >
            <span className="cursor-pointer inline-flex items-center gap-1 min-w-0">
                {label}
                {rule && <span className="text-aux text-3 text-xs">已配置</span>}
            </span>
        </Popover>
    );
};

export default FieldSourceEditor;
