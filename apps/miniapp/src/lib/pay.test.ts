import { createApi } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from '../mock';
import { createPay, isPayCancel, type PromptResult } from './pay';

function setup(opts: { prompt?: PromptResult; callback?: boolean } = {}) {
  let now = new Date('2026-10-21T10:00:00+08:00');
  const mock = createMock({ rules: defaultRules, today: () => '2026-10-21', now: () => now });
  const api = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(MOCK_MEMBERS.xiaolu) });
  let prompts = 0;
  let sleeps = 0;
  const pay = createPay({
    orders: api.orders,
    now: () => now,
    sleep: async () => {
      sleeps++;
    },
    requestPayment: async (_payment, order) => {
      prompts++;
      if (opts.prompt === 'cancel') return 'cancel';
      if (opts.callback !== false) await mock.simulatePayment(order.id);
      return 'ok';
    },
  });
  return { api, pay, prompts: () => prompts, sleeps: () => sleeps, wait: (min: number) => (now = new Date(now.getTime() + min * 60_000)) };
}

describe('下单和支付', () => {
  it('付完查到已支付，卡包里有新卡', async () => {
    const { api, pay } = setup();
    const outcome = await pay.pay(await pay.order('c10', null));
    expect(outcome.status).toBe('paid');
    expect(await api.me.cards()).toEqual([expect.objectContaining({ id: outcome.order.cardId, productId: 'c10' })]);
  });

  it('取消支付：订单还是待支付、没有卡；再点支付沿用这个订单', async () => {
    const { api, pay } = setup({ prompt: 'cancel' });
    const first = await pay.order('c10', null);
    expect(await pay.pay(first)).toMatchObject({ status: 'cancelled', order: { status: 'pending' } });
    expect(await api.me.cards()).toEqual([]);
    expect((await pay.order('c10', first)).order.id).toBe(first.order.id);
  });

  it('订单记录里接着付：同一个订单付完发卡', async () => {
    const { api, pay } = setup();
    const { order } = await api.orders.create({ productId: 'c10' });
    const outcome = await pay.pay(await pay.resume(order.id));
    expect(outcome).toMatchObject({ status: 'paid', order: { id: order.id } });
    expect(await api.me.cards()).toEqual([expect.objectContaining({ id: outcome.order.cardId })]);
  });

  it('换了商品或者上一个订单超时了，重新下单', async () => {
    const { pay, wait } = setup({ prompt: 'cancel' });
    const first = await pay.order('c10', null);
    expect((await pay.order('month', first)).order.id).not.toBe(first.order.id);
    wait(defaultRules.orderPayMinutes);
    expect((await pay.order('c10', first)).order.id).not.toBe(first.order.id);
  });

  it('付了但回调一直没到：查满次数后返回 waiting，不当成成功', async () => {
    const { pay, sleeps } = setup({ callback: false });
    const outcome = await pay.pay(await pay.order('c10', null));
    expect(outcome).toMatchObject({ status: 'waiting', order: { status: 'pending' } });
    expect(sleeps()).toBe(7);
  });

  it('取消时订单刚好超时，返回 closed', async () => {
    const { pay, wait } = setup({ prompt: 'cancel' });
    const r = await pay.order('c10', null);
    wait(defaultRules.orderPayMinutes);
    expect(await pay.pay(r)).toMatchObject({ status: 'closed' });
  });

  it('识别用户取消', () => {
    expect(isPayCancel({ errMsg: 'requestPayment:fail cancel' })).toBe(true);
    expect(isPayCancel({ errMsg: 'requestPayment:fail (detail message)' })).toBe(false);
    expect(isPayCancel(null)).toBe(false);
  });
});
