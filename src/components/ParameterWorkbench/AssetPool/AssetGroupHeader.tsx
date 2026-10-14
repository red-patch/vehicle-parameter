import React from 'react';
import { Tooltip } from 'antd';
import { CaretRightOutlined, CaretDownOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { VehicleGroup } from '../../../utils/assetGovernance';

/**
 * 分组组头（设计文档 2026-10-14-asset-pool-grouping-design §3.3）：
 * 折叠箭头 + 维度标签（弱化） + 组名 + 计数 + 右延伸分隔线。
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
    /** 维度标签（如「车型」「主机厂」）；不分组时为 undefined */
    dimLabel?: string;
    /** 车型维度的组实体（供 ⚡ 激活最新版）；其他维度为 undefined */
    vehicleGroup?: VehicleGroup;
    onActivateLatest?: (group: VehicleGroup) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
}

const AssetGroupHeader: React.FC<AssetGroupHeaderProps> = ({
    label, count, expanded, onToggle, dimLabel, vehicleGroup, onActivateLatest, onContextMenu,
}) => (
    <div
        className="flex items-center gap-2 px-1 py-1.5 cursor-pointer select-none group/header rounded hover:surface-inset transition-colors duration-150"
        style={{ transitionTimingFunction: 'var(--ease-ui)' }}
        onClick={onToggle}
        onContextMenu={onContextMenu}
    >
        <span className="text-[11px] text-3 w-3 flex items-center justify-center flex-shrink-0">
            {expanded ? <CaretDownOutlined /> : <CaretRightOutlined />}
        </span>
        {dimLabel && <span className="text-caption text-3 flex-shrink-0">{dimLabel} ·</span>}
        <span className="text-title text-1 truncate" title={label}>{label || '全部'}</span>
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

        <div className="flex-1 h-px bg-[var(--border-default)] ml-1" />
    </div>
);

export default AssetGroupHeader;
