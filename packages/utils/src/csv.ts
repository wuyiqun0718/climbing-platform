/**
 * 导出 CSV（后台导出 Excel 用）。Excel 打开不乱码、不被单元格里的内容「执行」：
 * - 开头带 UTF-8 BOM，换行用 CRLF；
 * - 单元格里有逗号、双引号、换行的整格用双引号包起来，里面的双引号写两遍；
 * - 防公式注入：以 = + - @ 、制表符、回车开头的文字前面加一个 '（Excel 当成文字）；纯数字（比如 -12.50）不加，免得金额变成文字。
 * 数字直接写；null / undefined 写空格子。
 */

export type CsvCell = string | number | null | undefined;

export const CSV_BOM = '\uFEFF';

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/;

/** 一个格子的文字（已转义） */
export function csvCell(v: CsvCell): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? (Number.isFinite(v) ? String(v) : '') : v;
  if (typeof v === 'string' && FORMULA_START.test(s) && !PLAIN_NUMBER.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 表头加数据行，生成整个文件的内容（带 BOM） */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  return CSV_BOM + [header, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
