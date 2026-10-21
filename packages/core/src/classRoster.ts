import type { DateKey } from '@climb/utils';
import { cancelBooking, isLateForClass, sessionStartsAt, waitlistQueue, type ClassBooking, type ClassSession } from './classes';
import type { ClassRules } from './gym';
import { RuleError, type RuleErrorCode } from './rules';
import type { Card } from './types';

/**
 * 后台团课名单和签到（任务 27）。约课、取消、候补补位的规则都在 classes.ts（跟小程序分支逐字一致，这里不改），
 * 前台帮会员取消直接调 cancelBooking（by: 'staff'，可以越过自助取消截止），这里只加名单、签到和「今日约课」的口径。
 *
 * 已定：
 * - 签到把约上的预约（booked）改成 attended；开课后超过 classRules.lateGraceMinutes 才签到的按迟到算缺席（absent，isLateForClass），次数不退。
 * - 前台也可以直接标缺席（没来）。标错了可以在 attended / absent 之间改。候补、取消、作废的不能签到；取消了的课不能签到。
 * - 帮会员取消要写原因；开课后不能取消（cancelBooking 拦 class-started），没来的标缺席。
 *
 * 等馆方的占位：开课前 CLASS_CHECKIN_OPEN_MINUTES 分钟起才能签到。
 */
export const CLASS_CHECKIN_OPEN_MINUTES = 30;

export const CLASS_ROSTER_TEXT: Partial<Record<RuleErrorCode, string>> = {
  'booking-not-active': '这个预约已经取消了，或者还在候补',
  'class-cancelled': '这节课已经取消了',
  'class-checkin-not-open': `开课前 ${CLASS_CHECKIN_OPEN_MINUTES} 分钟才能签到`,
  'class-started': '这节课已经开始了，不能取消，没来的标缺席',
  'reason-required': '帮会员取消要写原因',
};

const fail = (code: RuleErrorCode): never => {
  throw new RuleError(code, CLASS_ROSTER_TEXT[code] ?? code);
};

/** 占着名额的（约上、签到了、缺席），名额和「今日约课」都按这个算 */
export const isSeatBooking = (b: Pick<ClassBooking, 'status'>) => b.status === 'booked' || b.status === 'attended' || b.status === 'absent';

const byCreated = (a: ClassBooking, b: ClassBooking) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1);

/** 一节课的名单：约上的（含签到、缺席）按约课先后；候补按排队先后带位次；取消、作废的放最后 */
export function classRoster<B extends ClassBooking>(sessionId: string, bookings: readonly B[]): { booked: B[]; waitlist: (B & { position: number })[]; closed: B[] } {
  const mine = bookings.filter(b => b.sessionId === sessionId);
  const queue = waitlistQueue(sessionId, [...mine]) as B[];
  return {
    booked: mine.filter(isSeatBooking).sort(byCreated),
    waitlist: queue.map((b, i) => ({ ...b, position: i + 1 })),
    closed: mine.filter(b => b.status === 'cancelled' || b.status === 'voided').sort(byCreated),
  };
}

/**
 * 签到或标缺席。present = true 是来了：没超过迟到宽限是 attended，超过了是 absent（late = true）；present = false 直接标 absent。
 * 只改状态，次数在约课时已经扣了，不退不扣。
 */
export function attendBooking(args: { booking: ClassBooking; session: ClassSession; present: boolean; now: Date; rules: ClassRules }): { booking: ClassBooking; late: boolean } {
  const { booking, session, present, now, rules } = args;
  if (session.status === 'cancelled') fail('class-cancelled');
  if (!isSeatBooking(booking)) fail('booking-not-active');
  if (now.getTime() < sessionStartsAt(session).getTime() - CLASS_CHECKIN_OPEN_MINUTES * 60_000) fail('class-checkin-not-open');
  const late = present && isLateForClass(session, now, rules);
  return { booking: { ...booking, status: present && !late ? 'attended' : 'absent' }, late };
}

/** 前台帮会员取消：原因必填，其余全按 classes.ts 的 cancelBooking（by: 'staff'）——退次、候补递补扣次 */
export function staffCancelBooking(args: { booking: ClassBooking; session: ClassSession; bookings: ClassBooking[]; cards: Card[]; now: Date; rules: ClassRules; reason: string }) {
  if (!args.reason.trim()) fail('reason-required');
  const { reason: _r, ...rest } = args;
  return cancelBooking({ ...rest, by: 'staff' });
}

/** 看板「今日约课」：on 这天、storeIds 这些店没取消的课里，占着名额的预约人次（候补、取消、作废的不算）。私教等任务 29–30 再加 */
export function classBookingsOn(sessions: readonly ClassSession[], bookings: readonly ClassBooking[], on: DateKey, storeIds: readonly string[]): number {
  const ids = new Set(sessions.filter(s => s.on === on && s.status !== 'cancelled' && storeIds.includes(s.storeId)).map(s => s.id));
  return bookings.filter(b => ids.has(b.sessionId) && isSeatBooking(b)).length;
}
