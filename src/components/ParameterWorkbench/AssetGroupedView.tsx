import React from 'react';
import { Button, Checkbox, Tag } from 'antd';
import {
  CaretRightOutlined, CloseCircleOutlined, HistoryOutlined, StopOutlined, PlusSquareOutlined,
  MinusSquareOutlined, ThunderboltOutlined, EditOutlined,
  ApartmentOutlined, CheckSquareOutlined,
} from '@ant-design/icons';
import type { AssetFileInfo } from '../../utils/assetManager';
import type { GovernanceFileEntry, VehicleGroup } from '../../utils/assetGovernance';

// ============================================================
// 性能注记（2026-10-01，532 资产实测展开/收起卡顿）：
// 1) GroupHeader / GroupFileRow 用自定义 comparator 的 React.memo——
//    右键菜单等 handler 是"每次父渲染都重建的闭包"，不能参与比较；
//    它们的行为输入（meta/标签/激活态）全部反映在被比较的数据 props 上
//    （entry 引用含 meta，tags 引用随 assetTags 变化），因此跳过重渲染是安全的。
// 2) 右键菜单闭包改为点击时构建（onContextMenu={e => builder(info)(e)}），
//    不再在渲染期为每行创建。
// 3) 行内信息提示全部用原生 title 替代 antd Tooltip——532 行 × 6~8 个
//    Tooltip ≈ 3000+ 组件是重渲染的主要成本；组头同理。
// ============================================================

interface AssetGroupedViewProps {
    /** 已按筛选裁剪 + 组内排序后的车型组（displayName = 别名覆盖或推导键） */
    groups: (VehicleGroup & { displayName: string })[];
    focusedFile: string | null;
    /** 已激活（在工作区）的文件名集合 */
    activeFileNames: Set<string>;
    /** 资产标签映射（行内展示用） */
    assetTags: Record<string, string[]>;
    batchMode: boolean;
    selectedFileNames: Set<string>;
    /** 用户显式展开的组（本地记忆） */
    expandedKeys: Set<string>;
    /** 有筛选条件时命中组自动展开 */
    filtersActive: boolean;
    /** 每车链头文件名集合（ADR-0003：最新版徽章与激活入口） */
    latestFileNames: Set<string>;
    onToggleGroup: (key: string) => void;
    onFocusFile: (fileName: string | null) => void;
    onToggleAsset: (info: AssetFileInfo, currentlyActive: boolean) => void;
    /** ⚡激活组内每辆车的最新版本 */
    onActivateLatest: (group: VehicleGroup) => void;
    /** 行双击打开资产检查器（设计文档 §3.3 入口） */
    onOpenInspector: (info: AssetFileInfo) => void;
    onToggleBatchSelected: (fileName: string, checked: boolean) => void;
    /** 行右键菜单：info → 菜单处理器（点击时才调用构建，不在渲染期） */
    onRowContextMenu: (info: AssetFileInfo) => (e: React.MouseEvent) => void;
    /** 组头右键菜单 */
    onHeaderContextMenu: (group: VehicleGroup & { displayName: string }) => (e: React.MouseEvent) => void;
    /** 重命名车型（组头 hover 编辑按钮入口） */
    onRenameGroup: (group: VehicleGroup & { displayName: string }) => void;
    /** 组属性编辑（主机厂/车型族群，组级受控属性） */
    onEditGroupFacets?: (group: VehicleGroup & { displayName: string }) => void;
    /** 批量维护本组资产字段（组头 hover 按钮入口） */
    onBulkEditFields?: (group: VehicleGroup & { displayName: string }) => void;
}

const fillPercent = (info: AssetFileInfo) =>
    info.totalParams > 0 ? Math.round((info.filledParams / info.totalParams) * 100) : 0;

const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

interface GroupHeaderProps {
    group: VehicleGroup & { displayName: string };
    expanded: boolean;
    /** 组内是否有激活资产（参与 memo 比较：⚡激活判断依赖它） */
    hasActive: boolean;
    /** 组内已激活文件数（设计文档 §3.5：组头「已选 N」角标） */
    activeCount: number;
    /** 组内车辆数（每车链头数，参与 memo 比较：⚡disabled 依赖它） */
    latestCount: number;
    onToggleGroup: (key: string) => void;
    onActivateLatest: (group: VehicleGroup & { displayName: string }) => void;
    onHeaderContextMenu: (group: VehicleGroup & { displayName: string }) => (e: React.MouseEvent) => void;
    onRenameGroup: (group: VehicleGroup & { displayName: string }) => void;
    onEditGroupFacets?: (group: VehicleGroup & { displayName: string }) => void;
    onBulkEditFields?: (group: VehicleGroup & { displayName: string }) => void;
}

/** 组头：车型名 + 车辆数 + 状态角标 + ⚡激活每车最新版 + 组属性/重命名入口 */
const GroupHeaderImpl: React.FC<GroupHeaderProps> = ({
    group, expanded, activeCount, latestCount, onToggleGroup, onActivateLatest, onHeaderContextMenu, onRenameGroup, onEditGroupFacets, onBulkEditFields,
    // hasActive 仅参与 memo 比较（⚡激活判断依赖它），不参与渲染
}) => {
    const nRejected = group.files.filter(f => f.info.approvalStatus === '驳回').length;
    const nDeprecated = group.files.filter(f => f.meta.status === 'deprecated').length;

    return (
        <div
            onClick={() => onToggleGroup(group.groupKey)}
            onContextMenu={e => onHeaderContextMenu(group)(e)}
            className="group flex items-center gap-2 px-2.5 py-1.5 rounded-lg surface-inset border border-default cursor-pointer hover:border-line-strong select-none"
        >
            <CaretRightOutlined className={`text-[11px] text-3 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`} />
            <span
                className="text-[13px] font-semibold text-1 truncate"
                title={group.displayName !== group.groupKey ? `${group.displayName}（归组键：${group.groupKey}）` : group.displayName}
            >
                {group.displayName}
            </span>
            {activeCount > 0 && (
                <span
                    className="flex items-center gap-0.5 flex-shrink-0 text-[11px] text-success-text font-medium"
                    title={`组内已激活 ${activeCount} 份资产`}
                >
                    <CheckSquareOutlined className="text-[10px]" />已选 {activeCount}
                </span>
            )}
            <span className="text-[11px] text-3 flex-shrink-0 tabular-nums" title={`${latestCount} 辆车（每车一份最新版）`}>
                {latestCount} 辆车
            </span>
            {nRejected > 0 && (
                <span className="text-[11px] text-warning-text flex items-center gap-0.5 flex-shrink-0" title={`${nRejected} 个驳回件`}>
                    <CloseCircleOutlined className="text-[11px]" />{nRejected}
                </span>
            )}
            {nDeprecated > 0 && (
                <span className="text-[11px] text-3 flex items-center gap-0.5 flex-shrink-0" title={`${nDeprecated} 个已废弃`}>
                    <StopOutlined className="text-[11px]" />{nDeprecated}
                </span>
            )}
            <span className="flex-1" />
            {onBulkEditFields && (
                <Button
                    type="text" size="small" title="批量维护本组资产的字段值"
                    icon={<EditOutlined className="!text-[12px] text-2 hover:text-brand" />}
                    onClick={(e) => { e.stopPropagation(); onBulkEditFields(group); }}
                    className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                />
            )}
            {onEditGroupFacets && (
                <Button
                    type="text" size="small" title="组属性（主机厂 / 车型族群）"
                    icon={<ApartmentOutlined className="!text-[12px] text-2 hover:text-brand" />}
                    onClick={(e) => { e.stopPropagation(); onEditGroupFacets(group); }}
                    className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
                />
            )}
            <Button
                type="text" size="small" title="重命名车型（组内文件名一并修正）"
                icon={<EditOutlined className="!text-[12px] text-2 hover:text-brand" />}
                onClick={(e) => { e.stopPropagation(); onRenameGroup(group); }}
                className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
            />
            <Button
                type="text" size="small"
                title={latestCount > 0 ? `激活组内 ${latestCount} 辆车的最新版本` : '该组暂无可激活的文件'}
                icon={<ThunderboltOutlined className={latestCount > 0 ? '!text-[13px] text-brand' : '!text-[13px] text-3'} />}
                disabled={latestCount === 0}
                onClick={(e) => { e.stopPropagation(); onActivateLatest(group); }}
                className="w-6 h-6 p-0 min-w-0 flex items-center justify-center rounded-md"
            />
        </div>
    );
};

/** 仅比较数据 props（见文件头性能注记 1：handler 闭包不参与比较是安全的） */
const GroupHeader = React.memo(GroupHeaderImpl, (a, b) =>
    a.group === b.group
    && a.expanded === b.expanded
    && a.hasActive === b.hasActive
    && a.activeCount === b.activeCount
    && a.latestCount === b.latestCount
    && Boolean(a.onEditGroupFacets) === Boolean(b.onEditGroupFacets)
    && Boolean(a.onBulkEditFields) === Boolean(b.onBulkEditFields));

interface GroupFileRowProps {
    entry: GovernanceFileEntry;
    active: boolean;
    focused: boolean;
    batchMode: boolean;
    checked: boolean;
    tags: string[];
    /** 是否为本车版本链头（最新版徽章） */
    isLatest: boolean;
    onRowContextMenu: (info: AssetFileInfo) => (e: React.MouseEvent) => void;
    onFocusFile: (fileName: string | null) => void;
    onToggleAsset: (info: AssetFileInfo, currentlyActive: boolean) => void;
    /** 行双击打开资产检查器 */
    onOpenInspector: (info: AssetFileInfo) => void;
    onToggleBatchSelected: (fileName: string, checked: boolean) => void;
}

/** 组内紧凑行：最新版徽章 + 文件名 + 标签 + 状态图标 + 填充率 + 日期 + hover 快捷操作 */
const GroupFileRowImpl: React.FC<GroupFileRowProps> = ({
    entry, active, focused, batchMode, checked, tags, isLatest, onRowContextMenu, onFocusFile, onToggleAsset, onOpenInspector, onToggleBatchSelected,
}) => {
    const { info, meta } = entry;
    return (
        <div
            data-asset-file={info.fileName}
            onClick={() => onFocusFile(info.fileName)}
            onDoubleClick={() => onOpenInspector(info)}
            onContextMenu={e => onRowContextMenu(info)(e)}
            className={`flex items-center gap-1.5 pl-[46px] pr-2 py-1 rounded-md group cursor-pointer border border-transparent ${
                // 已选（active）与焦点（focused）正交：聚焦不再顶掉已选左色条（设计文档 §3.5）
                focused
                    ? `surface-container border-brand ring-1 ring-brand ${active ? 'edge-success' : ''}`
                    : active
                        ? 'edge-success hover:border-line-strong'
                        : 'hover:surface-inset hover:border-default'
            }`}
        >
            {batchMode && (
                <Checkbox
                    checked={checked}
                    onChange={e => onToggleBatchSelected(info.fileName, e.target.checked)}
                    onClick={e => e.stopPropagation()}
                    className="flex-shrink-0"
                />
            )}
            {isLatest && (
                <span title="本车最新版本（版本链链头）" className="flex-shrink-0">
                    <Tag className="m-0 text-[10px] leading-[14px] px-1 rounded text-brand border-brand font-medium">最新</Tag>
                </span>
            )}
            <span
                className={`text-[12px] truncate min-w-0 flex-1 ${focused ? 'text-1 font-semibold' : 'text-2'}`}
                title={info.productName}
            >
                {info.productName}
            </span>
            {tags.length > 0 && (
                <span
                    className="flex items-center gap-0.5 flex-shrink-0"
                    title={`标签：${tags.join('、')}`}
                >
                    {tags.slice(0, 2).map(tag => (
                        <Tag key={tag} className="m-0 text-[10px] leading-[14px] px-1 rounded surface-inset border-default text-3 max-w-[72px] overflow-hidden">
                            <span className="truncate inline-block align-bottom">{tag}</span>
                        </Tag>
                    ))}
                    {tags.length > 2 && <span className="text-[10px] text-3">+{tags.length - 2}</span>}
                </span>
            )}
            {info.approvalStatus === '驳回' && (
                <span title="准入审批驳回"><CloseCircleOutlined className="text-[11px] text-warning-text flex-shrink-0" /></span>
            )}
            {meta.status === 'superseded' && (
                <span title="历史版本"><HistoryOutlined className="text-[11px] text-3 flex-shrink-0" /></span>
            )}
            {meta.status === 'deprecated' && (
                <span title="已废弃"><StopOutlined className="text-[11px] text-3 flex-shrink-0" /></span>
            )}
            <span
                className="text-[11px] text-3 flex-shrink-0 tabular-nums w-8 text-right"
                title={`已填 ${info.filledParams}/${info.totalParams}`}
            >
                {fillPercent(info)}%
            </span>
            {info.updatedAt && (
                <span className="text-[11px] text-3 flex-shrink-0 tabular-nums hidden @[360px]:inline">{formatDate(info.updatedAt)}</span>
            )}
            {/* hover 快捷操作：只留激活/移出一个（设计文档 §3.4），其余进资产检查器 */}
            <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <Button
                    type="text" size="small"
                    title={active ? '移出车型列' : '添加至车型列'}
                    icon={active
                        ? <MinusSquareOutlined className="!text-[12px] text-2 hover:text-danger" />
                        : <PlusSquareOutlined className="!text-[12px] text-2 hover:text-brand" />}
                    onClick={(e) => { e.stopPropagation(); onToggleAsset(info, active); }}
                    className="w-5 h-5 p-0 min-w-0 flex items-center justify-center rounded"
                />
            </span>
        </div>
    );
};

/** 仅比较数据 props（见文件头性能注记 1） */
const GroupFileRow = React.memo(GroupFileRowImpl, (a, b) =>
    a.entry === b.entry
    && a.active === b.active
    && a.focused === b.focused
    && a.batchMode === b.batchMode
    && a.checked === b.checked
    && a.tags === b.tags
    && a.isLatest === b.isLatest);

/** 车型分组视图：一级车型组（可展开收起），二级紧凑文件行 */
const AssetGroupedView: React.FC<AssetGroupedViewProps> = ({
    groups, focusedFile, activeFileNames, assetTags, batchMode, selectedFileNames,
    expandedKeys, filtersActive, latestFileNames, onToggleGroup, onFocusFile, onToggleAsset,
    onActivateLatest, onOpenInspector, onToggleBatchSelected, onRowContextMenu,
    onHeaderContextMenu, onRenameGroup, onEditGroupFacets, onBulkEditFields,
}) => {
    return (
        <div className="space-y-1.5">
            {groups.map(group => {
                const expanded = expandedKeys.has(group.groupKey) || filtersActive;
                const activeCount = group.files.filter(f => activeFileNames.has(f.info.fileName)).length;
                const hasActive = activeCount > 0;
                const latestCount = group.files.filter(f => latestFileNames.has(f.info.fileName)).length;
                return (
                    <div
                        key={group.groupKey}
                        className={`rounded-lg border px-1.5 py-1 ${
                            hasActive ? 'border-default edge-success' : 'border-transparent'
                        }`}
                    >
                        <GroupHeader
                            group={group}
                            expanded={expanded}
                            hasActive={hasActive}
                            activeCount={activeCount}
                            latestCount={latestCount}
                            onToggleGroup={onToggleGroup}
                            onActivateLatest={onActivateLatest}
                            onHeaderContextMenu={onHeaderContextMenu}
                            onRenameGroup={onRenameGroup}
                            onEditGroupFacets={onEditGroupFacets}
                            onBulkEditFields={onBulkEditFields}
                        />
                        {/* 仅展开时挂载行：收起态的组曾用 grid-rows-[0fr] 视觉折叠，
                            行仍全部常驻（实测 158 组 × 均 3.3 行 = 677 行）。
                            改为条件挂载换取内存，代价是失去高度过渡动画（2026-10-08 已确认）。 */}
                        {expanded && (
                            <div className="mt-1 space-y-0.5">
                                {group.files.map(entry => (
                                    <GroupFileRow
                                        key={entry.info.fileName}
                                        entry={entry}
                                        active={activeFileNames.has(entry.info.fileName)}
                                        focused={focusedFile === entry.info.fileName}
                                        batchMode={batchMode}
                                        checked={selectedFileNames.has(entry.info.fileName)}
                                        tags={assetTags[entry.info.fileName] || []}
                                        isLatest={latestFileNames.has(entry.info.fileName)}
                                        onRowContextMenu={onRowContextMenu}
                                        onFocusFile={onFocusFile}
                                        onToggleAsset={onToggleAsset}
                                        onOpenInspector={onOpenInspector}
                                        onToggleBatchSelected={onToggleBatchSelected}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default AssetGroupedView;
