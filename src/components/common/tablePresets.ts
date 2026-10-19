import type { TablePaginationConfig } from 'antd';
import type { ColumnType } from 'antd/es/table';

/**
 * 列表区预设（设计：docs/plans/2026-10-17-列表区统一设计语言-design.md §6）。
 *
 * 为什么是常量而不是「每张表自己写 pageSize」：实测此前 27 张表里出现过
 * 6 / 8 / 10 / 15 / 20 / 50 六种每页条数、有的带切换器有的不带——同一个
 * 「翻页」意图六种写法。现在只有两档，按**表所在的容器**而不是按喜好选：
 *
 * | 档 | 用在 | 每页 | 切换器 | 单页时 |
 * |---|---|---|---|---|
 * | `pagePagination` | 页面主列表（ListToolbar 内） | 50 | 20/50/100 | 照常显示（总数是信息） |
 * | `compactPagination` | 弹窗 / 抽屉 / 展开行里的表 | 20 | 无 | 隐藏（空间有限） |
 *
 * 护栏 R13 禁止在构件外写 `pageSize: <数字>` 字面量。
 */

export const PAGE_SIZE = 50;
export const PAGE_SIZE_OPTIONS = ['20', '50', '100'];
export const COMPACT_PAGE_SIZE = 20;

const showTotal = (total: number) => `共 ${total} 条`;

/** 页面主列表的分页；overrides 用于受控 pageSize / onChange 等 */
export const pagePagination = (overrides: TablePaginationConfig = {}): TablePaginationConfig => ({
    defaultPageSize: PAGE_SIZE,
    showSizeChanger: true,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
    showTotal,
    ...overrides,
});

/** 弹窗 / 抽屉 / 展开行内的分页：每页 20、无切换器、单页隐藏（配合 MODAL_TABLE_SCROLL_Y 在页内滚动） */
export const compactPagination = (overrides: TablePaginationConfig = {}): TablePaginationConfig => ({
    defaultPageSize: COMPACT_PAGE_SIZE,
    showSizeChanger: false,
    hideOnSinglePage: true,
    showTotal,
    ...overrides,
});

/** 弹窗内表格的统一滚动高度（此前 280 / 360 / 380 / 400 各一） */
export const MODAL_TABLE_SCROLL_Y = 360;

/**
 * 数值列：右对齐（个位对个位），配合整表 tabular-nums。
 * 用法：`{ title: '参数数', dataIndex: 'paramCount', ...NUMERIC_COLUMN }`
 */
export const NUMERIC_COLUMN: Pick<ColumnType<object>, 'align'> = { align: 'right' };

/**
 * 列表计数（设计：2026-10-17-列表区统一设计语言 §5.2）。
 * 此前四种写法：纯文本「共 26 项」、蓝 Tag「已选 3 款」、灰 Tag「显示: 17 条」、
 * 两个 Tag「6 个字段 / 6 激活」——计数不是状态，不该长成标签。
 * 统一为标题后的一段三级文字：`26`，筛选后 `17 / 26`。
 */
export type ListCount = number | { shown: number; total: number };

export const formatListCount = (count: ListCount): { text: string; title: string } => {
    if (typeof count === 'number') return { text: String(count), title: `共 ${count} 条` };
    if (count.shown === count.total) return { text: String(count.total), title: `共 ${count.total} 条` };
    return { text: `${count.shown} / ${count.total}`, title: `显示 ${count.shown} 条，共 ${count.total} 条` };
};
