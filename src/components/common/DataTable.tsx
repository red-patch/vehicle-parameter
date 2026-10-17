/**
 * 统一数据表格封装（页面主列表用；设计：docs/plans/2026-10-17-列表区统一设计语言-design.md）
 * 解决 antd Table 在不同模块中分页配置散落、scroll 高度计算不一致的问题。
 *
 * 默认：
 * - 分页 = `pagePagination()`（每页 50、20/50/100 切换器、「共 N 条」）
 * - scroll.x 自动 max-content
 * - 单元格内的按钮 / 输入 / 下拉默认 small（24px）——「表外 32 / 表内 24」两档尺寸，
 *   调用方不必在每个单元格控件上再写 size="small"
 * - 密度（行高 / 内边距 / 字号）不由本组件决定，由 themeConfig 的 TABLE_DENSITY 统一
 */
import { ConfigProvider, Table } from 'antd';
import type { TableProps } from 'antd';
import { pagePagination, PAGE_SIZE } from './tablePresets';

type DataTableProps<T extends object = Record<string, unknown>> = Omit<TableProps<T>, 'scroll'> & {
  /** 纵向滚动高度（像素或 CSS 值，如 400 或 "calc(100vh - 300px)"） */
  scrollY?: number | string;
  /** 横向滚动，默认 "max-content"；开启 virtual 时建议传数字总宽 */
  scrollX?: number | string;
  /** 每页条数，默认 50（PAGE_SIZE） */
  pageSize?: number;
  /** 隐藏分页切换器 */
  hideSizeChanger?: boolean;
  /** 开启 antd 虚拟滚动（行数大的表；需配合 scrollY 且列宽为数字） */
  virtual?: boolean;
};

export default function DataTable<T extends object = Record<string, unknown>>({
  scrollY,
  scrollX = 'max-content',
  pageSize = PAGE_SIZE,
  hideSizeChanger = false,
  virtual = false,
  size = 'small',
  pagination,
  tableLayout,
  ...rest
}: DataTableProps<T>) {
  const mergedPagination: TableProps<T>['pagination'] =
    pagination === false
      ? false
      : pagePagination({
          defaultPageSize: pageSize,
          showSizeChanger: !hideSizeChanger,
          ...(typeof pagination === 'object' ? pagination : {}),
        });

  // fixed 布局下 x='max-content' 仍按单元格固有宽度（长表头不换行）撑表，须改为列宽之和；
  // minWidth 100% 由 antd 保证，列少时仍铺满
  const ellipsisCols = (rest.columns ?? []) as { width?: number | string; ellipsis?: unknown }[];
  const hasEllipsisCol = ellipsisCols.some(c => !!c.ellipsis);
  const resolvedX =
    hasEllipsisCol && scrollX === 'max-content'
      ? ellipsisCols.reduce((sum, c) => sum + (typeof c.width === 'number' ? c.width : 120), 0) +
        (rest.expandable ? 48 : 0) + (rest.rowSelection ? 36 : 0)
      : scrollX;
  const mergedScroll: TableProps<T>['scroll'] = {
    ...(resolvedX ? { x: resolvedX } : {}),
    ...(scrollY !== undefined ? { y: scrollY } : {}),
  };

  // 声明了 ellipsis 的列要按列宽截断，表格必须是 fixed 布局。antd 在「有固定列 + scroll.x=max-content」
  // 时会退回 auto 布局，ellipsis 随之失效：长车型名表头把列撑到 600px+、组合值溢出到相邻列
  // （列表区设计语言 §3.4，真实数据回归发现）。
  const mergedLayout = tableLayout ?? (hasEllipsisCol ? 'fixed' : undefined);

  return (
    <ConfigProvider componentSize="small">
      <Table<T>
        size={size}
        pagination={mergedPagination}
        scroll={mergedScroll}
        virtual={virtual}
        tableLayout={mergedLayout}
        {...rest}
      />
    </ConfigProvider>
  );
}
