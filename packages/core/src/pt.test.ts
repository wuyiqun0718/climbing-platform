import { describe, expect, it } from 'vitest';
import { defaultPtRules, defaultRules, defineGym, type PtRules } from './gym';
import {
  bookPt, cancelPtBooking, coachCancelPtBooking, confirmPtBooking, markPtSlot, ptCancelBlockedBy, ptCancelDeadline, ptCardOptions, ptDaySlots, ptHours,
  type PtBooking, type PtSlotMark,
} from './pt';
import { RuleError } from './rules';
import type { Card, LessonCard } from './types';

const on = '2026-10-23';
const now = new Date('2026-10-22T10:00:00');
const rules: PtRules = defaultPtRules;
const pack = (memberId = 'jie', extra: Partial<LessonCard> = {}): LessonCard => ({
  id: `pt-${memberId}`, kind: 'pt', memberId, productId: 'pt5', name: '私教 5 节', total: 5, remaining: 3, expiresOn: '2027-04-01', ...extra,
});
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };
const book = (o: { hour?: number; memberId?: string; coachId?: string; bookings?: PtBooking[]; marks?: PtSlotMark[]; cards?: Card[]; r?: PtRules; at?: Date; cardId?: string; id?: string } = {}) => bookPt({
  id: o.id ?? 'b1', coachId: o.coachId ?? 'max', on, hour: o.hour ?? 14, storeId: 'binggang', bookings: o.bookings ?? [], marks: o.marks ?? [],
  cards: o.cards ?? [pack(o.memberId)], memberId: o.memberId ?? 'jie', cardId: o.cardId, now: o.at ?? now, rules: o.r ?? rules,
});

describe('私教格子', () => {
  it('默认 10:00–23:00 每小时一格；岩馆配置能单独改', () => {
    expect(ptHours(rules)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    expect(defaultRules.ptRules).toEqual({ openHour: 10, closeHour: 23, cancelBeforeMinutes: 720, needCoachConfirm: false });
    const gym = defineGym({ id: 'x', name: 'x', shortName: 'x', wechatAppId: '', entryQrLink: '', logo: '', openHours: { open: '09:00', close: '22:00' }, theme: {} as never, rules: { ptRules: { openHour: 9, closeHour: 22 } } });
    expect(gym.rules.ptRules).toEqual({ ...defaultPtRules, openHour: 9, closeHour: 22 });
  });

  it('格子状态：free / member / offline / off，只看这位教练这一天；过去的格子标 past', () => {
    const { booking } = book({ hour: 14 });
    const marks: PtSlotMark[] = [
      { id: 'm1', coachId: 'max', on, hour: 15, kind: 'offline', note: '小王' },
      { id: 'm2', coachId: 'max', on, hour: 16, kind: 'off' },
      { id: 'm3', coachId: 'may', on, hour: 17, kind: 'off' },
    ];
    const slots = ptDaySlots({ coachId: 'max', on, bookings: [booking], marks, now, rules });
    expect(slots.filter(s => s.hour >= 14 && s.hour <= 17).map(s => [s.hour, s.status, s.bookingId ?? s.markId ?? null])).toEqual([
      [14, 'member', 'b1'], [15, 'offline', 'm1'], [16, 'off', 'm2'], [17, 'free', null],
    ]);
    const today = ptDaySlots({ coachId: 'max', on: '2026-10-22', bookings: [], marks: [], now, rules });
    expect(today.filter(s => s.past).map(s => s.hour)).toEqual([10]);
    // 取消了的预约不占格子
    const cancelled = { ...booking, status: 'cancelled' as const };
    expect(ptDaySlots({ coachId: 'max', on, bookings: [cancelled], marks: [], now, rules }).find(s => s.hour === 14)!.status).toBe('free');
  });
});

describe('约私教', () => {
  it('约上扣 1 节课时（pt_book）；要教练确认时先是 pending，确认后 booked', () => {
    const res = book();
    expect(res.booking).toMatchObject({ status: 'booked', cardId: 'pt-jie', deducted: 1, coachId: 'max', on, hour: 14, storeId: 'binggang' });
    expect(res.changes).toEqual([{ card: { ...pack(), remaining: 2 }, delta: -1, reason: 'pt_book', bookingId: 'b1' }]);
    const pending = book({ r: { ...rules, needCoachConfirm: true } }).booking;
    expect(pending.status).toBe('pending');
    expect(confirmPtBooking(pending).status).toBe('booked');
    expect(code(() => confirmPtBooking(confirmPtBooking(pending)))).toBe('pt-booking-not-pending');
  });

  it('同一教练同一格不能被两人约；等确认的也占着', () => {
    const first = book().booking;
    expect(code(() => book({ id: 'b2', memberId: 'lu', bookings: [first] }))).toBe('pt-slot-taken');
    const pending = book({ r: { ...rules, needCoachConfirm: true } }).booking;
    expect(code(() => book({ id: 'b2', memberId: 'lu', bookings: [pending] }))).toBe('pt-slot-taken');
    // 别的教练、别的时段可以
    expect(book({ id: 'b2', memberId: 'lu', bookings: [first], coachId: 'may' }).booking.status).toBe('booked');
    expect(book({ id: 'b2', memberId: 'lu', bookings: [first], hour: 15 }).booking.status).toBe('booked');
  });

  it('线下约的、不接课的格子不能约', () => {
    expect(code(() => book({ marks: [{ id: 'm1', coachId: 'max', on, hour: 14, kind: 'offline' }] }))).toBe('pt-slot-taken');
    expect(code(() => book({ marks: [{ id: 'm1', coachId: 'max', on, hour: 14, kind: 'off' }] }))).toBe('pt-coach-off');
  });

  it('营业时间外、已经过了的格子不能约；同一个人同一时间不能约两位教练', () => {
    expect(code(() => book({ hour: 9 }))).toBe('pt-outside-hours');
    expect(code(() => book({ hour: 23 }))).toBe('pt-outside-hours');
    expect(code(() => book({ hour: 14.5 }))).toBe('pt-outside-hours');
    expect(code(() => book({ at: new Date(`${on}T14:00:00`) }))).toBe('pt-slot-past');
    const first = book().booking;
    expect(code(() => book({ id: 'b2', coachId: 'may', bookings: [first], cards: [{ ...pack(), remaining: 2 }] }))).toBe('pt-member-busy');
  });

  it('只扣私教课包：团课课包、冻结、上课那天过期、用完的都不能用', () => {
    const bad: Card[] = [
      { ...pack(), id: 'k', kind: 'class' },
      { ...pack(), id: 'f', status: 'frozen' },
      { ...pack(), id: 'r', status: 'refunded' },
      { ...pack(), id: 'e', expiresOn: '2026-10-22' },
      { ...pack(), id: 'z', remaining: 0 },
      pack('lu'),
    ];
    expect(ptCardOptions(bad, 'jie', on)).toEqual([]);
    expect(code(() => book({ cards: bad }))).toBe('pt-no-card');
    expect(code(() => book({ cards: [pack(), ...bad], cardId: 'f' }))).toBe('pt-no-card');
    const soon = pack('jie', { id: 'soon', expiresOn: on });
    expect(ptCardOptions([pack(), soon], 'jie', on).map(c => c.id)).toEqual(['soon', 'pt-jie']);
  });
});

describe('取消私教', () => {
  const booked = () => book();
  const deadline = new Date(`${on}T02:00:00`); // 14:00 前 12 小时

  it('截止前会员取消退课时（pt_cancel），格子空出来能再约', () => {
    const { booking, changes } = booked();
    expect(ptCancelDeadline(booking, rules)).toEqual(deadline);
    const res = cancelPtBooking({ booking, cards: [changes[0].card], now: deadline, rules, by: 'member' });
    expect(res.booking).toMatchObject({ status: 'cancelled', closedAt: deadline.toISOString() });
    expect(res.changes).toEqual([{ card: pack(), delta: 1, reason: 'pt_cancel', bookingId: 'b1' }]);
    expect(book({ id: 'b2', memberId: 'lu', bookings: [res.booking], at: deadline }).booking.status).toBe('booked');
  });

  it('截止后会员不能自己取消，员工可以（照样退）；开课后谁都不能取消', () => {
    const { booking, changes } = booked();
    const late = new Date(deadline.getTime() + 60_000);
    expect(ptCancelBlockedBy({ booking, now: late, rules })).toBe('pt-cancel-too-late');
    expect(code(() => cancelPtBooking({ booking, cards: [changes[0].card], now: late, rules, by: 'member' }))).toBe('pt-cancel-too-late');
    expect(cancelPtBooking({ booking, cards: [changes[0].card], now: late, rules, by: 'staff' }).changes[0]).toMatchObject({ delta: 1, reason: 'pt_cancel' });
    expect(code(() => cancelPtBooking({ booking, cards: [changes[0].card], now: new Date(`${on}T14:00:00`), rules, by: 'staff' }))).toBe('pt-started');
  });

  it('截止时间按 ptRules 配置', () => {
    const { booking } = booked();
    expect(ptCancelBlockedBy({ booking, now: new Date(`${on}T12:00:00`), rules: { ...rules, cancelBeforeMinutes: 60 } })).toBeNull();
  });

  it('教练取消、拒绝等确认的：必须写原因，不看截止时间，退课时（pt_void）；取消过的不能再取消', () => {
    const { booking, changes } = booked();
    const late = new Date(`${on}T13:00:00`);
    const res = coachCancelPtBooking({ booking, cards: [changes[0].card], now: late, reason: '教练生病' });
    expect(res.booking).toMatchObject({ status: 'voided', closeReason: '教练生病' });
    expect(res.changes).toEqual([{ card: pack(), delta: 1, reason: 'pt_void', bookingId: 'b1' }]);
    expect(code(() => coachCancelPtBooking({ booking: res.booking, cards: [], now: late, reason: 'x' }))).toBe('booking-not-active');
    expect(code(() => cancelPtBooking({ booking: res.booking, cards: [], now, rules, by: 'member' }))).toBe('booking-not-active');
    const pending = book({ r: { ...rules, needCoachConfirm: true } });
    expect(coachCancelPtBooking({ booking: pending.booking, cards: [pending.changes[0].card], now, reason: '这周出差' }).changes[0].reason).toBe('pt_void');
    expect(code(() => coachCancelPtBooking({ booking, cards: [], now, reason: '  ' }))).toBe('pt-reason-required');
  });
});

describe('后台标记格子', () => {
  it('能标空格为线下约或不接课；跟会员约的、已标的冲突时拦下', () => {
    const base = { coachId: 'max', on, bookings: [] as PtBooking[], marks: [] as PtSlotMark[], now, rules };
    const m = markPtSlot({ ...base, id: 'm1', hour: 15, kind: 'offline', note: '小王' });
    expect(m).toEqual({ id: 'm1', coachId: 'max', on, hour: 15, kind: 'offline', note: '小王' });
    expect(code(() => markPtSlot({ ...base, marks: [m], id: 'm2', hour: 15, kind: 'off' }))).toBe('pt-slot-taken');
    expect(code(() => markPtSlot({ ...base, bookings: [book().booking], id: 'm2', hour: 14, kind: 'offline' }))).toBe('pt-slot-taken');
    expect(code(() => markPtSlot({ ...base, id: 'm2', hour: 8, kind: 'off' }))).toBe('pt-outside-hours');
  });
});
