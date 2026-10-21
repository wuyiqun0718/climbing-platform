import { ApiError, createApi } from '@climb/api';
import { defaultRules, type GymRules } from '@climb/core';
import { addDays } from '@climb/utils';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from './index';

const TODAY = '2026-10-21';
const YEAR = 'card-ajie-year';
/** 示例数据里阿杰年卡的到期日 */
const YEAR_EXPIRES = addDays(TODAY, 155);

function setup(rules: GymRules = defaultRules) {
  let today = TODAY;
  const mock = createMock({ rules, today: () => today });
  const entry = (storeId: string, cardId: string) => ({ ...mock.issueEntryQr(storeId), cardId, idempotencyKey: `key-${Math.random()}` });
  const ajie = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(MOCK_MEMBERS.ajie) });
  return { mock, entry, ajie, goTo: (d: string) => { today = d; } };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return ((e as ApiError).data as { code: string }).code;
};

describe('mock 期限卡自助冻结', () => {
  it('冻结后不能入场、不能发老带新，这个月不能再冻；流水记 freeze', async () => {
    const { entry, ajie } = setup();
    expect(await ajie.me.freezeOptions(YEAR)).toEqual({ blockedBy: null, minDays: 1, maxDays: 30, monthLeft: 1, yearLeft: null });
    const card = await ajie.me.freezeCard(YEAR, { days: 10 });
    expect(card).toMatchObject({ status: 'frozen', frozenFrom: TODAY, frozenUntil: '2026-10-30', expiresOn: YEAR_EXPIRES });
    expect(await codeOf(ajie.checkIns.create(entry('binggang', YEAR)))).toBe('card-not-usable');
    expect(await codeOf(ajie.shares.createReferral())).toBe('referral-card-frozen');
    expect((await ajie.me.cardLedger(YEAR))[0]).toMatchObject({ reason: 'freeze', delta: 0 });
    expect(await ajie.me.freezeOptions(YEAR)).toMatchObject({ blockedBy: 'freeze-card-not-active' });
  });

  it('提前解冻按实际天数顺延；同一个月再冻被拒，下个月可以', async () => {
    const { ajie, goTo } = setup();
    await ajie.me.freezeCard(YEAR, { days: 10 });
    goTo('2026-10-25');
    expect(await ajie.me.unfreezeCard(YEAR)).toMatchObject({ status: 'normal', expiresOn: addDays(YEAR_EXPIRES, 4) });
    expect((await ajie.me.cardLedger(YEAR))[0]).toMatchObject({ reason: 'unfreeze', expiresOnAfter: addDays(YEAR_EXPIRES, 4) });
    expect(await codeOf(ajie.me.freezeCard(YEAR, { days: 5 }))).toBe('freeze-month-quota-used');
    goTo('2026-11-02');
    expect(await ajie.me.freezeCard(YEAR, { days: 5 })).toMatchObject({ status: 'frozen' });
  });

  it('天数超限被拒，没冻结的不能解冻', async () => {
    const { ajie } = setup();
    expect(await codeOf(ajie.me.freezeCard(YEAR, { days: 31 }))).toBe('freeze-days-out-of-range');
    expect(await codeOf(ajie.me.freezeCard('card-ajie-c10', { days: 5 }))).toBe('freeze-card-not-active');
    expect(await codeOf(ajie.me.unfreezeCard(YEAR))).toBe('card-not-frozen');
  });

  it('冻满后次日自动解冻，顺延计划的天数', async () => {
    const { ajie, goTo } = setup();
    await ajie.me.freezeCard(YEAR, { days: 10 });
    goTo('2026-11-05');
    const year = (await ajie.me.cards()).find(c => c.id === YEAR);
    expect(year).toMatchObject({ status: 'normal', expiresOn: addDays(YEAR_EXPIRES, 10) });
    expect((await ajie.me.cardLedger(YEAR))[0]).toMatchObject({ reason: 'unfreeze', on: '2026-10-31' });
  });

  it('冻结中买的期限卡接在冻满以后，提前解冻后跟着往前挪', async () => {
    const { mock, ajie, goTo } = setup();
    await ajie.me.freezeCard(YEAR, { days: 10 });
    const { order } = await ajie.orders.create({ productId: 'month' });
    await mock.simulatePayment(order.id);
    const month = (await ajie.me.cards()).find(c => c.id === (mock.db.orders.find(o => o.id === order.id)!.cardId));
    expect(month).toMatchObject({ startsOn: addDays(YEAR_EXPIRES, 11), expiresOn: addDays(YEAR_EXPIRES, 40) });
    goTo('2026-10-24');
    await ajie.me.unfreezeCard(YEAR);
    const cards = await ajie.me.cards();
    expect(cards.find(c => c.id === YEAR)).toMatchObject({ expiresOn: addDays(YEAR_EXPIRES, 3) });
    expect(cards.find(c => c.id === month!.id)).toMatchObject({ startsOn: addDays(YEAR_EXPIRES, 4), expiresOn: addDays(YEAR_EXPIRES, 33) });
    expect((await ajie.me.cardLedger(month!.id))[0]).toMatchObject({ reason: 'adjust', delta: 0 });
  });

  it('关了自助冻结只能前台办', async () => {
    const { ajie } = setup({ ...defaultRules, freezeRules: { ...defaultRules.freezeRules, memberSelfService: false } });
    expect(await codeOf(ajie.me.freezeCard(YEAR, { days: 5 }))).toBe('freeze-not-self-service');
  });
});
