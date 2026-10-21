/** 分页的纯计算，Pager.vue 用，单独拿出来好测 */

export function pageCount(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/** 把页码夹到 1..pageCount 之间 */
export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(1, Math.floor(page) || 1), Math.max(1, count));
}

/**
 * 要显示的页码按钮，'…' 表示省略。总是有第一页、最后一页和当前页左右各 siblings 页；
 * 只省略一页时直接显示那一页，按钮总数不随当前页跳动。
 */
export function pageItems(page: number, count: number, siblings = 1): Array<number | '…'> {
  const slots = siblings * 2 + 5; // 首、尾、当前、两侧 siblings、两个省略位
  if (count <= slots) return Array.from({ length: count }, (_, i) => i + 1);

  const cur = clampPage(page, count);
  const left = Math.max(cur - siblings, 2);
  const right = Math.min(cur + siblings, count - 1);
  const showLeftGap = left > 3;
  const showRightGap = right < count - 2;
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

  if (!showLeftGap) return [...range(1, slots - 2), '…', count];
  if (!showRightGap) return [1, '…', ...range(count - (slots - 3), count)];
  return [1, '…', ...range(left, right), '…', count];
}
