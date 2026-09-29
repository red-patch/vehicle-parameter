/**
 * 统一数据表格封装
 * 解决 antd Table 在不同模块中分页配置散落、scroll 高度计算不一致的问题。
 * 
 * 默认：size="small", pagination 开启 showSizeChanger + showTotal, scroll.x 自动 max-content
 */
import { Table } from 'antd';
import type { TableProps } from 'antd';

type DataTableProps<T extends object = Record<string, unknown>> = Omit<TableProps<T>, 'scroll'> & {
  /** 纵向滚动高度（像素或 CSS 值，如 400 或 "calc(100vh - 300px)"） */
  scrollY?: number | string;
  /** 横向滚动，默认 "max-content"；开启 virtual 时建议传数字总宽 */
  scrollX?: number | string;
  /** 每页条数，默认 50 */
  pageSize?: number;
  /** 隐藏分页切换器 */
  hideSizeChanger?: boolean;
  /** 开启 antd 虚拟滚动（行数大的表；需配合 scrollY 且列宽为数字） */
  virtual?: boolean;
};

export default function DataTable<T extends object = Record<string, unknown>>({
  scrollY,
  scrollX = 'max-content',
  pageSize = 50,
  hideSizeChanger = false,
  virtual = false,
  size = 'small',
  pagination,
  ...rest
}: DataTableProps<T>) {
  const mergedPagination: TableProps<T>['pagination'] =
    pagination === false
      ? false
      : {
          defaultPageSize: pageSize,
          showSizeChanger: !hideSizeChanger,
          showTotal: (total: number) => `共 ${total} 条`,
          ...(typeof pagination === 'object' ? pagination : {}),
        };

  const mergedScroll: TableProps<T>['scroll'] = {
    ...(scrollX ? { x: scrollX } : {}),
    ...(scrollY !== undefined ? { y: typeof scrollY === 'number' ? scrollY : scrollY } : {}),
  };

  return (
    <Table<T>
      size={size}
      pagination={mergedPagination}
      scroll={mergedScroll}
      virtual={virtual}
      {...rest}
    />
  );
}
