import React, { useState } from 'react';
import { Popover, Modal, Input, Tooltip } from 'antd';
import { EyeOutlined, DeleteOutlined, EditOutlined, PlusOutlined, CopyOutlined } from '@ant-design/icons';
import type { AssetView } from '../../../utils/assetViews';

/**
 * 视图下拉（设计文档 2026-10-14-asset-pool-multigroup-views-design §3.2）：
 * 列出全部视图（内置在前 + 用户视图）→ 点选套用；行尾 ⋯ 管理（重命名/删除/另存）。
 * 顶部「＋ 保存当前视图」；当前视图被手改后显示「（已修改）」。
 */
export interface ViewDropdownProps {
    views: AssetView[];
    activeViewId: string | null;
    modified: boolean;
    onApply: (view: AssetView) => void;
    onSaveCurrent: () => void;
    onRename: (id: string, name: string) => void;
    onDelete: (id: string) => void;
    onSaveAs: (view: AssetView) => void;
    /** 覆盖保存当前（非内置）视图 */
    onOverwrite: () => void;
}

const ViewDropdown: React.FC<ViewDropdownProps> = ({
    views, activeViewId, modified, onApply, onSaveCurrent, onRename, onDelete, onSaveAs, onOverwrite,
}) => {
    const activeView = views.find(v => v.id === activeViewId) ?? null;
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

    const label = activeView ? `${activeView.name}${modified ? '（已修改）' : ''}` : '未命名视图';

    return (
        <>
            <Popover
                trigger="click"
                placement="bottomRight"
                content={
                    <div className="min-w-[220px] py-1">
                        {views.map(v => {
                            const active = v.id === activeViewId;
                            return (
                                <div
                                    key={v.id}
                                    className="group/view flex items-center gap-1 px-2 py-1 rounded cursor-pointer text-body hover:surface-inset"
                                    onClick={() => onApply(v)}
                                >
                                    <span className={`flex-1 truncate ${active ? 'text-brand font-medium' : 'text-1'}`} title={v.name}>
                                        {v.name}
                                        {v.builtin && <span className="ml-1 text-caption text-3">内置</span>}
                                    </span>
                                    {active && <span className="text-brand text-caption">✓</span>}
                                    <span className="opacity-0 group-hover/view:opacity-100 flex items-center gap-1">
                                        <Tooltip title="另存为">
                                            <span
                                                className="text-3 hover:text-brand text-caption"
                                                onClick={e => { e.stopPropagation(); onSaveAs(v); }}
                                            ><CopyOutlined /></span>
                                        </Tooltip>
                                        {!v.builtin && (
                                            <>
                                                <Tooltip title="重命名">
                                                    <span
                                                        className="text-3 hover:text-brand text-caption"
                                                        onClick={e => { e.stopPropagation(); setRenaming({ id: v.id, name: v.name }); }}
                                                    ><EditOutlined /></span>
                                                </Tooltip>
                                                <Tooltip title="删除">
                                                    <span
                                                        className="text-3 hover:text-danger text-caption"
                                                        onClick={e => { e.stopPropagation(); onDelete(v.id); }}
                                                    ><DeleteOutlined /></span>
                                                </Tooltip>
                                            </>
                                        )}
                                    </span>
                                </div>
                            );
                        })}
                        <div className="border-t border-[var(--border-default)] mt-1 pt-1">
                            {modified && activeView && !activeView.builtin && (
                                <div
                                    className="px-2 py-1 text-body text-brand cursor-pointer hover:surface-inset rounded flex items-center gap-1"
                                    onClick={onOverwrite}
                                >
                                    <EditOutlined className="text-[11px]" /> 更新视图「{activeView.name}」
                                </div>
                            )}
                            <div
                                className="px-2 py-1 text-body text-brand cursor-pointer hover:surface-inset rounded flex items-center gap-1"
                                onClick={onSaveCurrent}
                            >
                                <PlusOutlined className="text-[11px]" /> 保存当前视图
                            </div>
                        </div>
                    </div>
                }
            >
                <div
                    className="flex items-center gap-1 px-2 py-1 rounded-md border surface-container border-line text-2 hover:border-brand hover:text-brand cursor-pointer transition-colors duration-150 max-w-[160px]"
                    style={{ transitionTimingFunction: 'var(--ease-ui)' }}
                >
                    <EyeOutlined className="text-[11px] flex-shrink-0" />
                    <span className="truncate">{label}</span>
                </div>
            </Popover>

            {/* 重命名弹窗 */}
            <Modal
                title="重命名视图"
                open={Boolean(renaming)}
                onCancel={() => setRenaming(null)}
                onOk={() => { if (renaming && renaming.name.trim()) { onRename(renaming.id, renaming.name.trim()); setRenaming(null); } }}
                okText="保存"
                cancelText="取消"
                destroyOnClose
            >
                <Input
                    value={renaming?.name ?? ''}
                    onChange={e => setRenaming(prev => prev ? { ...prev, name: e.target.value } : prev)}
                    autoFocus
                />
            </Modal>
        </>
    );
};

export default ViewDropdown;
