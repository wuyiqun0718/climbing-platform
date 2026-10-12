/** 日期工具。业务里的「日期」统一用本地日期字符串 YYYY-MM-DD（DateKey），方便比较和存储。 */

export type DateKey = string;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export function toDateKey(d: Date): DateKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
}

export function addMonths(key: DateKey, n: number): DateKey {
  const d = fromDateKey(key);
  d.setMonth(d.getMonth() + n);
  return toDateKey(d);
}

/** b - a 相差多少天 */
export function daysBetween(a: DateKey, b: DateKey): number {
  return Math.round((fromDateKey(b).getTime() - fromDateKey(a).getTime()) / DAY_MS);
}

/** 同一自然月的标识，比如 2026-10 */
export function monthOf(key: DateKey): string {
  return key.slice(0, 7);
}

export function endOfMonth(key: DateKey): DateKey {
  const d = fromDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** 10月12日 */
export function formatMonthDay(key: DateKey): string {
  const d = fromDateKey(key);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 2026.10.12 */
export function formatDot(key: DateKey): string {
  return key.replace(/-/g, '.');
}

export function weekdayOf(key: DateKey): string {
  return WEEKDAYS[fromDateKey(key).getDay()];
}
