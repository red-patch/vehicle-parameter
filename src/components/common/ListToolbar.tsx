import React, { type ReactNode } from 'react';

/**
 * 列表页容器 + 工具条（设计：docs/plans/2026-10-15-ui-构件规范-design.md §4.4）。
 *
 * 为什么要有它：本仓库此前有**两套结构在做同一件事**——
 * ① `FilterBar`（无标题：筛选在左、操作按钮在右，同一行）
 * ② `Card title={…} extra={…}`（标题+按钮一行，筛选另起一行）
 * 二者只差一个标题，却长得不像。`ListToolbar` 合并为一套：**它就是列表页的外壳**，
 * 标题行 / 筛选行按需出现，表格等内容作为 children 落在最内层。
 *
 * ```
 * ┌────────────────────────────────────────────────────┐
 * │ 公告归档                    [导入][批量][迁移][刷新] │  ← title + actions（都省略则整行不渲染）
 * ├────────────────────────────────────────────────────┤
 * │ [分组|平铺]  全部 有PDF 无PDF      [搜索____]        │  ← filters（省略则整行不渲染）
 * ├────────────────────────────────────────────────────┤
 * │ children（表格等）                                  │
 * └────────────────────────────────────────────────────┘
 * ```
 *
 * 只传 `filters`、不传 children 时退化为一条筛选带（等价旧 `FilterBar`）。
 * 本构件只管**三段怎么摆**；控件形态由 SearchInput / FacetChips / FilterItem 决定。
 */

export interface ListToolbarProps {
    /** 标题区：字符串或节点（可含计数徽标、路径等） */
    title?: ReactNode;
    /** 右侧操作按钮区（导出/刷新/新建等） */
    actions?: ReactNode;
    /**
     * 筛选控件区，自动排成一行。推荐用 `<FilterItem label="搜索">` 包控件；
     * 不带标签时直接传控件亦可。
     */
    filters?: ReactNode;
    /** 列表主体（表格等）；省略则只渲染工具条本身 */
    children?: ReactNode;
    /** 主体是否加内边距；表格类内容通常传 false 让表格贴边 */
    padded?: boolean;
    className?: string;
}

const ListToolbar: React.FC<ListToolbarProps> = ({
    title,
    actions,
    filters,
    children,
    padded = true,
    className = '',
}) => {
    const hasHead = Boolean(title || actions);
    const hasFilters = Boolean(filters);
    const hasBody = Boolean(children);
    // 分隔线只在「后面还有内容」时出现，否则末行会拖一条悬空的下边框
    const divider = 'border-b border-default';

    return (
        <div className={`surface-container border border-default rounded-lg ${className}`}>
            {hasHead && (
                <div
                    className={`flex items-center justify-between gap-3 px-3 py-2 ${
                        hasFilters || hasBody ? divider : ''
                    }`}
                >
                    <div className="min-w-0 flex items-center gap-2">{title}</div>
                    {actions && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>
                    )}
                </div>
            )}
            {hasFilters && (
                <div
                    className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 ${
                        hasBody ? divider : ''
                    }`}
                >
                    {filters}
                </div>
            )}
            {hasBody && <div className={padded ? 'p-3' : ''}>{children}</div>}
        </div>
    );
};

export default ListToolbar;
