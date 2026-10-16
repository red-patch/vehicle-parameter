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

/**
 * 筛选行的标签原语（原住 `common/FilterBar.tsx`，随该外壳退役迁到此处）。
 *
 * 统一补冒号：调用方写 `label="搜索"`，组件补成「搜索：」；已是冒号结尾的按原样
 * （幂等，避免「搜索：：」）。字号跟随「界面字号」设置。
 */
export interface FilterItemProps {
    /** 标签文字；**不要自带冒号**（组件统一补） */
    label?: ReactNode;
    children: ReactNode;
    className?: string;
}

/** 统一补冒号；已有冒号的旧写法按原样渲染（幂等） */
const withColon = (label: ReactNode): ReactNode => {
    if (typeof label !== 'string') return label;
    return /[:：]\s*$/.test(label) ? label : `${label}：`;
};

export const FilterItem: React.FC<FilterItemProps> = ({ label, children, className = '' }) => (
    <div className={`flex items-center gap-2 ${className}`}>
        {label && (
            <span
                className="font-semibold text-2 whitespace-nowrap"
                style={{ fontSize: 'var(--fs-body)' }}
            >
                {withColon(label)}
            </span>
        )}
        {children}
    </div>
);

export interface ListToolbarProps {
    /** 标题区：字符串或节点（可含计数徽标、路径等） */
    title?: ReactNode;
    /** 右侧操作按钮区（导出/刷新/新建等） */
    actions?: ReactNode;
    /**
     * ② 筛选控件区，自动排成一行。推荐用 `<FilterItem label="搜索">` 包控件；
     * 不带标签时直接传控件亦可。
     */
    filters?: ReactNode;
    /**
     * ③ 显示选项区（隐藏无值字段 / 按字段名合并 这类**只改呈现不改数据**的开关）。
     * 必须与 `filters` 分开成段——混在一起是最明显的语义混淆（§4.1）。
     */
    display?: ReactNode;
    /** 列表主体（表格等）；省略则只渲染工具条本身 */
    children?: ReactNode;
    /** 主体是否加内边距；表格类内容通常传 false 让表格贴边 */
    padded?: boolean;
    /**
     * 让主体撑满可用高度（外壳变 flex 纵向、主体 flex-1）。
     * 用于「表格在卡内自己滚动、页面不滚动」的页面——不传则外壳随内容增高。
     */
    fill?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

const ListToolbar: React.FC<ListToolbarProps> = ({
    title,
    actions,
    filters,
    display,
    children,
    padded = true,
    fill = false,
    className = '',
    style,
}) => {
    const hasHead = Boolean(title || actions);
    const hasFilters = Boolean(filters);
    const hasDisplay = Boolean(display);
    const hasBody = Boolean(children);
    // 分隔线只在「后面还有内容」时出现，否则末行会拖一条悬空的下边框
    const divider = 'border-b border-default';
    const rowCls = 'flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 shrink-0';

    return (
        <div
            className={`surface-container border border-default rounded-lg ${
                fill ? 'flex flex-col min-h-0 overflow-hidden' : ''
            } ${className}`}
            style={style}
        >
            {hasHead && (
                <div
                    className={`flex items-center justify-between gap-3 px-3 py-2 shrink-0 ${
                        hasFilters || hasDisplay || hasBody ? divider : ''
                    }`}
                >
                    <div className="min-w-0 flex items-center gap-2">{title}</div>
                    {actions && (
                        <div className="flex items-center gap-1.5 flex-shrink-0">{actions}</div>
                    )}
                </div>
            )}
            {hasFilters && (
                <div className={`${rowCls} ${hasDisplay || hasBody ? divider : ''}`}>
                    {filters}
                </div>
            )}
            {/* ③ 显示选项：只改「呈现方式」不改「数据集合」，故与筛选分开成段（§4.1） */}
            {hasDisplay && <div className={`${rowCls} ${hasBody ? divider : ''}`}>{display}</div>}
            {hasBody && (
                <div className={`${padded ? 'p-3' : ''} ${fill ? 'flex-1 min-h-0 flex flex-col' : ''}`}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default ListToolbar;
