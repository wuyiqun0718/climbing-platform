import { describe, expect, it } from 'vitest';
import {
  bookClass, cancelBooking, cancelDeadline, cancelSession, classCardOptions, fillFromWaitlist, isLateForClass, sessionSeats,
  type ClassBooking, type ClassSession,
} from './classes';
import { defaultClassRules, defaultRules, defineGym, type ClassRules } from './gym';
import { RuleError } from './rules';
import type { Card, LessonCard } from './types';

const session: ClassSession = {
  id: 's1', classTypeId: 't1', name: '入门抱石', storeId: 'binggang', on: '2026-10-22', startTime: '19:00',
  minutes: 90, capacity: 2, credits: 1, status: 'scheduled',
};
const at = (hhmm: string, on = '2026-10-22') => new Date(`${on}T${hhmm}:00`);
const now = at('10:00');
const pack = (memberId: string, extra: Partial<LessonCard> = {}): LessonCard => ({
  id: `k-${memberId}`, kind: 'class', memberId, productId: 'class10', name: '团课 10 次', total: 10, remaining: 5, expiresOn: '2027-01-31', ...extra,
});
const rules: ClassRules = defaultClassRules;
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };

/** 按顺序约课，返回所有预约和最新的卡 */
function book(members: string[], opts: { r?: ClassRules; cards?: Card[]; s?: ClassSession } = {}) {
  let bookings: ClassBooking[] = [];
  let cards: Card[] = opts.cards ?? members.map(m => pack(m));
  members.forEach((m, i) => {
    const res = bookClass({ id: `b${i + 1}`, session: opts.s ?? session, bookings, cards, memberId: m, now: new Date(now.getTime() + i * 1000), rules: opts.r ?? rules });
    bookings = [...bookings, res.booking];
    for (const ch of res.changes) cards = cards.map(c => (c.id === ch.card.id ? ch.card : c));
  });
  return { bookings, cards };
}
const remaining = (cards: Card[], m: string) => (cards.find(c => c.id === `k-${m}`) as LessonCard).remaining;

describe('团课规则配置', () => {
  it('默认值是占位：开课前 2 小时截止取消、开候补；岩馆配置能单独改一项', () => {
    expect(defaultRules.classRules).toEqual({ cancelBeforeMinutes: 120, waitlist: true, waitlistMax: null, lateGraceMinutes: 15 });
    const gym = defineGym({ id: 'x', name: 'x', shortName: 'x', wechatAppId: '', entryQrLink: '', logo: '', openHours: { open: '10:00', close: '22:00' }, theme: {} as never, rules: { classRules: { waitlist: false } } });
    expect(gym.rules.classRules).toEqual({ ...defaultClassRules, waitlist: false });
    expect(cancelDeadline(session, rules)).toEqual(at('17:00'));
    expect(isLateForClass(session, at('19:15'), rules)).toBe(false);
    expect(isLateForClass(session, at('19:16'), rules)).toBe(true);
  });
});

describe('约课', () => {
  it('有名额约上并扣团课次数，流水记 class_book', () => {
    const res = bookClass({ id: 'b1', session, bookings: [], cards: [pack('jie')], memberId: 'jie', now, rules });
    expect(res.booking).toMatchObject({ status: 'booked', cardId: 'k-jie', deducted: 1 });
    expect(res.changes).toEqual([{ card: { ...pack('jie'), remaining: 4 }, delta: -1, reason: 'class_book', bookingId: 'b1' }]);
  });

  it('只扣团课课包：次卡、私教课包、冻结、过期（上课那天）、用完的都不能约', () => {
    const count: Card = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-01-01' };
    const bad: Card[] = [
      count,
      { ...pack('jie'), id: 'pt', kind: 'pt' },
      { ...pack('jie'), id: 'f', status: 'frozen' },
      { ...pack('jie'), id: 'v', status: 'void' },
      { ...pack('jie'), id: 'e', expiresOn: '2026-10-21' },
      { ...pack('jie'), id: 'z', remaining: 0 },
      { ...pack('lu'), id: 'other' },
    ];
    expect(classCardOptions(bad, 'jie', session)).toEqual([]);
    expect(code(() => bookClass({ id: 'b1', session, bookings: [], cards: bad, memberId: 'jie', now, rules }))).toBe('class-no-card');
    // 指定了不能用的卡也不行
    expect(code(() => bookClass({ id: 'b1', session, bookings: [], cards: [pack('jie'), ...bad], memberId: 'jie', cardId: 'f', now, rules }))).toBe('class-no-card');
  });

  it('不填卡用先到期的课包；上课当天到期的也能用', () => {
    const late = pack('jie', { id: 'late', expiresOn: '2027-06-01' });
    const soon = pack('jie', { id: 'soon', expiresOn: '2026-10-22' });
    expect(classCardOptions([late, soon], 'jie', session).map(c => c.id)).toEqual(['soon', 'late']);
  });

  it('同一会员同一节课不能重复约（候补中也不行）；取消后可以再约', () => {
    const { bookings, cards } = book(['jie']);
    expect(code(() => bookClass({ id: 'b2', session, bookings, cards, memberId: 'jie', now, rules }))).toBe('class-already-booked');
    const full = book(['a', 'b', 'jie']);
    expect(full.bookings[2].status).toBe('waitlisted');
    expect(code(() => bookClass({ id: 'b9', session, bookings: full.bookings, cards: full.cards, memberId: 'jie', now, rules }))).toBe('class-already-booked');
    const c = cancelBooking({ booking: bookings[0], session, bookings, cards, now, rules, by: 'member' });
    expect(bookClass({ id: 'b3', session, bookings: [c.booking], cards: c.changes.map(x => x.card), memberId: 'jie', now, rules }).booking.status).toBe('booked');
  });

  it('满员进候补、不扣次；关了候补直接拒；候补人数有上限', () => {
    const { bookings, cards } = book(['a', 'b', 'c']);
    expect(bookings.map(b => b.status)).toEqual(['booked', 'booked', 'waitlisted']);
    expect(remaining(cards, 'c')).toBe(5);
    expect(sessionSeats(session, bookings)).toEqual({ booked: 2, waitlisted: 1, left: 0 });
    expect(code(() => book(['a', 'b', 'c'], { r: { ...rules, waitlist: false } }))).toBe('class-full');
    expect(code(() => book(['a', 'b', 'c', 'd'], { r: { ...rules, waitlistMax: 1 } }))).toBe('class-waitlist-full');
  });

  it('开课后、被取消的课不能约', () => {
    expect(code(() => bookClass({ id: 'b1', session, bookings: [], cards: [pack('jie')], memberId: 'jie', now: at('19:00'), rules }))).toBe('class-started');
    expect(code(() => bookClass({ id: 'b1', session: { ...session, status: 'cancelled' }, bookings: [], cards: [pack('jie')], memberId: 'jie', now, rules }))).toBe('class-cancelled');
  });
});

describe('取消', () => {
  it('截止前取消退回次数（class_cancel）；候补第一位自动补上并扣次', () => {
    const { bookings, cards } = book(['a', 'b', 'c', 'd']);
    const res = cancelBooking({ booking: bookings[0], session, bookings, cards, now: at('17:00'), rules, by: 'member' });
    expect(res.booking).toMatchObject({ status: 'cancelled', closedAt: at('17:00').toISOString() });
    expect(res.promoted.map(b => [b.memberId, b.status, b.deducted])).toEqual([['c', 'booked', 1]]);
    expect(res.changes.map(c => [c.card.id, c.delta, c.reason, c.card.remaining])).toEqual([
      ['k-a', 1, 'class_cancel', 5],
      ['k-c', -1, 'class_book', 4],
    ]);
  });

  it('截止后会员不能自己取消；前台可以，照样退次', () => {
    const { bookings, cards } = book(['a']);
    expect(code(() => cancelBooking({ booking: bookings[0], session, bookings, cards, now: at('17:01'), rules, by: 'member' }))).toBe('class-cancel-too-late');
    expect(cancelBooking({ booking: bookings[0], session, bookings, cards, now: at('17:01'), rules, by: 'staff' }).changes[0]).toMatchObject({ delta: 1, reason: 'class_cancel' });
    expect(code(() => cancelBooking({ booking: bookings[0], session, bookings, cards, now: at('19:00'), rules, by: 'staff' }))).toBe('class-started');
  });

  it('截止时间按 classRules 配置', () => {
    const { bookings, cards } = book(['a']);
    const r = { ...rules, cancelBeforeMinutes: 24 * 60 };
    expect(code(() => cancelBooking({ booking: bookings[0], session, bookings, cards, now, rules: r, by: 'member' }))).toBe('class-cancel-too-late');
  });

  it('候补的人取消：不涉及次数，开课前都能取消，也不会触发补位', () => {
    const { bookings, cards } = book(['a', 'b', 'c']);
    const res = cancelBooking({ booking: bookings[2], session, bookings, cards, now: at('18:30'), rules, by: 'member' });
    expect(res).toMatchObject({ booking: { status: 'cancelled' }, promoted: [], changes: [] });
  });

  it('已经取消的不能再取消', () => {
    const { bookings, cards } = book(['a']);
    const { booking } = cancelBooking({ booking: bookings[0], session, bookings, cards, now, rules, by: 'member' });
    expect(code(() => cancelBooking({ booking, session, bookings: [booking], cards, now, rules, by: 'member' }))).toBe('booking-not-active');
  });

  it('补位时候补第一位的课包不能用了，换他别的课包；都不能用就跳过，补下一位', () => {
    const { bookings, cards } = book(['a', 'b', 'c', 'd']);
    const frozen = cards.map(c => (c.id === 'k-c' ? { ...c, status: 'frozen' as const } : c));
    const res = cancelBooking({ booking: bookings[0], session, bookings, cards: frozen, now, rules, by: 'member' });
    expect(res.promoted.map(b => b.memberId)).toEqual(['d']);
    const spare = pack('c', { id: 'k-c2' });
    const res2 = cancelBooking({ booking: bookings[0], session, bookings, cards: [...frozen, spare], now, rules, by: 'member' });
    expect(res2.promoted).toMatchObject([{ memberId: 'c', cardId: 'k-c2' }]);
  });

  it('开课后不补位', () => {
    const { bookings, cards } = book(['a', 'b', 'c']);
    const freed = bookings.map(b => (b.id === 'b1' ? { ...b, status: 'cancelled' as const } : b));
    expect(fillFromWaitlist({ session, bookings: freed, cards, now: at('19:00') }).bookings).toEqual([]);
    expect(fillFromWaitlist({ session, bookings: freed, cards, now }).bookings.map(b => b.memberId)).toEqual(['c']);
  });
});

describe('岩馆取消一节课', () => {
  it('约上的全部退次（class_void），候补的作废；不能取消两次', () => {
    const { bookings, cards } = book(['a', 'b', 'c']);
    const res = cancelSession({ session, bookings, cards, reason: '教练生病', now });
    expect(res.session).toMatchObject({ status: 'cancelled', cancelReason: '教练生病' });
    expect(res.bookings.map(b => [b.memberId, b.status])).toEqual([['a', 'voided'], ['b', 'voided'], ['c', 'voided']]);
    expect(res.changes.map(c => [c.card.id, c.delta, c.reason, c.card.remaining])).toEqual([['k-a', 1, 'class_void', 5], ['k-b', 1, 'class_void', 5]]);
    expect(code(() => cancelSession({ session: res.session, bookings, cards, reason: 'x', now }))).toBe('class-cancelled');
  });

  it('同一个人用同一张课包约了两节，取消其中一节只退那一节', () => {
    const other = { ...session, id: 's2', startTime: '20:30' };
    let cards: Card[] = [pack('a')];
    const b1 = bookClass({ id: 'b1', session, bookings: [], cards, memberId: 'a', now, rules });
    cards = [b1.changes[0].card];
    const b2 = bookClass({ id: 'b2', session: other, bookings: [b1.booking], cards, memberId: 'a', now, rules });
    cards = [b2.changes[0].card];
    expect(remaining(cards, 'a')).toBe(3);
    const res = cancelSession({ session, bookings: [b1.booking, b2.booking], cards, reason: 'x', now });
    expect(res.bookings.map(b => b.id)).toEqual(['b1']);
    expect(res.changes[0].card.remaining).toBe(4);
  });
});
