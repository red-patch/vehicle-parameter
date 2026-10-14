import React from 'react';
import AssetGroupHeader from './AssetGroupHeader';
import { ASSET_GROUP_LABELS, type AssetGroupNode } from '../../../utils/assetGrouping';
import type { VehicleGroup } from '../../../utils/assetGovernance';
import type { AssetFileInfo } from '../../../utils/assetManager';

/**
 * 多层分组的递归渲染（设计文档 2026-10-14-asset-pool-multigroup-views-design §3.1）：
 * 组头（可折叠，层级缩进）+ 叶子网格 / 下层子树。
 * 折叠状态、展开判定、卡片渲染全部由父组件以回调注入，保持本组件纯渲染。
 */
export interface AssetGroupTreeProps {
    nodes: AssetGroupNode[];
    level: number;
    /** 有筛选/搜索时强制展开 */
    forceExpand: boolean;
    isCollapsed: (pathKey: string) => boolean;
    onToggle: (pathKey: string) => void;
    onActivateLatest: (group: VehicleGroup) => void;
    /** 重命名车型组（仅车型维度组头显示入口）；未传则组头不显示该入口 */
    onRenameGroup?: (group: VehicleGroup) => void;
    /** 批量维护本组资产字段（仅车型维度组头显示入口）；未传则不显示 */
    onBulkEditFields?: (group: VehicleGroup) => void;
    /** 单张卡片渲染（复用父组件既有的一整套 props 装配） */
    renderCard: (info: AssetFileInfo) => React.ReactNode;
    /** 网格列模板 */
    gridTemplateColumns: string;
}

const AssetGroupTree: React.FC<AssetGroupTreeProps> = ({
    nodes, level, forceExpand, isCollapsed, onToggle, onActivateLatest, onRenameGroup, onBulkEditFields, renderCard, gridTemplateColumns,
}) => (
    <div className={level === 0 ? 'space-y-3' : 'space-y-2'}>
        {nodes.map(node => {
            const collapsed = !forceExpand && isCollapsed(node.pathKey);
            const expanded = !collapsed;
            // 非叶子：先看本层是否有 rows（叶子）；否则递归子节点
            const isLeaf = !node.children || node.children.length === 0;
            const count = isLeaf
                ? (node.rows?.length ?? 0)
                : (node.children?.reduce((sum, c) => sum + countRows(c), 0) ?? 0);
            return (
                <div key={node.pathKey}>
                    <AssetGroupHeader
                        label={node.label}
                        count={count}
                        expanded={expanded}
                        onToggle={() => onToggle(node.pathKey)}
                        level={level}
                        dimLabel={ASSET_GROUP_LABELS[node.dim]}
                        vehicleGroup={node.vehicleGroupKey ? { groupKey: node.vehicleGroupKey, files: [] } : undefined}
                        onActivateLatest={node.vehicleGroupKey ? onActivateLatest : undefined}
                        onRenameGroup={node.vehicleGroupKey ? onRenameGroup : undefined}
                        onBulkEditFields={node.vehicleGroupKey ? onBulkEditFields : undefined}
                    />
                    {expanded && (
                        isLeaf ? (
                            <div className="grid gap-2.5 mt-1.5" style={{ gridTemplateColumns, paddingLeft: (level) * 16 }}>
                                {node.rows!.map(row => renderCard(row.info))}
                            </div>
                        ) : (
                            <div className="mt-1.5">
                                <AssetGroupTree
                                    nodes={node.children!}
                                    level={level + 1}
                                    forceExpand={forceExpand}
                                    isCollapsed={isCollapsed}
                                    onToggle={onToggle}
                                    onActivateLatest={onActivateLatest}
                                    onRenameGroup={onRenameGroup}
                                    onBulkEditFields={onBulkEditFields}
                                    renderCard={renderCard}
                                    gridTemplateColumns={gridTemplateColumns}
                                />
                            </div>
                        )
                    )}
                </div>
            );
        })}
    </div>
);

/** 递归统计节点的行数（递归函数需在组件外声明以便复用） */
function countRows(node: AssetGroupNode): number {
    if (node.children && node.children.length > 0) {
        return node.children.reduce((sum, c) => sum + countRows(c), 0);
    }
    return node.rows?.length ?? 0;
}

export default AssetGroupTree;
