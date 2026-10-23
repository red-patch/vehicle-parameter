import React, { type ReactNode } from 'react';
import { formatListCount, type ListCount } from './tablePresets';

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
 *
 * 典型用法（列表页整页外壳；② 改「数据集合」，③ 只改「呈现方式」，二者不混）：
 *
 * ```tsx
 * <ListToolbar
 *     title="公告归档"
 *     count={{ shown: filtered.length, total: all.length }}
 *     actions={<Button>导入</Button>}
 *     filters={
 *         <>
 *             <FacetChips options={[…]} value={chip} onChange={setChip} />
 *             <SearchInput className="ml-auto" value={q} onChange={setQ} placeholder="搜索车型名" />
 *         </>
 *     }
 *     display={<Switch … />}
 *     padded={false}   // 表格贴边时传 false
 * >
 *     <DataTable … />
 * </ListToolbar>
 * ```
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
            // 标签是筛选控件的说明，不是标题：常规字重 + 二级文字（列表区设计语言 §5.3）。
            // 此前半粗体，与面板标题（14/600）抢层级。
            <span
                className="text-2 whitespace-nowrap"
                style={{ fontSize: 'var(--fs-body)' }}
            >
                {withColon(label)}
            </span>
        )}
        {children}
    </div>
);

export interface ListToolbarProps {
    /**
     * 标题区。**传字符串**时由组件统一排版（title 档 14/600、一级文字、无图标）——
     * 此前各页标题 13/14/15px、400/600/700 字重各一，有的带图标、有的重复导航名。
     * 传节点仅用于确需富内容的存量场景。
     */
    title?: ReactNode;
    /** 计数：紧跟标题的三级文字（`26` 或 `17 / 26`） */
    count?: ListCount;
    /** 标题后的补充信息（如库路径）；aux 档三级文字，超长截断 */
    subtitle?: ReactNode;
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
    count,
    subtitle,
    actions,
    filters,
    display,
    children,
    padded = true,
    fill = false,
    className = '',
    style,
}) => {
    const hasHead = Boolean(title || actions || count !== undefined);
    const countInfo = count !== undefined ? formatListCount(count) : null;
    const hasFilters = Boolean(filters);
    const hasDisplay = Boolean(display);
    const hasBody = Boolean(children);
    // 分隔线只在「后面还有内容」时出现，否则末行会拖一条悬空的下边框
    const divider = 'border-b border-default';
    const rowCls = 'flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 shrink-0';

    return (
        <div
            className={`list-shell surface-container border border-default rounded-lg ${
                // flex-1：外层是钉高页面里的纵向 flex，外壳要吃掉剩余高度；
                // min-h-0 + overflow-hidden：内容再高也不能把外壳撑破，否则表体量不准
                fill ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : ''
            } ${className}`}
            style={style}
        >
            {hasHead && (
                <div
                    className={`flex items-center justify-between gap-3 px-3 py-2 min-h-[48px] shrink-0 ${
                        hasFilters || hasDisplay || hasBody ? divider : ''
                    }`}
                >
                    <div className="min-w-0 flex items-baseline gap-2">
                        {typeof title === 'string' ? (
                            <span
                                className="font-semibold text-1 whitespace-nowrap"
                                style={{ fontSize: 'var(--fs-title)' }}
                                data-slot="list-title"
                            >
                                {title}
                            </span>
                        ) : (
                            title && <div className="min-w-0 flex items-center gap-2 self-center">{title}</div>
                        )}
                        {countInfo && (
                            <span
                                className="text-3 tabular-nums whitespace-nowrap"
                                style={{ fontSize: 'var(--fs-aux)' }}
                                title={countInfo.title}
                                data-slot="list-count"
                            >
                                {countInfo.text}
                            </span>
                        )}
                        {subtitle && (
                            <span
                                className="text-3 truncate min-w-0"
                                style={{ fontSize: 'var(--fs-aux)' }}
                                data-slot="list-subtitle"
                            >
                                {subtitle}
                            </span>
                        )}
                    </div>
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
                <div
                    className={`${padded ? 'p-3' : ''} ${
                        fill ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : ''
                    }`}
                >
                    {children}
                </div>
            )}
        </div>
    );
};

export default ListToolbar;
