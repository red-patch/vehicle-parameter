import React from 'react';
import { Tooltip } from 'antd';
import { CaretRightOutlined, CaretDownOutlined, EditOutlined, FormOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { VehicleGroup } from '../../../utils/assetGovernance';

/**
 * 分组组头（设计文档 2026-10-14-asset-pool-grouping-design §3.3
 * + 2026-10-14-asset-pool-multigroup-views-design §3.1 层级缩进）：
 * 折叠箭头 + 维度标签（弱化） + 组名 + 计数 + 右延伸分隔线。
 * 层级：level 0=一级（常规字重），level≥1 缩进（每级 +16px）且字号降一档。
 * 车型维度额外挂「⚡ 激活组内最新版」；其他维度组头无操作。
 * 曜蓝 v4.1：不引入新色；分隔线 --border-default；箭头 text-3。
 */
export interface AssetGroupHeaderProps {
    /** 组名（如「远程V6E」「吉利」「（无）」） */
    label: string;
    /** 计数 */
    count: number;
    expanded: boolean;
    onToggle: () => void;
    /** 层级（0 起）；用于缩进与字号。默认 0 */
    level?: number;
    /** 维度标签（如「车型」「主机厂」）；不分组时为 undefined */
    dimLabel?: string;
    /** 车型维度的组实体（供 ⚡ 激活最新版 / ✎ 重命名）；其他维度为 undefined */
    vehicleGroup?: VehicleGroup;
    onActivateLatest?: (group: VehicleGroup) => void;
    /** 重命名车型组（仅车型维度；写 meta.groupName，不改文件名） */
    onRenameGroup?: (group: VehicleGroup) => void;
    /** 批量维护本组资产字段值（仅车型维度；参数行 + 受控属性） */
    onBulkEditFields?: (group: VehicleGroup) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

/** 每级缩进 16px，用 padding-left 表达（与卡片区左缘对齐） */
const LEVEL_INDENT = 16;

const AssetGroupHeader: React.FC<AssetGroupHeaderProps> = ({
    label, count, expanded, onToggle, level = 0, dimLabel, vehicleGroup, onActivateLatest, onRenameGroup, onBulkEditFields, onContextMenu,
}) => (
    <div
        className="flex items-center gap-2 py-1.5 cursor-pointer select-none group/header rounded hover:surface-inset transition-colors duration-150"
        style={{ paddingLeft: 4 + level * LEVEL_INDENT, transitionTimingFunction: 'var(--ease-ui)' }}
        onClick={onToggle}
        onContextMenu={onContextMenu}
    >
        <span className="text-[11px] text-3 w-3 flex items-center justify-center flex-shrink-0">
            {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
        </span>
        {dimLabel && <span className="text-caption text-3 flex-shrink-0">{dimLabel} ·</span>}
        <span
            className={`${level === 0 ? 'text-title' : 'text-body'} ${level === 0 ? 'font-semibold' : 'font-medium'} text-1 truncate`}
            title={label}
        >
            {label || '全部'}
        </span>
        <span className="text-caption text-3 tabular-nums flex-shrink-0">{count}</span>

        {/* 车型维度：⚡ 激活组内最新版（hover 渐显） */}
        {vehicleGroup && onActivateLatest && (
            <Tooltip title="激活该车型组内每辆车的最新版">
                <span
                    className="opacity-0 group-hover/header:opacity-100 text-[12px] text-3 hover:text-brand flex-shrink-0 transition-opacity duration-150"
                    onClick={e => { e.stopPropagation(); onActivateLatest(vehicleGroup); }}
                >
                    <ThunderboltOutlined />
                </span>
            </Tooltip>
        )}

        {/* 车型维度：✎ 重命名组显示名（hover 渐显；只改显示名，不动文件名） */}
        {vehicleGroup && onRenameGroup && (
            <Tooltip title="重命名车型组（只改显示名，不改文件名）">
                <span
                    className="opacity-0 group-hover/header:opacity-100 text-[12px] text-3 hover:text-brand flex-shrink-0 transition-opacity duration-150"
                    onClick={e => { e.stopPropagation(); onRenameGroup(vehicleGroup); }}
                >
                    <EditOutlined />
                </span>
            </Tooltip>
        )}

        {/* 车型维度：批量维护本组资产字段（hover 渐显） */}
        {vehicleGroup && onBulkEditFields && (
            <Tooltip title="批量维护本组资产的字段值">
                <span
                    className="opacity-0 group-hover/header:opacity-100 text-[12px] text-3 hover:text-brand flex-shrink-0 transition-opacity duration-150"
                    onClick={e => { e.stopPropagation(); onBulkEditFields(vehicleGroup); }}
                >
                    <FormOutlined />
                </span>
            </Tooltip>
        )}

        <div className="flex-1 h-px bg-[var(--border-default)] ml-1" />
    </div>
);

export default AssetGroupHeader;
