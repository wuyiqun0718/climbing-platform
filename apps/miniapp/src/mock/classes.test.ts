import { ApiError, createApi } from '@climb/api';
import { defaultRules, type Card, type ClassSession, type GymRules } from '@climb/core';
import { addDays } from '@climb/utils';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from './index';

const TODAY = '2026-10-21';
const PACK = 'card-ajie-class10';

function setup(rules: GymRules = defaultRules) {
  let now = new Date(`${TODAY}T10:00:00`);
  const mock = createMock({ rules, today: () => TODAY, now: () => now });
  const as = (memberId: string | null) =>
    createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => (memberId ? mockToken(memberId) : null) });
  /** 给某个会员一张团课课包 */
  const givePack = (memberId: string, extra: Partial<Card> = {}) => {
    const card = { id: `pack-${memberId}`, kind: 'class', memberId, productId: 'class10', name: '团课 10 次', total: 10, remaining: 10, expiresOn: addDays(TODAY, 100), ...extra } as Card;
    mock.db.cards.push(card);
    return card.id;
  };
  /** 明天的一节正常的课，人数上限改成 capacity */
  const tomorrowClass = (capacity: number): ClassSession => {
    const s = mock.db.classSessions.find(c => c.on === addDays(TODAY, 1) && c.status === 'scheduled')!;
    s.capacity = capacity;
    return s;
  };
  const key = () => `key-${Math.random()}`;
  return {
    mock, db: mock.db, givePack, tomorrowClass, key, ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), laozhou: as(MOCK_MEMBERS.laozhou), guest: as(null),
    setNow: (d: Date) => { now = d; },
  };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: ((e as ApiError).data as { code: string }).code };
};
const remainingOf = (db: { cards: Card[] }, id: string) => (db.cards.find(c => c.id === id) as { remaining: number }).remaining;

describe('mock 团课课表', () => {
  it('默认从今天起 7 天，按开课时间排；能按门店、日期过滤；取消的课带原因', async () => {
    const { guest, db } = setup();
    const all = await guest.classes.list();
    expect(all.length).toBe(db.classSessions.length);
    const times = all.map(s => `${s.on} ${s.startTime}`);
    expect(times).toEqual([...times].sort());
    expect(all.every(s => s.on >= TODAY && s.on < addDays(TODAY, 7) && s.myBooking === null)).toBe(true);
    expect(all[0]).toMatchObject({ storeName: expect.any(String), coachName: expect.any(String), booked: 0, waitlisted: 0, left: all[0].capacity });

    const binggang = await guest.classes.list({ store: 'binggang' });
    expect(binggang.length).toBeGreaterThan(0);
    expect(binggang.every(s => s.storeId === 'binggang')).toBe(true);
    const tomorrow = await guest.classes.list({ from: addDays(TODAY, 1), days: 1 });
    expect(tomorrow.length).toBeGreaterThan(0);
    expect(tomorrow.every(s => s.on === addDays(TODAY, 1))).toBe(true);

    const cancelled = all.filter(s => s.status === 'cancelled');
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0].cancelReason).toBeTruthy();
  });
});

describe('mock 约课', () => {
  it('约上扣团课次数、记 class_book 流水；课表和我的预约跟着变', async () => {
    const { ajie, db, tomorrowClass, key } = setup();
    const s = tomorrowClass(8);
    const b = await ajie.classes.book(s.id, { idempotencyKey: key() });
    expect(b).toMatchObject({ status: 'booked', cardId: PACK, deducted: 1, cardName: '团课 10 次', position: null, cancelBlockedBy: null, session: { id: s.id, name: s.name } });
    expect(remainingOf(db, PACK)).toBe(9);
    expect((await ajie.me.cardLedger(PACK))[0]).toMatchObject({ reason: 'class_book', delta: -1, remainingAfter: 9, refType: 'class_booking', refId: b.id });
    const listed = (await ajie.classes.list()).find(x => x.id === s.id)!;
    expect(listed).toMatchObject({ booked: 1, left: 7, myBooking: { id: b.id, status: 'booked', position: null } });
    expect((await ajie.classes.mine()).map(x => x.id)).toEqual([b.id]);
  });

  it('同一个幂等键重复提交只约一次、只扣一次；换个键再约被拒', async () => {
    const { ajie, db, tomorrowClass, key } = setup();
    const s = tomorrowClass(8);
    const k = key();
    const [a, b] = await Promise.all([ajie.classes.book(s.id, { idempotencyKey: k }), ajie.classes.book(s.id, { idempotencyKey: k })]);
    expect(a.id).toBe(b.id);
    expect(db.classBookings).toHaveLength(1);
    expect(remainingOf(db, PACK)).toBe(9);
    expect(db.ledger.filter(l => l.reason === 'class_book')).toHaveLength(1);
    expect(await codeOf(ajie.classes.book(s.id, { idempotencyKey: key() }))).toEqual({ status: 409, code: 'class-already-booked' });
    expect(await codeOf(ajie.classes.book(s.id, {} as never))).toEqual({ status: 400, code: 'bad-request' });
  });

  it('没有团课课包、课包冻结、取消的课、没登录都约不了', async () => {
    const { ajie, xiaolu, guest, db, givePack, tomorrowClass, key } = setup();
    const s = tomorrowClass(8);
    expect(await codeOf(xiaolu.classes.book(s.id, { idempotencyKey: key() }))).toEqual({ status: 409, code: 'class-no-card' });
    givePack(MOCK_MEMBERS.xiaolu, { status: 'frozen' });
    expect(await codeOf(xiaolu.classes.book(s.id, { idempotencyKey: key() }))).toEqual({ status: 409, code: 'class-no-card' });
    const cancelled = db.classSessions.find(c => c.status === 'cancelled')!;
    expect(await codeOf(ajie.classes.book(cancelled.id, { idempotencyKey: key() }))).toEqual({ status: 409, code: 'class-cancelled' });
    expect(await codeOf(ajie.classes.book('nope', { idempotencyKey: key() }))).toEqual({ status: 404, code: 'class-not-found' });
    expect((await codeOf(guest.classes.book(s.id, { idempotencyKey: key() }))).status).toBe(401);
  });

  it('满员进候补不扣次，我的预约显示排第几', async () => {
    const { ajie, xiaolu, laozhou, db, givePack, tomorrowClass, key } = setup();
    const s = tomorrowClass(1);
    givePack(MOCK_MEMBERS.xiaolu);
    givePack(MOCK_MEMBERS.laozhou);
    await ajie.classes.book(s.id, { idempotencyKey: key() });
    const w1 = await xiaolu.classes.book(s.id, { idempotencyKey: key() });
    const w2 = await laozhou.classes.book(s.id, { idempotencyKey: key() });
    expect([w1.status, w1.position, w1.deducted]).toEqual(['waitlisted', 1, 0]);
    expect([w2.status, w2.position]).toEqual(['waitlisted', 2]);
    expect(remainingOf(db, `pack-${MOCK_MEMBERS.xiaolu}`)).toBe(10);
    expect((await laozhou.classes.mine())[0]).toMatchObject({ status: 'waitlisted', position: 2 });
    expect((await laozhou.classes.list()).find(x => x.id === s.id)).toMatchObject({ booked: 1, waitlisted: 2, left: 0, myBooking: { status: 'waitlisted', position: 2 } });
  });

  it('关了候补，满员直接拒', async () => {
    const { ajie, xiaolu, givePack, tomorrowClass, key } = setup({ ...defaultRules, classRules: { ...defaultRules.classRules, waitlist: false } });
    const s = tomorrowClass(1);
    givePack(MOCK_MEMBERS.xiaolu);
    await ajie.classes.book(s.id, { idempotencyKey: key() });
    expect(await codeOf(xiaolu.classes.book(s.id, { idempotencyKey: key() }))).toEqual({ status: 409, code: 'class-full' });
  });
});

describe('mock 取消约课', () => {
  it('截止前取消退次记 class_cancel；候补第一位自动补上、扣次记 class_book，第二位往前挪', async () => {
    const { ajie, xiaolu, laozhou, db, givePack, tomorrowClass, key } = setup();
    const s = tomorrowClass(1);
    const lu = givePack(MOCK_MEMBERS.xiaolu);
    givePack(MOCK_MEMBERS.laozhou);
    const mine = await ajie.classes.book(s.id, { idempotencyKey: key() });
    const w1 = await xiaolu.classes.book(s.id, { idempotencyKey: key() });
    await laozhou.classes.book(s.id, { idempotencyKey: key() });

    const res = await ajie.classes.cancel(mine.id);
    expect(res).toMatchObject({ status: 'cancelled', cancelBlockedBy: 'booking-not-active' });
    expect(remainingOf(db, PACK)).toBe(10);
    expect((await ajie.me.cardLedger(PACK))[0]).toMatchObject({ reason: 'class_cancel', delta: 1, remainingAfter: 10, refId: mine.id });

    expect((await xiaolu.classes.mine())[0]).toMatchObject({ id: w1.id, status: 'booked', position: null, deducted: 1 });
    expect(remainingOf(db, lu)).toBe(9);
    expect((await xiaolu.me.cardLedger(lu))[0]).toMatchObject({ reason: 'class_book', delta: -1, refId: w1.id });
    expect((await laozhou.classes.mine())[0]).toMatchObject({ status: 'waitlisted', position: 1 });
    expect(await codeOf(ajie.classes.cancel(mine.id))).toEqual({ status: 409, code: 'booking-not-active' });
  });

  it('截止后不能自己取消，次数不退；我的预约里能看到原因和截止时间', async () => {
    const { ajie, db, tomorrowClass, key, setNow } = setup();
    const s = tomorrowClass(8);
    const b = await ajie.classes.book(s.id, { idempotencyKey: key() });
    const start = new Date(`${s.on}T${s.startTime}:00`);
    expect(b.cancelDeadline).toBe(new Date(start.getTime() - 120 * 60_000).toISOString());
    setNow(new Date(start.getTime() - 60 * 60_000));
    expect((await ajie.classes.mine())[0].cancelBlockedBy).toBe('class-cancel-too-late');
    expect(await codeOf(ajie.classes.cancel(b.id))).toEqual({ status: 409, code: 'class-cancel-too-late' });
    expect(remainingOf(db, PACK)).toBe(9);
  });

  it('不能取消别人的预约', async () => {
    const { ajie, xiaolu, tomorrowClass, key } = setup();
    const b = await ajie.classes.book(tomorrowClass(8).id, { idempotencyKey: key() });
    expect(await codeOf(xiaolu.classes.cancel(b.id))).toEqual({ status: 404, code: 'booking-not-found' });
  });

  it('我的预约：还没上的在前（近的在前），取消的在后', async () => {
    const { ajie, db, key } = setup();
    const upcoming = db.classSessions.filter(c => c.status === 'scheduled' && c.on > TODAY).sort((a, b) => `${a.on} ${a.startTime}`.localeCompare(`${b.on} ${b.startTime}`));
    const [d1, d2, third] = upcoming;
    const late = await ajie.classes.book(d2.id, { idempotencyKey: key() });
    const early = await ajie.classes.book(d1.id, { idempotencyKey: key() });
    const gone = await ajie.classes.book(third.id, { idempotencyKey: key() });
    await ajie.classes.cancel(gone.id);
    expect((await ajie.classes.mine()).map(b => b.id)).toEqual([early.id, late.id, gone.id]);
  });
});
