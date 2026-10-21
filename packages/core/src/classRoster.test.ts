import { describe, expect, it } from 'vitest';
import type { ClassBooking, ClassSession } from './classes';
import { attendBooking, classBookingsOn, classRoster, staffCancelBooking } from './classRoster';
import { defaultClassRules } from './gym';
import { RuleError } from './rules';
import type { LessonCard } from './types';

const session: ClassSession = { id: 's1', classTypeId: 't1', name: '入门抱石', storeId: 'bingang', on: '2026-10-22', startTime: '19:00', minutes: 60, capacity: 1, credits: 1, status: 'scheduled' };
const b = (id: string, status: ClassBooking['status'], memberId: string, createdAt: string, cardId = `c-${memberId}`): ClassBooking => ({
  id, sessionId: 's1', memberId, status, cardId, createdAt, deducted: status === 'booked' || status === 'attended' || status === 'absent' ? 1 : 0,
});
const card = (memberId: string, remaining: number): LessonCard => ({ id: `c-${memberId}`, kind: 'class', memberId, productId: 'p', name: '团课 10 次', total: 10, remaining, expiresOn: '2026-12-31' });
const at = (hhmm: string) => new Date(`2026-10-22T${hhmm}:00`);
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as RuleError).code;
  }
  return null;
};

describe('团课名单', () => {
  it('约上的按约课先后，候补带位次，取消作废的放后面；别的课的不算', () => {
    const list = [
      b('w2', 'waitlisted', 'm4', '2026-10-20T12:00:00Z'),
      b('b1', 'attended', 'm1', '2026-10-20T10:00:00Z'),
      b('w1', 'waitlisted', 'm3', '2026-10-20T11:00:00Z'),
      b('x', 'cancelled', 'm5', '2026-10-20T09:00:00Z'),
      { ...b('o', 'booked', 'm6', '2026-10-20T09:00:00Z'), sessionId: 'other' },
    ];
    const r = classRoster('s1', list);
    expect(r.booked.map(x => x.id)).toEqual(['b1']);
    expect(r.waitlist.map(x => [x.id, x.position])).toEqual([['w1', 1], ['w2', 2]]);
    expect(r.closed.map(x => x.id)).toEqual(['x']);
  });
});

describe('签到', () => {
  const booked = b('b1', 'booked', 'm1', '2026-10-20T10:00:00Z');
  const run = (now: Date, present = true, bk = booked, s = session) => attendBooking({ booking: bk, session: s, present, now, rules: defaultClassRules });

  it('开课前 30 分钟起能签；迟到宽限内是到课，超过算缺席（迟到）', () => {
    expect(codeOf(() => run(at('18:29')))).toBe('class-checkin-not-open');
    expect(run(at('18:30'))).toEqual({ booking: { ...booked, status: 'attended' }, late: false });
    expect(run(at('19:15')).booking.status).toBe('attended');
    expect(run(at('19:16'))).toEqual({ booking: { ...booked, status: 'absent' }, late: true });
    expect(run(at('19:05'), true, booked, session).late).toBe(false);
  });

  it('迟到宽限按 classRules', () => {
    expect(attendBooking({ booking: booked, session, present: true, now: at('19:20'), rules: { ...defaultClassRules, lateGraceMinutes: 30 } }).booking.status).toBe('attended');
  });

  it('可以直接标缺席；标错了能在到课、缺席之间改', () => {
    expect(run(at('20:00'), false).booking.status).toBe('absent');
    expect(run(at('19:10'), true, { ...booked, status: 'absent' }).booking.status).toBe('attended');
  });

  it('候补、取消、作废的不能签；取消了的课不能签', () => {
    for (const s of ['waitlisted', 'cancelled', 'voided'] as const) expect(codeOf(() => run(at('19:00'), true, { ...booked, status: s }))).toBe('booking-not-active');
    expect(codeOf(() => run(at('19:00'), true, booked, { ...session, status: 'cancelled' }))).toBe('class-cancelled');
  });
});

describe('帮会员取消', () => {
  const bookings = [b('b1', 'booked', 'm1', '2026-10-20T10:00:00Z'), b('w1', 'waitlisted', 'm2', '2026-10-20T11:00:00Z')];
  const cards = [card('m1', 9), card('m2', 10)];

  it('原因必填；过了自助截止也能取消，退次，候补第一位补上并扣次', () => {
    const args = { booking: bookings[0]!, session, bookings, cards, now: at('18:30'), rules: defaultClassRules };
    expect(codeOf(() => staffCancelBooking({ ...args, reason: ' ' }))).toBe('reason-required');
    const r = staffCancelBooking({ ...args, reason: '会员打电话说不来' });
    expect(r.booking).toMatchObject({ id: 'b1', status: 'cancelled' });
    expect(r.promoted.map(x => [x.id, x.status, x.deducted])).toEqual([['w1', 'booked', 1]]);
    expect(r.changes).toEqual([
      { card: card('m1', 10), delta: 1, reason: 'class_cancel', bookingId: 'b1' },
      { card: card('m2', 9), delta: -1, reason: 'class_book', bookingId: 'w1' },
    ]);
  });

  it('开课后不能取消', () => {
    expect(codeOf(() => staffCancelBooking({ booking: bookings[0]!, session, bookings, cards, now: at('19:00'), rules: defaultClassRules, reason: 'x' }))).toBe('class-started');
  });
});

describe('今日约课', () => {
  it('当天、这些店、没取消的课里占名额的人次；候补、取消的不算', () => {
    const s2: ClassSession = { ...session, id: 's2', storeId: 'huiju' };
    const s3: ClassSession = { ...session, id: 's3', status: 'cancelled' };
    const s4: ClassSession = { ...session, id: 's4', on: '2026-10-23' };
    const list = [
      b('a', 'booked', 'm1', 'x'), b('b', 'attended', 'm2', 'x'), b('c', 'absent', 'm3', 'x'), b('d', 'waitlisted', 'm4', 'x'), b('e', 'cancelled', 'm5', 'x'),
      { ...b('f', 'booked', 'm6', 'x'), sessionId: 's2' }, { ...b('g', 'voided', 'm7', 'x'), sessionId: 's3' }, { ...b('h', 'booked', 'm8', 'x'), sessionId: 's4' },
    ];
    expect(classBookingsOn([session, s2, s3, s4], list, '2026-10-22', ['bingang'])).toBe(3);
    expect(classBookingsOn([session, s2, s3, s4], list, '2026-10-22', ['bingang', 'huiju'])).toBe(4);
  });
});
