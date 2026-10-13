import React, { useState } from 'react';
import { Button, Checkbox, Input, Tag, Tooltip } from 'antd';
import { CloseOutlined, EditOutlined, TagsOutlined } from '@ant-design/icons';
import { parseBatchTagInput } from '../../utils/assetTagBatch';

export interface BatchTagGroup {
    id: string;
    name: string;
    tags: string[];
    /** 互斥组：添加组内标签会替换资产上该组的已有标签 */
    exclusive?: boolean;
}

interface AssetBatchTagBarProps {
    selectedCount: number;
    filteredCount: number;
    allSelected: boolean;
    indeterminate: boolean;
    onSelectAll: (checked: boolean) => void;
    onClearSelection: () => void;
    /** 退出批量模式（并清空选择） */
    onExit: () => void;
    /** 快捷标签分组（数据源同标签筛选栏） */
    groups: BatchTagGroup[];
    /** 应用标签到已选资产（合并语义，不覆盖已有标签） */
    onApplyTags: (tags: string[]) => void;
    /** 打开批量字段维护抽屉（参数行 + 受控属性统一批量改值） */
    onOpenFieldEditor?: () => void;
}

/**
 * 车型资产库批量打标签操作栏。
 * 常驻于批量选择模式下的资产列表顶部（sticky）：
 * 全选筛选结果 / 清除选择 / 标签输入（分隔符解析）+ 分组快捷标签 + 退出。
 */
const AssetBatchTagBar: React.FC<AssetBatchTagBarProps> = ({
    selectedCount,
    filteredCount,
    allSelected,
    indeterminate,
    onSelectAll,
    onClearSelection,
    onExit,
    groups,
    onApplyTags,
    onOpenFieldEditor,
}) => {
    const [batchTagInput, setBatchTagInput] = useState('');
    const noSelection = selectedCount === 0;

    const handleApplyInput = () => {
        const tags = parseBatchTagInput(batchTagInput);
        if (tags.length > 0) onApplyTags(tags);
        setBatchTagInput('');
    };

    return (
        <div className="mb-2 sticky top-0 z-10 surface-container border border-brand rounded-lg px-3 py-2 space-y-2 shadow-sm">
            <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 cursor-pointer">
                    <Checkbox
                        checked={allSelected}
                        indeterminate={indeterminate}
                        disabled={filteredCount === 0}
                        onChange={e => onSelectAll(e.target.checked)}
                        onClick={e => e.stopPropagation()}
                    />
                    <span className="text-[12px] text-2">全选筛选结果</span>
                </label>
                <span className="text-[12px] text-brand font-medium tabular-nums">
                    已选 {selectedCount} / {filteredCount}
                </span>
                <Tooltip title="取消全部勾选（保持批量模式）">
                    <span
                        className={`text-[12px] cursor-pointer hover:underline ${noSelection ? 'text-4 pointer-events-none' : 'text-3 hover:text-brand'}`}
                        onClick={onClearSelection}
                    >
                        清除选择
                    </span>
                </Tooltip>
                <div className="flex-1" />
                {onOpenFieldEditor && (
                    <Tooltip title="对已勾选的资产批量维护参数值或受控属性">
                        <Button
                            size="small"
                            icon={<EditOutlined className="!text-[12px]" />}
                            onClick={onOpenFieldEditor}
                            disabled={noSelection}
                        >
                            批量改字段
                        </Button>
                    </Tooltip>
                )}
                <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined className="!text-[12px]" />}
                    onClick={onExit}
                    className="text-[12px] text-2 hover:text-brand"
                >
                    完成
                </Button>
            </div>

            <div className="flex items-center gap-2">
                <TagsOutlined className="text-[12px] text-3 flex-shrink-0" />
                <Input
                    size="small"
                    value={batchTagInput}
                    onChange={e => setBatchTagInput(e.target.value)}
                    onPressEnter={handleApplyInput}
                    placeholder="输入标签，逗号/顿号/空格分隔，回车应用到已选"
                    className="flex-1 rounded-lg border-default"
                    disabled={noSelection}
                />
                <Tooltip title="普通标签合并添加；互斥组标签会替换组内已有标签">
                    <Button
                        size="small"
                        type="primary"
                        onClick={handleApplyInput}
                        disabled={noSelection || !batchTagInput.trim()}
                    >
                        添加到已选
                    </Button>
                </Tooltip>
            </div>

            {groups.length > 0 && (
                <div className="max-h-[88px] overflow-y-auto custom-scrollbar flex flex-col gap-1">
                    {groups.map(g => (
                        <div key={g.id} className="flex items-start gap-1.5">
                            <span className="text-[11px] text-3 mt-0.5 w-14 truncate flex-shrink-0 flex items-center gap-0.5" title={g.name}>
                                {g.name}
                                {g.exclusive && (
                                    <Tooltip title="互斥组：添加组内标签会替换组内已有标签">
                                        <span className="text-[10px] text-3 border border-default rounded px-0.5 leading-[13px] cursor-help flex-shrink-0">互斥</span>
                                    </Tooltip>
                                )}
                            </span>
                            <div className="flex flex-wrap gap-1">
                                {g.tags.map(t => (
                                    <Tag
                                        key={t}
                                        onClick={() => { if (!noSelection) onApplyTags([t]); }}
                                        className={`text-[11px] m-0 px-1.5 leading-[18px] rounded border ${
                                            noSelection
                                                ? 'surface-inset border-default text-4'
                                                : 'surface-inset border-default text-2 cursor-pointer hover:border-brand'
                                        }`}
                                    >
                                        +{t}
                                    </Tag>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default AssetBatchTagBar;
