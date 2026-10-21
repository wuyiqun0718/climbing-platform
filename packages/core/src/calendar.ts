import { addDays, addMonths, endOfMonth, monthOf, type DateKey } from '@climb/utils';
import type { PastCheckIn } from './checkIn';

/**
 * 攀爬日历（我的 → 攀爬日历，`GET /me/check-ins?month=`）。
 * 月份和日期都是本地日期字符串（YYYY-MM、YYYY-MM-DD），不从 ISO 时间戳截取，免得 UTC 跨天差一天。
 */

/** 月份：YYYY-MM */
export type MonthKey = string;

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
export const isMonthKey = (s: unknown): s is MonthKey => typeof s === 'string' && MONTH_RE.test(s);

/** 前后翻 n 个月 */
export const shiftMonth = (month: MonthKey, n: number): MonthKey => monthOf(addMonths(`${month}-01`, n));

/** 这个月的每一天 */
export function daysOfMonth(month: MonthKey): DateKey[] {
  const out: DateKey[] = [];
  for (let d = `${month}-01`, end = endOfMonth(d); d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 日历上的一天：去了哪几家店（按第一次去的先后），入了几次场 */
export interface ClimbDay {
  on: DateKey;
  storeIds: string[];
  count: number;
}

/**
 * 某个会员某个月爬了哪几天。被前台撤销的入场（voided，和后台撤销入场同一个字段）不算；
 * 同一天多次入场只算一天，列出去过的门店。checkIns 按入场先后传。
 */
export function climbCalendar(checkIns: readonly Pick<PastCheckIn, 'memberId' | 'storeId' | 'on' | 'voided'>[], memberId: string, month: MonthKey): ClimbDay[] {
  const byDay = new Map<DateKey, ClimbDay>();
  for (const c of checkIns) {
    if (c.memberId !== memberId || c.voided || monthOf(c.on) !== month) continue;
    const day = byDay.get(c.on) ?? { on: c.on, storeIds: [], count: 0 };
    if (!day.storeIds.includes(c.storeId)) day.storeIds.push(c.storeId);
    day.count += 1;
    byDay.set(c.on, day);
  }
  return [...byDay.values()].sort((a, b) => (a.on < b.on ? -1 : 1));
}
