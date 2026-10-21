import { addDays, daysBetween, isDateKey, type DateKey } from '@climb/utils';
import type { CoachView } from './coach';
import type { PtRules } from './gym';
import { isPtSlotHeld, ptDaySlots, ptHours, type PtBooking, type PtSlot, type PtSlotMark } from './pt';

/**
 * 后台私教时间轴（任务 29），只读：每位教练一行，每天按 GymRules.ptRules 的营业时间每小时一格（pt.ts 的 ptHours / ptDaySlots，不写死）。
 * 格子状态就是 pt.ts 的 free / member / offline / off；会员约的带上预约，线下约的、不接课的带上标记，后台能看到会员名字和备注。
 * 一位教练同一时间只能在一处，所以别的店的预约、标记也照样占着这一格（带上门店）。
 */

/** 一次最多看几天（原型是一周） */
export const PT_TIMELINE_MAX_DAYS = 7;

/** from、to（含）合不合法；不对返回原因 */
export function ptRangeError(from: unknown, to: unknown): string | null {
  if (!isDateKey(from) || !isDateKey(to)) return '日期格式不对';
  if (from > to) return '开始日期不能晚于结束日期';
  if (daysBetween(from, to) + 1 > PT_TIMELINE_MAX_DAYS) return `一次最多看 ${PT_TIMELINE_MAX_DAYS} 天`;
  return null;
}

export interface PtTimelineSlot extends PtSlot {
  /** member 的：预约本身 */
  booking?: PtBooking;
  /** offline / off 的：那条标记 */
  mark?: PtSlotMark;
}

export interface PtTimelineRow {
  coach: CoachView;
  days: { on: DateKey; slots: PtTimelineSlot[] }[];
}

/**
 * 时间轴：coaches 是能约的教练（coach.ts 的 listCoaches，已按门店筛好），from 到 to（含）每天一列。
 * 每格按 ptDaySlots 算，再把对应的预约、标记挂上去。
 */
export function ptTimeline(a: {
  coaches: readonly CoachView[];
  from: DateKey;
  to: DateKey;
  bookings: PtBooking[];
  marks: PtSlotMark[];
  now: Date;
  rules: PtRules;
}): { hours: number[]; rows: PtTimelineRow[] } {
  const days: DateKey[] = [];
  for (let on = a.from; on <= a.to; on = addDays(on, 1)) days.push(on);
  const rows = a.coaches.map(coach => ({
    coach,
    days: days.map(on => ({
      on,
      slots: ptDaySlots({ coachId: coach.id, on, bookings: a.bookings, marks: a.marks, now: a.now, rules: a.rules }).map((slot): PtTimelineSlot => {
        const booking = slot.bookingId ? a.bookings.find(b => b.id === slot.bookingId) : undefined;
        const mark = slot.markId ? a.marks.find(m => m.id === slot.markId) : undefined;
        return { ...slot, ...(booking ? { booking } : {}), ...(mark ? { mark } : {}) };
      }),
    })),
  }));
  return { hours: ptHours(a.rules), rows };
}

/** 看板「今日约课」里私教的部分：on 这天、这些店占着格子的预约（等确认、约上、上完、没来），取消、作废的不算 */
export function ptBookingsOn(bookings: readonly PtBooking[], on: DateKey, storeIds: readonly string[]): number {
  return bookings.filter(b => b.on === on && storeIds.includes(b.storeId) && isPtSlotHeld(b)).length;
}
