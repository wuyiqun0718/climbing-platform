import { describe, expect, it } from 'vitest';
import { climbCalendar, daysOfMonth, isMonthKey, shiftMonth } from './calendar';

const ci = (on: string, storeId: string, extra: { memberId?: string; voided?: boolean } = {}) => ({ memberId: 'jie', storeId, on, voided: false, ...extra });

describe('攀爬日历', () => {
  it('同一天多次入场只算一天，列出去过的门店（按先后）、入场次数', () => {
    const days = climbCalendar([ci('2026-10-12', 'huiju'), ci('2026-10-03', 'binggang'), ci('2026-10-12', 'binggang'), ci('2026-10-12', 'huiju')], 'jie', '2026-10');
    expect(days).toEqual([
      { on: '2026-10-03', storeIds: ['binggang'], count: 1 },
      { on: '2026-10-12', storeIds: ['huiju', 'binggang'], count: 3 },
    ]);
  });

  it('被前台撤销的入场不算；撤销了那天唯一的一次，那天就不标', () => {
    const days = climbCalendar([ci('2026-10-03', 'binggang', { voided: true }), ci('2026-10-12', 'huiju', { voided: true }), ci('2026-10-12', 'binggang')], 'jie', '2026-10');
    expect(days).toEqual([{ on: '2026-10-12', storeIds: ['binggang'], count: 1 }]);
  });

  it('只看这个会员、这个月', () => {
    const days = climbCalendar([ci('2026-09-30', 'binggang'), ci('2026-11-01', 'binggang'), ci('2026-10-31', 'huiju', { memberId: 'lu' }), ci('2026-10-31', 'huiju')], 'jie', '2026-10');
    expect(days.map(d => d.on)).toEqual(['2026-10-31']);
  });
});

describe('月份', () => {
  it('格式、前后翻月（跨年）、每月的天数（含闰年二月）', () => {
    expect(isMonthKey('2026-10')).toBe(true);
    expect(isMonthKey('2026-13')).toBe(false);
    expect(isMonthKey('2026-1')).toBe(false);
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-03', -1)).toBe('2026-02');
    expect(daysOfMonth('2026-10')).toHaveLength(31);
    expect(daysOfMonth('2026-10')[0]).toBe('2026-10-01');
    expect(daysOfMonth('2028-02')).toHaveLength(29);
    expect(daysOfMonth('2026-02').at(-1)).toBe('2026-02-28');
  });
});
