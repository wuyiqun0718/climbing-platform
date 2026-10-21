import { addDays, monthOf, type DateKey } from '@climb/utils';

export type RangePreset = 'month' | 'lastMonth' | 'last30';

export const RANGE_PRESETS: readonly { key: RangePreset; label: string }[] = [
  { key: 'month', label: '本月' },
  { key: 'lastMonth', label: '上月' },
  { key: 'last30', label: '近 30 天' },
];

/** 快捷日期范围（含两头）：本月 1 日到今天、上个自然月、含今天在内的 30 天 */
export function presetRange(preset: RangePreset, today: DateKey): { from: DateKey; to: DateKey } {
  const monthStart = `${monthOf(today)}-01`;
  if (preset === 'month') return { from: monthStart, to: today };
  if (preset === 'last30') return { from: addDays(today, -29), to: today };
  const lastDay = addDays(monthStart, -1);
  return { from: `${monthOf(lastDay)}-01`, to: lastDay };
}
