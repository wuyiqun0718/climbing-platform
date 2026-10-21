import { describe, expect, it } from 'vitest';
import { FINANCE_MAX_RANGE_DAYS, financeRangeError, summarizeRevenue, type RevenueOrder, type RevenueRefund } from './finance';

const order = (id: string, channel: RevenueOrder['channel'], category: RevenueOrder['category'], amountCents: number, paidOn: string | null): RevenueOrder => ({
  id, storeId: 'bingang', channel, category, amountCents, paidOn,
});

const orders: RevenueOrder[] = [
  order('o1', 'wechat', 'period', 59_900, '2026-10-01'),
  order('o2', 'desk_cash', 'count', 128_000, '2026-10-05'),
  order('o3', 'meituan', 'single', 9_900, '2026-10-21'),
  order('o4', 'desk_pos', 'pt', 41_000, '2026-09-30'), // 上个月收的
  order('o5', 'wechat', 'event', 12_000, null), // 没付款
  order('o6', 'legacy', 'count', 200_000, '2026-10-02'), // 青橙导入
];
const refunds: RevenueRefund[] = [
  { id: 'r1', orderId: 'o2', amountCents: 30_000, refundedOn: '2026-10-10' },
  { id: 'r2', orderId: 'o4', amountCents: 41_000, refundedOn: '2026-10-03' }, // 上个月的订单这个月退
  { id: 'r3', orderId: 'o1', amountCents: 59_900, refundedOn: null }, // 还没退成功
  { id: 'r4', orderId: 'o6', amountCents: 100, refundedOn: '2026-10-04' }, // legacy 的不算
];

describe('财务汇总', () => {
  const s = summarizeRevenue(orders, refunds, '2026-10-01', '2026-10-21');

  it('营收按收款日，不含没付款和青橙导入的', () => {
    expect(s.grossCents).toBe(59_900 + 128_000 + 9_900);
  });

  it('退款按退款成功日，记回原订单的渠道和品类', () => {
    expect(s.refundCents).toBe(30_000 + 41_000);
    expect(s.netCents).toBe(s.grossCents - s.refundCents);
    expect(s.byChannel.find(b => b.key === 'desk_pos')).toMatchObject({ orders: 0, grossCents: 0, refunds: 1, refundCents: 41_000 });
    expect(s.byCategory.find(b => b.key === 'count')).toMatchObject({ orders: 1, grossCents: 128_000, refunds: 1, refundCents: 30_000 });
    expect(s.refunds.map(r => r.id)).toEqual(['r1', 'r2']);
  });

  it('合计 = 渠道分项之和 = 品类分项之和，所有渠道和品类都返回', () => {
    for (const rows of [s.byChannel, s.byCategory]) {
      expect(rows.reduce((n, b) => n + b.grossCents, 0)).toBe(s.grossCents);
      expect(rows.reduce((n, b) => n + b.refundCents, 0)).toBe(s.refundCents);
    }
    expect(s.byChannel.map(b => b.key)).toEqual(['wechat', 'desk_cash', 'desk_pos', 'desk_transfer', 'meituan']);
    expect(s.byCategory).toHaveLength(6);
  });

  it('日期范围含两头', () => {
    expect(summarizeRevenue(orders, [], '2026-10-21', '2026-10-21').grossCents).toBe(9_900);
    expect(summarizeRevenue(orders, [], '2026-09-30', '2026-09-30').grossCents).toBe(41_000);
  });

  it('日期范围校验', () => {
    expect(financeRangeError('2026-10-01', '2026-10-21')).toBeNull();
    expect(financeRangeError('2026-10-22', '2026-10-21')).not.toBeNull();
    expect(financeRangeError('2026-10', '2026-10-21')).not.toBeNull();
    expect(financeRangeError('2026-01-01', '2027-01-01')).toBeNull(); // 正好 366 天
    expect(financeRangeError('2026-01-01', '2027-01-02')).toBe(`一次最多查 ${FINANCE_MAX_RANGE_DAYS} 天`);
  });
});
