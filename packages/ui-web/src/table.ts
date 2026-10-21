/** DataTable 的列定义 */
export interface Column<T> {
  /** 对应行数据的字段，也用来命名插槽 `cell-<key>` */
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
  /** 数字列：右对齐、等宽数字 */
  num?: boolean;
  /** CSS 宽度，比如 '120px' */
  width?: string;
  /** 没有插槽时用它算显示文字；不给就直接显示 row[key] */
  format?: (row: T) => string | number;
}
