import { describe, expect, it } from 'vitest';
import { defaultRules } from './gym';
import { assertPayable, cardFromProduct, closeIfExpired, createOrder, isPayable, payOrder, snapshotOf } from './orders';
import type { Card, PeriodCard, Product } from './types';

const now = new Date('2026-10-21T10:00:00.000Z');
const today = '2026-10-21';
const c10: Product = { id: 'c10', category: 'count', name: '10 次卡', priceCents: 89900, quantity: 10, validMonths: 6, perks: ['三店通用'], onSale: true };
const month: Product = { id: 'month', category: 'period', name: '月卡', priceCents: 59900, days: 30, perks: [], onSale: true };
const single: Product = { id: 'single', category: 'count', name: '单次票', priceCents: 10800, quantity: 1, perks: [], onSale: true };
const pt5: Product = { id: 'pt5', category: 'pt', name: '私教 5 节', priceCents: 198000, quantity: 5, validMonths: 6, perks: [], onSale: true };

const order = () => createOrder({ id: 'o1', product: c10, memberId: 'jie', channel: 'wechat', now, rules: defaultRules });

describe('订单', () => {
  it('下单是待支付，金额和商品快照取下单时的', () => {
    const o = order();
    expect(o).toMatchObject({ status: 'pending', amountCents: 89900, product: { id: 'c10', name: '10 次卡', quantity: 10, validMonths: 6 } });
    expect(o.product).not.toHaveProperty('perks');
    expect(o.expiresAt).toBe('2026-10-21T10:15:00.000Z');
  });

  it('不卖了的不能下单', () => {
    expect(() => createOrder({ id: 'o1', product: { ...c10, onSale: false }, memberId: 'jie', channel: 'wechat', now, rules: defaultRules }))
      .toThrow(expect.objectContaining({ code: 'product-off-sale' }));
  });

  it('过了付款时限还没付就关闭', () => {
    expect(closeIfExpired(order(), new Date('2026-10-21T10:14:59.000Z')).status).toBe('pending');
    expect(closeIfExpired(order(), new Date('2026-10-21T10:15:00.000Z')).status).toBe('closed');
  });

  it('支付回调只有第一次发卡，重复回调不再发', () => {
    const pay = { at: '2026-10-21T10:01:00.000Z', transactionId: 'wx-1', amountCents: 89900 };
    const first = payOrder(order(), pay);
    expect(first).toMatchObject({ issue: true, order: { status: 'paid', paidAt: pay.at, wxTransactionId: 'wx-1' } });
    expect(payOrder(first.order, pay)).toEqual({ order: first.order, issue: false });
  });

  it('关闭的订单、金额不对的回调不认', () => {
    const pay = { at: '2026-10-21T10:20:00.000Z', transactionId: 'wx-1', amountCents: 89900 };
    expect(() => payOrder({ ...order(), status: 'closed' }, pay)).toThrow(expect.objectContaining({ code: 'order-closed' }));
    expect(() => payOrder(order(), { ...pay, amountCents: 1 })).toThrow(expect.objectContaining({ code: 'order-amount-mismatch' }));
  });

  it('只有待支付、没超时的订单能接着付', () => {
    const before = new Date('2026-10-21T10:14:59.000Z');
    const after = new Date('2026-10-21T10:15:00.000Z');
    expect(isPayable(order(), before)).toBe(true);
    expect(assertPayable(order(), before).status).toBe('pending');
    expect(isPayable(order(), after)).toBe(false);
    expect(() => assertPayable(order(), after)).toThrow(expect.objectContaining({ code: 'order-closed' }));
    const paid = { ...order(), status: 'paid' as const };
    expect(isPayable(paid, before)).toBe(false);
    expect(() => assertPayable(paid, before)).toThrow(expect.objectContaining({ code: 'order-not-pending' }));
    expect(() => assertPayable({ ...order(), status: 'refunded' }, before)).toThrow(expect.objectContaining({ code: 'order-not-pending' }));
  });
});

describe('按商品发卡', () => {
  const issue = (p: Product, cards: Card[] = []) => cardFromProduct({ id: 'k1', product: snapshotOf(p), memberId: 'jie', cards, today });
  const period = (id: string, startsOn: string, expiresOn: string, extra: Partial<PeriodCard> = {}): PeriodCard =>
    ({ id, kind: 'period', memberId: 'jie', productId: 'month', name: '月卡', startsOn, expiresOn, ...extra });

  it('期限卡今天起算，30 天含今天', () => {
    expect(issue(month)).toEqual({ id: 'k1', kind: 'period', memberId: 'jie', productId: 'month', name: '月卡', startsOn: today, expiresOn: '2026-11-19' });
  });

  it('手上有没到期的期限卡，接在最晚那张到期日的次日开始（含还没开始的续费卡）', () => {
    const cards = [period('a', '2026-10-01', '2026-10-30'), period('b', '2026-10-31', '2026-11-29')];
    expect(issue(month, cards)).toMatchObject({ startsOn: '2026-11-30', expiresOn: '2026-12-29' });
  });

  it('冻结中的期限卡也算，新卡接在它冻满以后', () => {
    const frozen = period('a', '2026-10-01', '2026-10-30', { status: 'frozen', frozenFrom: '2026-10-15', frozenUntil: '2026-10-24' });
    expect(issue(month, [frozen])).toMatchObject({ startsOn: '2026-11-10', expiresOn: '2026-12-09' });
  });

  it('已过期、作废退款、别人的期限卡不影响开始日', () => {
    const cards: Card[] = [
      period('a', '2026-09-01', '2026-10-19'),
      period('b', '2026-10-01', '2026-12-31', { status: 'void' }),
      period('c', '2026-10-01', '2026-12-31', { status: 'refunded' }),
      period('d', '2026-10-01', '2026-12-31', { memberId: 'lu' }),
    ];
    expect(issue(month, cards)).toMatchObject({ startsOn: today, expiresOn: '2026-11-19' });
  });

  it('今天到期的期限卡也接在后面', () => {
    expect(issue(month, [period('a', '2026-09-22', today)])).toMatchObject({ startsOn: '2026-10-22', expiresOn: '2026-11-20' });
  });

  it('次卡和课包按月算有效期，次数是满的', () => {
    expect(issue(c10)).toMatchObject({ kind: 'count', total: 10, remaining: 10, expiresOn: '2027-04-20' });
    expect(issue(pt5)).toMatchObject({ kind: 'pt', total: 5, remaining: 5, expiresOn: '2027-04-20' });
  });

  it('单次票当天有效', () => {
    expect(issue(single)).toMatchObject({ kind: 'count', total: 1, remaining: 1, expiresOn: today });
  });
});
