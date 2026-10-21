import { describe, expect, it } from 'vitest';
import type { ClassBooking, ClassSession, ClassType } from './classes';
import { classLedgerEntry, copyWeek, isWeekStart, planSession, rescheduleSession, scheduleConflict, sessionsOverlap, staffCancelSession, weekStartOf } from './classSchedule';
import { RuleError } from './rules';
import type { LessonCard } from './types';

const boulder: ClassType = { id: 't1', name: '入门抱石', minutes: 60, capacity: 2, credits: 1, coachId: 'k1', active: true };
const rope: ClassType = { id: 't2', name: '顶绳', minutes: 90, capacity: 8, credits: 2, active: true };
const now = new Date('2026-10-22T12:00:00');
const at = (on: string, startTime: string, extra: Partial<ClassSession> = {}): ClassSession => ({
  id: `${on}-${startTime}`, classTypeId: 't1', name: '入门抱石', storeId: 'bingang', on, startTime, minutes: 60, capacity: 2, credits: 1, coachId: 'k1', status: 'scheduled', ...extra,
});
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as RuleError).code;
  }
  return null;
};
const plan = (over: Partial<Parameters<typeof planSession>[0]> = {}) =>
  planSession({ type: boulder, id: 'n1', storeId: 'bingang', on: '2026-10-24', startTime: '19:00', sessions: [], now, ...over });

describe('排课：时间和冲突', () => {
  it('时间段有交集才算重叠，首尾相接不算', () => {
    expect(sessionsOverlap(at('2026-10-24', '19:00'), at('2026-10-24', '19:30'))).toBe(true);
    expect(sessionsOverlap(at('2026-10-24', '19:00'), at('2026-10-24', '20:00'))).toBe(false);
    expect(sessionsOverlap(at('2026-10-24', '19:00'), at('2026-10-25', '19:00'))).toBe(false);
  });

  it('同一教练同一时间不行（别的店也不行）；同一门店同一时间不行；取消了的课不算', () => {
    expect(codeOf(() => plan({ storeId: 'huiju', sessions: [at('2026-10-24', '19:30')] }))).toBe('class-coach-busy');
    expect(codeOf(() => plan({ type: rope, sessions: [at('2026-10-24', '18:30', { coachId: 'k2' })] }))).toBe('class-store-busy');
    expect(plan({ sessions: [at('2026-10-24', '19:30', { status: 'cancelled' })] })).toMatchObject({ on: '2026-10-24', startTime: '19:00' });
    expect(plan({ type: rope, storeId: 'huiju', sessions: [at('2026-10-24', '19:00', { coachId: 'k2' })] })).toMatchObject({ storeId: 'huiju' });
    expect(scheduleConflict(at('2026-10-24', '19:00'), [at('2026-10-24', '19:00')])).toBeNull();
  });

  it('时间不对、过了、跨过 24 点、停用的种类都排不了', () => {
    expect(codeOf(() => plan({ startTime: '25:00' }))).toBe('class-time-invalid');
    expect(codeOf(() => plan({ on: '2026-02-30' }))).toBe('class-time-invalid');
    expect(codeOf(() => plan({ startTime: '23:30' }))).toBe('class-time-invalid');
    expect(codeOf(() => plan({ on: '2026-10-22', startTime: '11:00' }))).toBe('class-started');
    expect(codeOf(() => plan({ type: { ...boulder, active: false } }))).toBe('class-type-inactive');
  });

  it('排出来的课按种类拷贝，人数上限、教练可以另填', () => {
    expect(plan({ capacity: 6, coachId: 'k2' })).toEqual({ id: 'n1', classTypeId: 't1', name: '入门抱石', storeId: 'bingang', on: '2026-10-24', startTime: '19:00', minutes: 60, capacity: 6, credits: 1, coachId: 'k2', status: 'scheduled' });
  });
});

describe('改一节课', () => {
  const card: LessonCard = { id: 'c1', kind: 'class', memberId: 'm2', productId: 'p', name: '团课 10 次', total: 10, remaining: 10, expiresOn: '2026-12-31' };
  const booking = (id: string, status: ClassBooking['status'], memberId = 'm1', createdAt = '2026-10-20T10:00:00Z'): ClassBooking => ({ id, sessionId: '2026-10-24-19:00', memberId, status, cardId: 'c1', createdAt, deducted: status === 'booked' ? 1 : 0 });

  it('已经开始的课不能改时间，人数和教练还能改', () => {
    const started = at('2026-10-22', '11:30');
    expect(codeOf(() => rescheduleSession({ session: started, patch: { startTime: '13:00' }, sessions: [], bookings: [], cards: [], now }))).toBe('class-time-locked');
    expect(rescheduleSession({ session: started, patch: { capacity: 5, coachId: null }, sessions: [], bookings: [], cards: [], now }).session).not.toHaveProperty('coachId');
  });

  it('改到的时间要在现在之后、不冲突；取消了的课不能改', () => {
    const s = at('2026-10-24', '19:00');
    expect(codeOf(() => rescheduleSession({ session: s, patch: { on: '2026-10-22', startTime: '10:00' }, sessions: [], bookings: [], cards: [], now }))).toBe('class-started');
    expect(codeOf(() => rescheduleSession({ session: s, patch: { startTime: '20:30' }, sessions: [s, at('2026-10-24', '21:00', { coachId: 'k9' })], bookings: [], cards: [], now }))).toBe('class-store-busy');
    expect(rescheduleSession({ session: s, patch: { startTime: '20:00' }, sessions: [s], bookings: [], cards: [], now }).session.startTime).toBe('20:00');
    expect(codeOf(() => rescheduleSession({ session: { ...s, status: 'cancelled' }, patch: { capacity: 3 }, sessions: [], bookings: [], cards: [], now }))).toBe('class-cancelled');
  });

  it('只换教练也查教练冲突', () => {
    const s = at('2026-10-24', '19:00', { coachId: 'k2' });
    expect(codeOf(() => rescheduleSession({ session: s, patch: { coachId: 'k1' }, sessions: [s, at('2026-10-24', '19:00', { id: 'x', storeId: 'huiju' })], bookings: [], cards: [], now }))).toBe('class-coach-busy');
  });

  it('人数上限不能少于已约上的；调大了候补按先后补上并扣次', () => {
    const s = at('2026-10-24', '19:00');
    const bookings = [booking('b1', 'booked', 'm1'), booking('b2', 'booked', 'm3'), booking('w1', 'waitlisted', 'm2', '2026-10-21T10:00:00Z')];
    expect(codeOf(() => rescheduleSession({ session: s, patch: { capacity: 1 }, sessions: [s], bookings, cards: [card], now }))).toBe('class-full');
    const r = rescheduleSession({ session: s, patch: { capacity: 3 }, sessions: [s], bookings, cards: [card], now });
    expect(r.promoted.map(b => [b.id, b.status, b.deducted])).toEqual([['w1', 'booked', 1]]);
    expect(r.changes).toEqual([{ card: { ...card, remaining: 9 }, delta: -1, reason: 'class_book', bookingId: 'w1' }]);
  });
});

describe('取消一节课', () => {
  it('原因必填；已约的退次（class_void），候补作废，用的是 classes.ts 的 cancelSession', () => {
    const s = at('2026-10-24', '19:00');
    const card: LessonCard = { id: 'c1', kind: 'class', memberId: 'm1', productId: 'p', name: '团课', total: 10, remaining: 9, expiresOn: '2026-12-31' };
    const bookings: ClassBooking[] = [
      { id: 'b1', sessionId: s.id, memberId: 'm1', status: 'booked', cardId: 'c1', createdAt: '2026-10-20T10:00:00Z', deducted: 1 },
      { id: 'w1', sessionId: s.id, memberId: 'm2', status: 'waitlisted', cardId: 'c2', createdAt: '2026-10-20T11:00:00Z', deducted: 0 },
    ];
    expect(codeOf(() => staffCancelSession({ session: s, bookings, cards: [card], reason: ' ', now }))).toBe('reason-required');
    const r = staffCancelSession({ session: s, bookings, cards: [card], reason: ' 教练生病 ', now });
    expect(r.session).toMatchObject({ status: 'cancelled', cancelReason: '教练生病' });
    expect(r.bookings.map(b => [b.id, b.status])).toEqual([['b1', 'voided'], ['w1', 'voided']]);
    expect(r.changes).toEqual([{ card: { ...card, remaining: 10 }, delta: 1, reason: 'class_void', bookingId: 'b1' }]);
    expect(classLedgerEntry({ id: 'l1', change: r.changes[0]!, at: 'x', operator: { operatorType: 'staff', operatorId: 's1' }, note: '教练生病' })).toEqual({
      id: 'l1', cardId: 'c1', at: 'x', on: 'x', delta: 1, remainingAfter: 10, expiresOnAfter: '2026-12-31', reason: 'class_void', refType: 'class_booking', refId: 'b1', operatorType: 'staff', operatorId: 's1', note: '教练生病',
    });
    expect(codeOf(() => staffCancelSession({ session: r.session, bookings, cards: [card], reason: 'x', now }))).toBe('class-cancelled');
  });
});

describe('复制上周课表', () => {
  it('周一算一周开头', () => {
    expect(weekStartOf('2026-10-22')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-25')).toBe('2026-10-19');
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
    expect(isWeekStart('2026-10-26')).toBe(true);
    expect(isWeekStart('2026-10-27')).toBe(false);
  });

  it('挪到下周同一时间，人数和教练照上周；停用的种类、冲突的、时间过了的、取消了的跳过', () => {
    const last = [
      at('2026-10-17', '19:00', { id: 'a', capacity: 6 }), // 下周 10-24：正常
      at('2026-10-18', '10:00', { id: 'b', classTypeId: 't2', name: '顶绳', coachId: undefined }), // 种类停用了
      at('2026-10-16', '19:00', { id: 'c' }), // 下周 10-23 19:00 跟已有的课冲突
      at('2026-10-15', '10:00', { id: 'd' }), // 下周 10-22 10:00 已经过了
      at('2026-10-14', '19:00', { id: 'e', status: 'cancelled' }), // 上周取消了的不复制
      at('2026-10-18', '20:00', { id: 'f', coachId: 'gone' }), // 教练停用了：换成课程的默认教练
    ];
    const existing = [at('2026-10-23', '19:00', { id: 'x', coachId: 'k5' })];
    const r = copyWeek({ week: '2026-10-19', lastWeek: last, types: [boulder, { ...rope, active: false }], sessions: [...last, ...existing], coachIds: ['k1'], newId: i => `new-${i}`, now });
    expect(r.created.map(s => [s.on, s.startTime, s.capacity, s.coachId ?? null])).toEqual([
      ['2026-10-24', '19:00', 6, 'k1'],
      ['2026-10-25', '20:00', 2, 'k1'],
    ]);
    expect(r.skipped).toEqual([
      { sessionId: 'd', code: 'class-started' },
      { sessionId: 'c', code: 'class-store-busy' },
      { sessionId: 'b', code: 'class-type-inactive' },
    ]);
  });

  it('上周的教练和默认教练都停用了：不带教练', () => {
    const r = copyWeek({ week: '2026-10-19', lastWeek: [at('2026-10-17', '19:00', { id: 'a', coachId: 'gone' })], types: [boulder], sessions: [], coachIds: [], newId: () => 'n', now });
    expect(r.created[0]).not.toHaveProperty('coachId');
  });

  it('复制出来的课之间也查冲突；再复制一次全部跳过', () => {
    const last = [at('2026-10-17', '19:00', { id: 'a' })];
    const once = copyWeek({ week: '2026-10-19', lastWeek: last, types: [boulder], sessions: last, coachIds: ['k1'], newId: i => `n${i}`, now });
    const again = copyWeek({ week: '2026-10-19', lastWeek: last, types: [boulder], sessions: [...last, ...once.created], coachIds: ['k1'], newId: i => `m${i}`, now });
    expect(once.created).toHaveLength(1);
    expect(again.created).toEqual([]);
    expect(again.skipped).toEqual([{ sessionId: 'a', code: 'class-coach-busy' }]);
  });
});
