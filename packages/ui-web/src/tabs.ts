/**
 * 页签的方向键（ARIA tabs 的习惯）：左右切到相邻一项，到头绕回；Home / End 到第一项、最后一项。
 * 不是这几个键返回 null，让浏览器照常处理。
 */
export function tabKeyIndex(key: string, current: number, count: number): number | null {
  if (count <= 0) return null;
  const from = current < 0 ? 0 : current;
  if (key === 'ArrowRight') return (from + 1) % count;
  if (key === 'ArrowLeft') return (from - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
