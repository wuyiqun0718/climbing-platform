import { ApiError, createApi } from '@climb/api';
import { defaultRules, type Card, type GymRules } from '@climb/core';
import { addDays } from '@climb/utils';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from './index';

const TODAY = '2026-10-21';
const TOMORROW = addDays(TODAY, 1);
const PACK = 'card-ajie-pt5';

function setup(rules: GymRules = defaultRules) {
  let now = new Date(`${TODAY}T10:30:00`);
  const mock = createMock({ rules, today: () => TODAY, now: () => now });
  const as = (memberId: string | null) =>
    createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => (memberId ? mockToken(memberId) : null) });
  const givePack = (memberId: string) => {
    mock.db.cards.push({ id: `pt-${memberId}`, kind: 'pt', memberId, productId: 'pt5', name: '私教 5 节', total: 5, remaining: 5, expiresOn: addDays(TODAY, 100) } as Card);
    return `pt-${memberId}`;
  };
  const key = () => `key-${Math.random()}`;
  const slot = (hour: number, extra: Record<string, unknown> = {}) => ({ coachId: 'coach-max', storeId: 'binggang', on: TOMORROW, hour, idempotencyKey: key(), ...extra });
  return {
    mock, db: mock.db, givePack, slot, key, ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), laozhou: as(MOCK_MEMBERS.laozhou), guest: as(null),
    setNow: (d: Date) => { now = d; },
  };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: ((e as ApiError).data as { code: string }).code };
};
const remainingOf = (db: { cards: Card[] }, id: string) => (db.cards.find(c => c.id === id) as { remaining: number }).remaining;

describe('mock 私教：教练和时段', () => {
  it('教练列表按门店筛，只列在这家店接私教的', async () => {
    const { guest } = setup();
    expect((await guest.pt.coaches()).map(c => c.id)).toEqual(['coach-max', 'coach-kiki', 'coach-may']);
    expect((await guest.pt.coaches({ store: 'binggang' })).map(c => c.id)).toEqual(['coach-max', 'coach-may']);
    expect((await guest.pt.coaches({ store: 'huanqiugang' })).map(c => c.id)).toEqual(['coach-kiki']);
  });

  it('7 天时段，每天按 ptRules 每小时一格；已过、线下约、不接课都是约不了，不带原因', async () => {
    const { guest } = setup();
    const res = await guest.pt.slots('coach-max');
    expect(res.days.map(d => d.on)).toEqual(Array.from({ length: 7 }, (_, i) => addDays(TODAY, i)));
    expect(res.days[0].slots.map(s => s.hour)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]);
    // 今天 10:30，10 点那格已经过了
    expect(res.days[0].slots[0]).toEqual({ hour: 10, available: false, mine: null });
    const tomorrow = res.days[1].slots;
    expect(tomorrow.filter(s => !s.available).map(s => s.hour)).toEqual([15, 19]);
    // 只有 hour / available / mine，不带格子是谁占的、备注
    expect(Object.keys(tomorrow.find(s => s.hour === 15)!).sort()).toEqual(['available', 'hour', 'mine']);
    expect(JSON.stringify(res)).not.toContain('小王');
    expect(res.cardBlockedBy).toBeNull();
    expect(await codeOf(guest.pt.slots('nope'))).toEqual({ status: 404, code: 'coach-not-found' });
  });

  it('别人约的格子我看到的是约不了、不知道是谁；我约的标 mine；没课包的标 cardBlockedBy', async () => {
    const { ajie, xiaolu, slot } = setup();
    const b = await ajie.pt.book(slot(14));
    const mine = (await ajie.pt.slots('coach-max')).days[1].slots.find(s => s.hour === 14)!;
    expect(mine).toEqual({ hour: 14, available: false, mine: { bookingId: b.id, status: 'booked' } });
    const theirs = await xiaolu.pt.slots('coach-max');
    expect(theirs.days[1].slots.find(s => s.hour === 14)).toEqual({ hour: 14, available: false, mine: null });
    expect(JSON.stringify(theirs)).not.toContain(MOCK_MEMBERS.ajie);
    expect(theirs.cardBlockedBy).toBe('pt-no-card');
    // 没课包时空格子照样显示能约，点了再引导去买
    expect(theirs.days[1].slots.find(s => s.hour === 16)!.available).toBe(true);
  });
});

describe('mock 约私教', () => {
  it('约上扣 1 节、记 pt_book 流水关联预约；我的预约能看到', async () => {
    const { ajie, db, slot } = setup();
    const b = await ajie.pt.book(slot(14));
    expect(b).toMatchObject({ status: 'booked', coachName: 'Max', storeName: '滨港店', cardName: '私教 5 节', cardId: PACK, deducted: 1, cancelBlockedBy: null });
    expect(remainingOf(db, PACK)).toBe(4);
    expect((await ajie.me.cardLedger(PACK))[0]).toMatchObject({ reason: 'pt_book', delta: -1, remainingAfter: 4, refType: 'pt_booking', refId: b.id });
    expect((await ajie.pt.mine()).map(x => x.id)).toEqual([b.id]);
    expect(db.ptBookings[0]).toMatchObject({ coachId: 'coach-max', on: TOMORROW, hour: 14 });
  });

  it('两个人同时抢同一格只有一个成功，另一个 409 pt-slot-taken，只扣一份课时', async () => {
    const { ajie, xiaolu, db, givePack, slot } = setup();
    const lu = givePack(MOCK_MEMBERS.xiaolu);
    const results = await Promise.allSettled([ajie.pt.book(slot(14)), xiaolu.pt.book(slot(14))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect((failed.reason as ApiError).data).toMatchObject({ code: 'pt-slot-taken' });
    expect(db.ptBookings).toHaveLength(1);
    expect(remainingOf(db, PACK) + remainingOf(db, lu)).toBe(9);
    expect(db.ledger.filter(l => l.reason === 'pt_book')).toHaveLength(1);
  });

  it('同一个幂等键重复提交只约一次', async () => {
    const { ajie, db, slot } = setup();
    const body = slot(14);
    const [a, b] = await Promise.all([ajie.pt.book(body), ajie.pt.book(body)]);
    expect(a.id).toBe(b.id);
    expect(db.ptBookings).toHaveLength(1);
    expect(remainingOf(db, PACK)).toBe(4);
    expect(await codeOf(ajie.pt.book(slot(14, { idempotencyKey: undefined })))).toEqual({ status: 400, code: 'bad-request' });
  });

  it('线下约的、不接课的、营业时间外、教练不在这家店、没课包都约不了', async () => {
    const { ajie, xiaolu, slot } = setup();
    expect(await codeOf(ajie.pt.book(slot(15)))).toEqual({ status: 409, code: 'pt-slot-taken' });
    expect(await codeOf(ajie.pt.book(slot(19)))).toEqual({ status: 409, code: 'pt-coach-off' });
    expect(await codeOf(ajie.pt.book(slot(9)))).toEqual({ status: 409, code: 'pt-outside-hours' });
    expect(await codeOf(ajie.pt.book(slot(14, { storeId: 'huanqiugang' })))).toEqual({ status: 400, code: 'coach-not-at-store' });
    expect(await codeOf(xiaolu.pt.book(slot(14)))).toEqual({ status: 409, code: 'pt-no-card' });
  });
});

describe('mock 取消私教', () => {
  it('截止前取消退课时、记 pt_cancel；格子空出来别人能约', async () => {
    const { ajie, xiaolu, db, givePack, slot } = setup();
    givePack(MOCK_MEMBERS.xiaolu);
    const b = await ajie.pt.book(slot(14));
    const res = await ajie.pt.cancel(b.id);
    expect(res).toMatchObject({ status: 'cancelled', cancelBlockedBy: 'booking-not-active' });
    expect(remainingOf(db, PACK)).toBe(5);
    expect((await ajie.me.cardLedger(PACK))[0]).toMatchObject({ reason: 'pt_cancel', delta: 1, refType: 'pt_booking', refId: b.id });
    expect((await xiaolu.pt.book(slot(14))).status).toBe('booked');
    expect(await codeOf(ajie.pt.cancel(b.id))).toEqual({ status: 409, code: 'booking-not-active' });
  });

  it('截止（上课前 12 小时）后会员不能自己取消，课时不退；我的预约里能看到截止时间和原因', async () => {
    const { ajie, db, slot, setNow } = setup();
    const b = await ajie.pt.book(slot(14));
    const start = new Date(`${TOMORROW}T14:00:00`);
    expect(b.cancelDeadline).toBe(new Date(start.getTime() - 12 * 3600_000).toISOString());
    setNow(new Date(start.getTime() - 12 * 3600_000 + 60_000));
    expect((await ajie.pt.mine())[0].cancelBlockedBy).toBe('pt-cancel-too-late');
    expect(await codeOf(ajie.pt.cancel(b.id))).toEqual({ status: 409, code: 'pt-cancel-too-late' });
    expect(remainingOf(db, PACK)).toBe(4);
  });

  it('要教练确认时约上是 pending，照样占格子', async () => {
    const { ajie, xiaolu, givePack, slot } = setup({ ...defaultRules, ptRules: { ...defaultRules.ptRules, needCoachConfirm: true } });
    givePack(MOCK_MEMBERS.xiaolu);
    expect((await ajie.pt.book(slot(14))).status).toBe('pending');
    expect(await codeOf(xiaolu.pt.book(slot(14)))).toEqual({ status: 409, code: 'pt-slot-taken' });
  });

  it('不能取消别人的预约', async () => {
    const { ajie, xiaolu, slot } = setup();
    const b = await ajie.pt.book(slot(14));
    expect(await codeOf(xiaolu.pt.cancel(b.id))).toEqual({ status: 404, code: 'booking-not-found' });
  });
});
