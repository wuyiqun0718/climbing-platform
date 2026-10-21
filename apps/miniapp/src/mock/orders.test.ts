import { ApiError, createApi } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from './index';

const TODAY = '2026-10-21';

function setup() {
  let now = new Date('2026-10-21T10:00:00+08:00');
  const mock = createMock({ rules: defaultRules, today: () => TODAY, now: () => now });
  const as = (memberId: string | null) =>
    createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => (memberId ? mockToken(memberId) : null) });
  return { mock, ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), guest: as(null), wait: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: ((e as ApiError).data as { code: string }).code };
};

describe('mock 订单', () => {
  it('没回调前订单是待支付、卡包里没有新卡；回调后发卡，重复回调只发一次', async () => {
    const { mock, xiaolu } = setup();
    const { order, payment } = await xiaolu.orders.create({ productId: 'c10' });
    expect(order).toMatchObject({ status: 'pending', amountCents: 89900, channel: 'wechat', memberId: MOCK_MEMBERS.xiaolu });
    expect(payment.package).toMatch(/^prepay_id=/);
    expect(await xiaolu.orders.get(order.id)).toMatchObject({ status: 'pending' });
    expect(await xiaolu.me.cards()).toEqual([]);

    await mock.simulatePayment(order.id);
    await mock.simulatePayment(order.id);
    const paid = await xiaolu.orders.get(order.id);
    expect(paid).toMatchObject({ status: 'paid', wxTransactionId: `mock-wx-${order.id}` });
    const cards = await xiaolu.me.cards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: paid.cardId, kind: 'count', productId: 'c10', total: 10, remaining: 10, expiresOn: '2027-04-20' });

    const ledger = await xiaolu.me.cardLedger(cards[0].id);
    expect(ledger).toEqual([expect.objectContaining({ reason: 'purchase', delta: 10, remainingAfter: 10, refType: 'order', refId: order.id })]);
  });

  it('期限卡付款后从今天起算', async () => {
    const { mock, xiaolu } = setup();
    const { order } = await xiaolu.orders.create({ productId: 'month' });
    await mock.simulatePayment(order.id);
    expect(await xiaolu.me.cards()).toEqual([expect.objectContaining({ kind: 'period', startsOn: TODAY, expiresOn: '2026-11-19' })]);
  });

  it('超过付款时限没付就关闭，之后的回调不认、不发卡', async () => {
    const { mock, xiaolu, wait } = setup();
    const { order } = await xiaolu.orders.create({ productId: 'single' });
    wait(15);
    expect(await xiaolu.orders.get(order.id)).toMatchObject({ status: 'closed' });
    await expect(mock.simulatePayment(order.id)).rejects.toThrow(/order-closed/);
    expect(await xiaolu.me.cards()).toEqual([]);
  });

  it('订单记录只看到自己的，最新的在前；看不了别人的订单', async () => {
    const { ajie, xiaolu } = setup();
    const a = (await xiaolu.orders.create({ productId: 'single' })).order;
    const b = (await xiaolu.orders.create({ productId: 'c10' })).order;
    await ajie.orders.create({ productId: 'year' });
    expect((await xiaolu.me.orders()).map(o => o.id)).toEqual([b.id, a.id]);
    expect(await codeOf(ajie.orders.get(a.id))).toEqual({ status: 404, code: 'order-not-found' });
  });

  it('要登录；没有的商品、下架的商品不能下单', async () => {
    const { mock, guest, xiaolu } = setup();
    expect(await codeOf(guest.orders.create({ productId: 'c10' }))).toEqual({ status: 401, code: 'unauthorized' });
    expect(await codeOf(guest.me.orders())).toEqual({ status: 401, code: 'unauthorized' });
    expect(await codeOf(xiaolu.orders.create({ productId: 'nope' }))).toEqual({ status: 404, code: 'product-not-found' });
    mock.db.products.find(p => p.id === 'c20')!.onSale = false;
    expect(await codeOf(xiaolu.orders.create({ productId: 'c20' }))).toEqual({ status: 409, code: 'product-off-sale' });
  });
});
