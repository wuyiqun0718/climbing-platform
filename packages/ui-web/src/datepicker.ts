/**
 * UiDatePicker 的日期计算，纯函数好测。日期都是本地日期字符串 YYYY-MM-DD（和 @climb/utils 的 DateKey 同一种），
 * 月份是 YYYY-MM。ui-web 不依赖 utils，这几个函数自己算，都按本地日期（不经过 UTC）。
 */
export type DateKey = string;

const pad = (n: number) => String(n).padStart(2, '0');
const toKey = (d: Date): DateKey => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k: DateKey) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const isDateKey = (v: unknown): v is DateKey =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && toKey(fromKey(v)) === v;

export const todayKey = (): DateKey => toKey(new Date());

export function addDays(k: DateKey, n: number): DateKey {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** 加减月份，日子超过那个月的天数就落在月底（1 月 31 日 + 1 月 = 2 月 28/29 日） */
export function addMonths(k: DateKey, n: number): DateKey {
  const [y, m, d] = k.split('-').map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return toKey(new Date(y, m - 1 + n, Math.min(d, last)));
}

/** 周一是 0，周日是 6 */
export const mondayIndex = (k: DateKey) => (fromKey(k).getDay() + 6) % 7;

export const monthOf = (k: DateKey) => k.slice(0, 7);

/** 2026.10.23，和后台其它地方的日期写法一样 */
export const formatDot = (k: DateKey) => k.replaceAll('-', '.');

export const monthTitle = (month: string) => `${Number(month.slice(0, 4))} 年 ${Number(month.slice(5, 7))} 月`;

export const inRange = (k: DateKey, min?: DateKey, max?: DateKey) => (!min || k >= min) && (!max || k <= max);

export function clampDate(k: DateKey, min?: DateKey, max?: DateKey): DateKey {
  if (min && k < min) return min;
  if (max && k > max) return max;
  return k;
}

export interface DayCell {
  key: DateKey;
  day: number;
  /** 上个月、下个月补齐的格子 */
  outside: boolean;
  disabled: boolean;
}

/** 月历：周一开头，6 行 × 7 列，前后用相邻月份补齐 */
export function monthGrid(month: string, min?: DateKey, max?: DateKey): DayCell[][] {
  const first = `${month}-01`;
  const start = addDays(first, -mondayIndex(first));
  const rows: DayCell[][] = [];
  for (let r = 0; r < 6; r++) {
    const row: DayCell[] = [];
    for (let c = 0; c < 7; c++) {
      const key = addDays(start, r * 7 + c);
      row.push({ key, day: Number(key.slice(8)), outside: monthOf(key) !== month, disabled: !inRange(key, min, max) });
    }
    rows.push(row);
  }
  return rows;
}

/**
 * 月历里的键盘：左右一天、上下一周、PageUp / PageDown 一个月、Home / End 到这一周的周一 / 周日。
 * 结果夹在 min / max 之间；不是这几个键返回 null。
 */
export function moveDate(k: DateKey, key: string, min?: DateKey, max?: DateKey): DateKey | null {
  let next: DateKey;
  switch (key) {
    case 'ArrowLeft': next = addDays(k, -1); break;
    case 'ArrowRight': next = addDays(k, 1); break;
    case 'ArrowUp': next = addDays(k, -7); break;
    case 'ArrowDown': next = addDays(k, 7); break;
    case 'PageUp': next = addMonths(k, -1); break;
    case 'PageDown': next = addMonths(k, 1); break;
    case 'Home': next = addDays(k, -mondayIndex(k)); break;
    case 'End': next = addDays(k, 6 - mondayIndex(k)); break;
    default: return null;
  }
  return clampDate(next, min, max);
}
