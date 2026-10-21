import { describe, expect, it } from 'vitest';
import { defaultRules } from './gym';
import { cardFromProduct, closeIfExpired, createOrder, payOrder, snapshotOf } from './orders';
import type { Product } from './types';

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
});

describe('按商品发卡', () => {
  const issue = (p: Product) => cardFromProduct({ id: 'k1', product: snapshotOf(p), memberId: 'jie', today });

  it('期限卡今天起算，30 天含今天', () => {
    expect(issue(month)).toEqual({ id: 'k1', kind: 'period', memberId: 'jie', productId: 'month', name: '月卡', startsOn: today, expiresOn: '2026-11-19' });
  });

  it('次卡和课包按月算有效期，次数是满的', () => {
    expect(issue(c10)).toMatchObject({ kind: 'count', total: 10, remaining: 10, expiresOn: '2027-04-20' });
    expect(issue(pt5)).toMatchObject({ kind: 'pt', total: 5, remaining: 5, expiresOn: '2027-04-20' });
  });

  it('单次票当天有效', () => {
    expect(issue(single)).toMatchObject({ kind: 'count', total: 1, remaining: 1, expiresOn: today });
  });
});
