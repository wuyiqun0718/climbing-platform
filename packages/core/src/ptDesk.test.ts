import { describe, expect, it } from 'vitest';
import { defaultPtRules } from './gym';
import { bookPt, confirmPtBooking, markPtSlot, type PtBooking, type PtSlotMark } from './pt';
import { deskCancelPtBooking, ptLedgerEntry, ptRulesErrors, unmarkPtSlotBlockedBy } from './ptDesk';
import { RuleError } from './rules';
import type { LessonCard } from './types';

const on = '2026-10-23';
const now = new Date('2026-10-22T10:00:00');
const card: LessonCard = { id: 'c1', kind: 'pt', memberId: 'm1', productId: 'p', name: '私教 5 节', total: 5, remaining: 4, expiresOn: '2026-12-31' };
const booking = (over: Partial<PtBooking> = {}): PtBooking => ({ id: 'pb1', coachId: 'max', memberId: 'm1', storeId: 'bingang', on, hour: 14, status: 'booked', cardId: 'c1', deducted: 1, createdAt: 'x', ...over });
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as RuleError).code;
  }
  return null;
};

describe('同一教练同一时段不能约两次（pt.ts 的规则）', () => {
  const base = { coachId: 'max', on, hour: 14, now, rules: defaultPtRules };
  it('会员约了的格子别的会员约不了、后台也标不了；后台标了的会员约不了', () => {
    const other: LessonCard = { ...card, id: 'c2', memberId: 'm2' };
    expect(codeOf(() => bookPt({ ...base, id: 'pb2', storeId: 'bingang', bookings: [booking()], marks: [], cards: [other], memberId: 'm2' }))).toBe('pt-slot-taken');
    expect(codeOf(() => markPtSlot({ ...base, id: 'pm1', kind: 'offline', bookings: [booking()], marks: [] }))).toBe('pt-slot-taken');
    const mark: PtSlotMark = { id: 'pm1', coachId: 'max', on, hour: 14, kind: 'offline' };
    expect(codeOf(() => markPtSlot({ ...base, id: 'pm2', kind: 'off', bookings: [], marks: [mark] }))).toBe('pt-slot-taken');
    expect(codeOf(() => bookPt({ ...base, id: 'pb2', storeId: 'bingang', bookings: [], marks: [{ ...mark, kind: 'off' }], cards: [other], memberId: 'm2' }))).toBe('pt-coach-off');
  });

  it('取消了的预约不占格子，可以再标', () => {
    expect(markPtSlot({ ...base, id: 'pm1', kind: 'offline', note: '小王', bookings: [booking({ status: 'cancelled' })], marks: [] })).toMatchObject({ kind: 'offline', note: '小王' });
  });
});

describe('后台取消私教', () => {
  const run = (kind: 'member' | 'coach', reason: string, at = now, b = booking()) => deskCancelPtBooking({ booking: b, cards: [card], now: at, rules: defaultPtRules, kind, reason });

  it('原因必填（会员要取消、教练取消都要）', () => {
    expect(codeOf(() => run('member', ' '))).toBe('pt-reason-required');
    expect(codeOf(() => run('coach', ''))).toBe('pt-reason-required');
  });

  it('会员要取消：越过自助截止也能取消，退课时 pt_cancel，原因记在预约上', () => {
    const r = run('member', '会员说生病了', new Date('2026-10-23T09:00:00'));
    expect(r.booking).toMatchObject({ status: 'cancelled', closeReason: '会员说生病了' });
    expect(r.changes).toEqual([{ card: { ...card, remaining: 5 }, delta: 1, reason: 'pt_cancel', bookingId: 'pb1' }]);
  });

  it('教练取消或拒绝（等确认的也行）：退课时 pt_void', () => {
    const r = run('coach', '教练临时有事', now, booking({ status: 'pending' }));
    expect(r.booking).toMatchObject({ status: 'voided', closeReason: '教练临时有事' });
    expect(r.changes[0]).toMatchObject({ delta: 1, reason: 'pt_void' });
  });

  it('开课后会员那种不能取消；已经取消的不能再取消', () => {
    expect(codeOf(() => run('member', 'x', new Date('2026-10-23T14:00:00')))).toBe('pt-started');
    expect(codeOf(() => run('coach', 'x', now, booking({ status: 'cancelled' })))).toBe('booking-not-active');
  });

  it('流水关联到私教预约', () => {
    const r = run('coach', '有事');
    expect(ptLedgerEntry({ id: 'l1', change: r.changes[0]!, at: 't', operator: { operatorType: 'staff', operatorId: 's1' }, note: '有事' })).toEqual({
      id: 'l1', cardId: 'c1', at: 't', on: 't', delta: 1, remainingAfter: 5, expiresOnAfter: '2026-12-31', reason: 'pt_void', refType: 'pt_booking', refId: 'pb1', operatorType: 'staff', operatorId: 's1', note: '有事',
    });
  });
});

describe('确认、去掉标记、私教规则', () => {
  it('只有等确认的能确认', () => {
    expect(confirmPtBooking(booking({ status: 'pending' })).status).toBe('booked');
    expect(codeOf(() => confirmPtBooking(booking()))).toBe('pt-booking-not-pending');
  });

  it('过了的标记不能去掉', () => {
    const mark: PtSlotMark = { id: 'pm1', coachId: 'max', on: '2026-10-22', hour: 10, kind: 'off' };
    expect(unmarkPtSlotBlockedBy(mark, now)).toBe('pt-slot-past');
    expect(unmarkPtSlotBlockedBy({ ...mark, hour: 11 }, now)).toBeNull();
  });

  it('私教规则的校验', () => {
    expect(ptRulesErrors(defaultPtRules)).toBeNull();
    expect(ptRulesErrors({ ...defaultPtRules, closeHour: 10 })?.closeHour).toBeTruthy();
    expect(ptRulesErrors({ ...defaultPtRules, openHour: 24 })?.openHour).toBeTruthy();
    expect(ptRulesErrors({ ...defaultPtRules, cancelBeforeMinutes: -1 })?.cancelBeforeMinutes).toBeTruthy();
    expect(ptRulesErrors({ ...defaultPtRules, needCoachConfirm: 'yes' })?.needCoachConfirm).toBeTruthy();
  });
});
