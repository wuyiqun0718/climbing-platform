import { describe, expect, it } from 'vitest';
import { defaultPtRules } from './gym';
import type { PtBooking, PtSlotMark } from './pt';
import { ptBookingsOn, ptRangeError, ptTimeline } from './ptTimeline';

const coach = (id: string, storeIds = ['bingang']) => ({ id, name: id, tags: [], bio: '', storeIds });
const booking = (over: Partial<PtBooking> = {}): PtBooking => ({ id: 'pb1', coachId: 'max', memberId: 'm1', storeId: 'bingang', on: '2026-10-23', hour: 14, status: 'booked', cardId: 'c1', deducted: 1, createdAt: 'x', ...over });
const mark = (over: Partial<PtSlotMark> = {}): PtSlotMark => ({ id: 'pm1', coachId: 'max', on: '2026-10-23', hour: 15, kind: 'offline', note: '小王', ...over });
const now = new Date('2026-10-23T14:30:00');

describe('私教时间轴', () => {
  it('格子按 ptRules 的营业时间，不写死', () => {
    const r = ptTimeline({ coaches: [coach('max')], from: '2026-10-23', to: '2026-10-23', bookings: [], marks: [], now, rules: { ...defaultPtRules, openHour: 9, closeHour: 12 } });
    expect(r.hours).toEqual([9, 10, 11]);
    expect(r.rows[0]!.days[0]!.slots.map(s => s.hour)).toEqual([9, 10, 11]);
    expect(ptTimeline({ coaches: [coach('max')], from: '2026-10-23', to: '2026-10-23', bookings: [], marks: [], now, rules: defaultPtRules }).hours).toHaveLength(13);
  });

  it('每位教练一行、每天一列；状态 free / member / offline / off，挂上预约和标记；过了的标 past', () => {
    const r = ptTimeline({
      coaches: [coach('max'), coach('may')], from: '2026-10-23', to: '2026-10-24',
      bookings: [booking(), booking({ id: 'pb2', hour: 16, status: 'cancelled' })],
      marks: [mark(), mark({ id: 'pm2', hour: 19, kind: 'off', note: '带队比赛' }), mark({ id: 'pm3', coachId: 'may', on: '2026-10-24', hour: 10, kind: 'off' })],
      now, rules: defaultPtRules,
    });
    expect(r.rows.map(x => [x.coach.id, x.days.map(d => d.on)])).toEqual([['max', ['2026-10-23', '2026-10-24']], ['may', ['2026-10-23', '2026-10-24']]]);
    const max = r.rows[0]!.days[0]!.slots;
    const at = (h: number) => max.find(s => s.hour === h)!;
    expect(at(14)).toMatchObject({ status: 'member', past: true, booking: { id: 'pb1', memberId: 'm1' } });
    expect(at(15)).toMatchObject({ status: 'offline', past: false, mark: { note: '小王' } });
    expect(at(16)).toMatchObject({ status: 'free' }); // 取消了的不占格子
    expect(at(19)).toMatchObject({ status: 'off', mark: { note: '带队比赛' } });
    expect(at(10)).toMatchObject({ status: 'free', past: true });
    expect(r.rows[1]!.days[1]!.slots.find(s => s.hour === 10)).toMatchObject({ status: 'off' });
  });

  it('一次最多 7 天，开始不能晚于结束', () => {
    expect(ptRangeError('2026-10-23', '2026-10-29')).toBeNull();
    expect(ptRangeError('2026-10-23', '2026-10-30')).toBeTruthy();
    expect(ptRangeError('2026-10-24', '2026-10-23')).toBeTruthy();
    expect(ptRangeError('2026-10-23', 'x')).toBeTruthy();
  });

  it('今日约课的私教部分：占着格子的预约，按门店', () => {
    const list = [booking(), booking({ id: 'b', status: 'pending' }), booking({ id: 'c', status: 'attended' }), booking({ id: 'd', status: 'cancelled' }), booking({ id: 'e', status: 'voided' }), booking({ id: 'f', storeId: 'huiju' }), booking({ id: 'g', on: '2026-10-24' })];
    expect(ptBookingsOn(list, '2026-10-23', ['bingang'])).toBe(3);
    expect(ptBookingsOn(list, '2026-10-23', ['bingang', 'huiju'])).toBe(4);
  });
});
