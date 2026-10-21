import { describe, expect, it } from 'vitest';
import { freezePeriodCard, unfreezePeriodCard } from './freeze';
import { defaultFreezeRules, defaultRules } from './gym';
import { ledgerMismatch, type LedgerEntry } from './ledger';
import { purchaseLedgerEntry } from './order';
import { orderStatus, pastFrozenDays, planRefund, refundableCents, refundBasisText, refundBlockedBy, refundLedgerEntry, suggestedRefund, type RefundLike, type RefundOrder } from './refund';
import { entryOptions, RuleError } from './rules';
import type { CountCard, PeriodCard } from './types';

const today = '2026-10-21';
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };
const ctx = { today, rules: defaultRules, hasCheckedIn: () => false };

const wechat: RefundOrder = { channel: 'wechat', amountCents: 128_000, paidOn: '2026-09-01' };
const cash: RefundOrder = { ...wechat, channel: 'desk_cash' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-03-01' };
// 90 天季卡：9-01 开始，到今天（10-21）用了 50 天，剩 40 天
const season: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'p90', name: '季卡', startsOn: '2026-09-01', expiresOn: '2026-11-29' };
const seasonOrder: RefundOrder = { channel: 'wechat', amountCents: 159_900, paidOn: '2026-09-01' };
const renewal: PeriodCard = { id: 'p2', kind: 'period', memberId: 'jie', productId: 'p30', name: '月卡', startsOn: '2026-11-30', expiresOn: '2026-12-29' };
const ok = (amountCents: number): RefundLike => ({ amountCents, status: 'succeeded' });

describe('能退多少、订单状态', () => {
  it('还能退 = 实付 − 已退，处理中的也算已退，失败的不算', () => {
    expect(refundableCents(wechat, [])).toBe(128_000);
    expect(refundableCents(wechat, [ok(30_000), { amountCents: 20_000, status: 'processing' }, { amountCents: 50_000, status: 'failed' }])).toBe(78_000);
    expect(refundableCents({ ...wechat, paidOn: null }, [])).toBe(0);
  });

  it('订单状态只看退成功的', () => {
    expect(orderStatus(wechat, [])).toBe('paid');
    expect(orderStatus({ ...wechat, paidOn: null }, [])).toBe('unpaid');
    expect(orderStatus(wechat, [ok(30_000)])).toBe('partially_refunded');
    expect(orderStatus(wechat, [ok(30_000), ok(98_000)])).toBe('refunded');
    expect(orderStatus(wechat, [{ amountCents: 128_000, status: 'processing' }])).toBe('paid');
  });

  it('没付款、美团的、退完的不能退', () => {
    expect(refundBlockedBy(wechat, [])).toBeNull();
    expect(refundBlockedBy({ ...wechat, paidOn: null }, [])).toBe('order-not-paid');
    expect(refundBlockedBy({ ...wechat, channel: 'meituan' }, [])).toBe('refund-channel-unsupported');
    expect(refundBlockedBy(wechat, [ok(128_000)])).toBe('order-fully-refunded');
    expect(refundBlockedBy({ ...wechat, channel: 'legacy' }, [])).toBeNull();
  });
});

describe('建议退款金额（占位公式）', () => {
  it('次卡按剩余次数比例，零头舍掉', () => {
    expect(suggestedRefund({ order: wechat, refunds: [], card: tenTimes, frozenDays: 0, today })).toEqual({ cents: 76_800, basis: { kind: 'count', remaining: 6, total: 10 } });
    const three = { ...tenTimes, total: 3, remaining: 1 };
    expect(suggestedRefund({ order: { ...wechat, amountCents: 10_000 }, refunds: [], card: three, frozenDays: 0, today }).cents).toBe(3_333);
  });

  it('期限卡按剩余天数比例，今天算剩余；还没开始的全退', () => {
    const r = suggestedRefund({ order: seasonOrder, refunds: [], card: season, frozenDays: 0, today });
    expect(r.basis).toEqual({ kind: 'period', remainingDays: 40, totalDays: 90, frozenDays: 0 });
    expect(r.cents).toBe(Math.floor((159_900 * 40) / 90));
    expect(suggestedRefund({ order: seasonOrder, refunds: [], card: renewal, frozenDays: 0, today }).basis).toMatchObject({ remainingDays: 30, totalDays: 30 });
    expect(suggestedRefund({ order: seasonOrder, refunds: [], card: { ...season, expiresOn: '2026-10-20' }, frozenDays: 0, today }).cents).toBe(0);
  });

  it('冻结过的天数不算已用：冻 10 天解冻后，剩余和总天数都跟没冻一样', () => {
    const frozen = freezePeriodCard({ card: season, cards: [season], days: 10, history: [], today: '2026-10-01', rules: { ...defaultFreezeRules, maxDays: 30 } }).card;
    const back = unfreezePeriodCard({ card: frozen, cards: [frozen], on: '2026-10-11' }).card;
    expect(back.expiresOn).toBe('2026-12-09');
    const ledger: LedgerEntry[] = [
      { id: 'l1', cardId: 'p1', at: '2026-09-01T10:00:00+08:00', delta: 0, remainingAfter: null, expiresOnAfter: season.expiresOn, reason: 'purchase', ref: null, operatorType: 'member', operatorId: 'jie', note: '' },
      { id: 'l2', cardId: 'p1', at: '2026-10-01T10:00:00+08:00', delta: 0, remainingAfter: null, expiresOnAfter: season.expiresOn, reason: 'freeze', ref: null, operatorType: 'member', operatorId: 'jie', note: '' },
      { id: 'lx', cardId: 'p2', at: '2026-10-01T10:00:00+08:00', delta: 0, remainingAfter: null, expiresOnAfter: '2027-01-01', reason: 'adjust', ref: null, operatorType: 'member', operatorId: 'jie', note: '' },
      { id: 'l3', cardId: 'p1', at: '2026-10-11T10:00:00+08:00', delta: 0, remainingAfter: null, expiresOnAfter: back.expiresOn, reason: 'unfreeze', ref: null, operatorType: 'member', operatorId: 'jie', note: '' },
    ];
    const frozenDays = pastFrozenDays(ledger, 'p1');
    expect(frozenDays).toBe(10);
    const r = suggestedRefund({ order: seasonOrder, refunds: [], card: back, frozenDays, today });
    // 9-01 到 10-20 一共 50 天，冻了 10 天，实际用了 40 天，剩 50 天
    expect(r.basis).toEqual({ kind: 'period', remainingDays: 50, totalDays: 90, frozenDays: 10 });
    expect(refundBasisText(r.basis)).toBe('剩 50/90 天（冻结的 10 天不算）');
  });

  it('正在冻结的从冻结那天起算剩余', () => {
    const frozen = freezePeriodCard({ card: season, cards: [season], days: 30, history: [], today: '2026-10-11', rules: { ...defaultFreezeRules, maxDays: 30 } }).card;
    expect(suggestedRefund({ order: seasonOrder, refunds: [], card: frozen, frozenDays: 0, today }).basis).toMatchObject({ remainingDays: 50, totalDays: 90 });
  });

  it('不超过还能退的；没卡的建议全部能退的；作废、已退款的卡为 0', () => {
    expect(suggestedRefund({ order: wechat, refunds: [ok(100_000)], card: tenTimes, frozenDays: 0, today }).cents).toBe(28_000);
    expect(suggestedRefund({ order: wechat, refunds: [ok(8_000)], card: null, frozenDays: 0, today })).toEqual({ cents: 120_000, basis: { kind: 'none' } });
    expect(suggestedRefund({ order: wechat, refunds: [], card: { ...tenTimes, status: 'refunded' }, frozenDays: 0, today }).cents).toBe(0);
    expect(suggestedRefund({ order: wechat, refunds: [], card: { ...tenTimes, status: 'void' }, frozenDays: 0, today }).cents).toBe(0);
  });
});

describe('退款', () => {
  const plan = (over: Partial<Parameters<typeof planRefund>[0]> = {}) =>
    planRefund({ order: wechat, refunds: [], card: tenTimes, cards: [tenTimes], amountCents: 50_000, reason: '搬家', today, ...over });

  it('微信原路退（处理中），线下的当场成功', () => {
    expect(plan()).toMatchObject({ method: 'wechat_original', status: 'processing' });
    expect(plan({ order: cash })).toMatchObject({ method: 'offline', status: 'succeeded' });
    expect(plan({ order: { ...wechat, channel: 'legacy' } })).toMatchObject({ method: 'offline' });
  });

  it('金额可以改，但不能超过实付减已退；要大于 0；要写原因', () => {
    expect(plan({ amountCents: 128_000 }).method).toBe('wechat_original');
    expect(code(() => plan({ amountCents: 128_001 }))).toBe('refund-exceeds');
    expect(code(() => plan({ amountCents: 30_001, refunds: [ok(98_000)] }))).toBe('refund-exceeds');
    expect(code(() => plan({ amountCents: 30_001, refunds: [{ amountCents: 98_000, status: 'processing' }] }))).toBe('refund-exceeds');
    expect(plan({ amountCents: 30_000, refunds: [{ amountCents: 98_000, status: 'failed' }] }).card?.status).toBe('refunded');
    for (const a of [0, -1, 1.5, NaN]) expect(code(() => plan({ amountCents: a }))).toBe('refund-amount-invalid');
    expect(code(() => plan({ reason: '  ' }))).toBe('reason-required');
    expect(code(() => plan({ order: { ...wechat, channel: 'meituan' } }))).toBe('refund-channel-unsupported');
    expect(code(() => plan({ refunds: [ok(128_000)] }))).toBe('order-fully-refunded');
  });

  it('次卡退了：状态已退款，剩下的次数清零，不能再入场；流水对得上', () => {
    const r = plan();
    expect(r.card).toMatchObject({ status: 'refunded', remaining: 0 });
    expect(r.delta).toBe(-6);
    expect(entryOptions([r.card!], ctx)).toEqual([]);
    const buy = purchaseLedgerEntry({ id: 'l1', card: { ...tenTimes, remaining: 10 }, at: '2026-09-01T10:00:00+08:00', orderId: 'o1', operator: { operatorType: 'member', operatorId: 'jie' } });
    const use: LedgerEntry = { ...buy, id: 'l2', delta: -4, remainingAfter: 6, reason: 'check_in' };
    const entry = refundLedgerEntry({ id: 'l3', card: r.card!, delta: r.delta, at: '2026-10-21T15:00:00+08:00', orderId: 'o1', operator: { operatorType: 'staff', operatorId: 's1' }, note: '搬家' });
    expect(entry).toMatchObject({ reason: 'refund', delta: -6, remainingAfter: 0, ref: { type: 'order', id: 'o1' } });
    expect(ledgerMismatch(r.card!, [buy, use, entry])).toBeNull();
  });

  it('同一订单再退：卡已经是已退款，不再改卡', () => {
    const r = plan({ card: { ...tenTimes, status: 'refunded', remaining: 0 }, refunds: [ok(50_000)], amountCents: 10_000 });
    expect(r).toMatchObject({ delta: 0, followers: [] });
    expect(r.card?.status).toBe('refunded');
  });

  it('期限卡退了：后面续的卡往前挪到今天开始；冻结中的去掉冻结', () => {
    const r = plan({ order: seasonOrder, card: season, cards: [season, renewal] });
    expect(r.card).toMatchObject({ status: 'refunded', expiresOn: season.expiresOn });
    expect(r.followers).toEqual([{ ...renewal, startsOn: today, expiresOn: '2026-11-19' }]);

    const frozen = freezePeriodCard({ card: season, cards: [season, renewal], days: 20, history: [], today: '2026-10-11', rules: { ...defaultFreezeRules, maxDays: 30 } });
    const f = plan({ order: seasonOrder, card: frozen.card, cards: [frozen.card, ...frozen.followers] });
    expect(f.card).not.toHaveProperty('frozenFrom');
    expect(f.card?.status).toBe('refunded');
    expect(f.followers[0]).toMatchObject({ startsOn: today, expiresOn: '2026-11-19' });
  });

  it('退还没开始的续费卡：再后面的卡接到它的开始日；已经过期的卡不动后面的', () => {
    const third: PeriodCard = { ...renewal, id: 'p3', startsOn: '2026-12-30', expiresOn: '2027-01-28' };
    expect(plan({ order: seasonOrder, card: renewal, cards: [season, renewal, third] }).followers).toEqual([{ ...third, startsOn: renewal.startsOn, expiresOn: '2026-12-29' }]);
    const old = { ...season, startsOn: '2026-06-01', expiresOn: '2026-08-29' };
    const active = { ...renewal, startsOn: '2026-08-30', expiresOn: '2026-11-27' };
    expect(plan({ order: seasonOrder, card: old, cards: [old, active] }).followers).toEqual([]);
  });

  it('没卡的订单只记退款', () => {
    expect(plan({ card: null, cards: [] })).toEqual({ method: 'wechat_original', status: 'processing', card: null, delta: 0, followers: [] });
  });
});
