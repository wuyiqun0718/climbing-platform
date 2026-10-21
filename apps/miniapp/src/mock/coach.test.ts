import { ApiError, createApi } from '@climb/api';
import { defaultRules, type Card, type GymRules } from '@climb/core';
import { addDays } from '@climb/utils';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from './index';

const TODAY = '2026-10-21';
const TOMORROW = addDays(TODAY, 1);
const PACK = 'card-ajie-pt5';

function setup(rules: GymRules = defaultRules) {
  const now = new Date(`${TODAY}T10:30:00`);
  const mock = createMock({ rules, today: () => TODAY, now: () => now });
  const as = (memberId: string | null) =>
    createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => (memberId ? mockToken(memberId) : null) });
  const key = () => `key-${Math.random()}`;
  const slot = (hour: number, coachId = 'coach-max') => ({ coachId, storeId: 'binggang', on: TOMORROW, hour, idempotencyKey: key() });
  return { mock, db: mock.db, slot, max: as(MOCK_MEMBERS.max), ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), guest: as(null) };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: ((e as ApiError).data as { code: string }).code };
};
const remainingOf = (db: { cards: Card[] }, id: string) => (db.cards.find(c => c.id === id) as { remaining: number }).remaining;
const memberSlot = async (api: ReturnType<typeof setup>['ajie'], hour: number) =>
  (await api.pt.slots('coach-max')).days.find(d => d.on === TOMORROW)!.slots.find(s => s.hour === hour)!;

describe('mock 教练端：身份', () => {
  it('手机号跟在用的教练账号一样的才是教练；会员、没登录访问教练接口被拒', async () => {
    const { max, ajie, guest, db } = setup();
    expect((await max.me.get()).coach).toEqual({ id: 'coach-max', name: 'Max' });
    expect((await ajie.me.get()).coach).toBeNull();
    expect(await codeOf(ajie.coach.schedule())).toEqual({ status: 403, code: 'not-coach' });
    expect(await codeOf(ajie.coach.mark({ on: TOMORROW, hour: 14, kind: 'off' }))).toEqual({ status: 403, code: 'not-coach' });
    expect((await codeOf(guest.coach.schedule())).status).toBe(401);
    // 员工停用后就不是教练了
    db.coaches.find(c => c.id === 'coach-max')!.active = false;
    expect(await codeOf(max.coach.schedule())).toEqual({ status: 403, code: 'not-coach' });
    expect((await max.me.get()).coach).toBeNull();
  });
});

describe('mock 教练端：排班', () => {
  it('看自己 7 天的格子，四种状态和会员名字、自己的备注都在', async () => {
    const { max, ajie, slot } = setup();
    await ajie.pt.book(slot(14));
    const res = await max.coach.schedule();
    expect(res.coach.id).toBe('coach-max');
    expect(res.days).toHaveLength(7);
    const day = res.days.find(d => d.on === TOMORROW)!.slots;
    expect(day.find(s => s.hour === 14)).toMatchObject({ status: 'member', booking: { memberName: '阿杰', status: 'booked', storeName: '滨港店' } });
    expect(day.find(s => s.hour === 15)).toMatchObject({ status: 'offline', mark: { kind: 'offline', note: '小王' } });
    expect(day.find(s => s.hour === 19)).toMatchObject({ status: 'off' });
    expect(day.find(s => s.hour === 16)).toMatchObject({ status: 'free', booking: null, mark: null });
  });

  it('教练占的格会员那边马上约不了；取消占用后又能约', async () => {
    const { max, ajie, slot } = setup();
    expect((await memberSlot(ajie, 16)).available).toBe(true);
    const mark = await max.coach.mark({ on: TOMORROW, hour: 16, kind: 'offline', note: '老学员' });
    expect(mark).toMatchObject({ coachId: 'coach-max', on: TOMORROW, hour: 16, kind: 'offline', note: '老学员' });
    expect((await memberSlot(ajie, 16)).available).toBe(false);
    expect(await codeOf(ajie.pt.book(slot(16)))).toEqual({ status: 409, code: 'pt-slot-taken' });
    await max.coach.unmark(mark.id);
    expect((await memberSlot(ajie, 16)).available).toBe(true);
  });

  it('会员约了的格子教练不能占；过了的、营业时间外的也不行', async () => {
    const { max, ajie, slot } = setup();
    await ajie.pt.book(slot(14));
    expect(await codeOf(max.coach.mark({ on: TOMORROW, hour: 14, kind: 'off' }))).toEqual({ status: 409, code: 'pt-slot-taken' });
    expect(await codeOf(max.coach.mark({ on: TODAY, hour: 10, kind: 'off' }))).toEqual({ status: 409, code: 'pt-slot-past' });
    expect(await codeOf(max.coach.mark({ on: TOMORROW, hour: 8, kind: 'off' }))).toEqual({ status: 409, code: 'pt-outside-hours' });
  });

  it('只能取消自己的占用、处理自己的预约', async () => {
    const { max, ajie, db, slot } = setup();
    const mayMark = db.ptSlotMarks.find(m => m.coachId === 'coach-may')!;
    expect(await codeOf(max.coach.unmark(mayMark.id))).toEqual({ status: 404, code: 'mark-not-found' });
    const b = await ajie.pt.book(slot(10, 'coach-may'));
    expect(await codeOf(max.coach.cancel(b.id, { reason: '换人' }))).toEqual({ status: 404, code: 'booking-not-found' });
    expect(await codeOf(max.coach.confirm(b.id))).toEqual({ status: 404, code: 'booking-not-found' });
    // 请求里传别的教练也没用，占的是自己的格子
    const mark = await max.coach.mark({ on: TOMORROW, hour: 12, kind: 'off', coachId: 'coach-may' } as never);
    expect(mark.coachId).toBe('coach-max');
  });
});

describe('mock 教练端：处理预约', () => {
  it('要教练确认时：会员约了是 pending，教练确认后 booked；不用确认的确认会被拒', async () => {
    const { max, ajie, slot } = setup({ ...defaultRules, ptRules: { ...defaultRules.ptRules, needCoachConfirm: true } });
    const b = await ajie.pt.book(slot(14));
    expect(b.status).toBe('pending');
    const sched = await max.coach.schedule();
    expect(sched).toMatchObject({ needConfirm: true, pendingCount: 1 });
    expect(await max.coach.confirm(b.id)).toMatchObject({ id: b.id, status: 'booked' });
    expect((await ajie.pt.mine())[0].status).toBe('booked');
    expect(await codeOf(max.coach.confirm(b.id))).toEqual({ status: 409, code: 'pt-booking-not-pending' });
  });

  it('教练取消会员的预约：必须写原因，退课时记 pt_void 关联预约；会员看到原因，格子空出来', async () => {
    const { max, ajie, db, slot } = setup();
    const b = await ajie.pt.book(slot(14));
    expect(remainingOf(db, PACK)).toBe(4);
    expect(await codeOf(max.coach.cancel(b.id, { reason: ' ' }))).toEqual({ status: 409, code: 'pt-reason-required' });
    await max.coach.cancel(b.id, { reason: '临时去带队比赛' });
    expect(remainingOf(db, PACK)).toBe(5);
    expect((await ajie.me.cardLedger(PACK))[0]).toMatchObject({ reason: 'pt_void', delta: 1, refType: 'pt_booking', refId: b.id });
    expect((await ajie.pt.mine())[0]).toMatchObject({ status: 'voided', closeReason: '临时去带队比赛' });
    expect((await memberSlot(ajie, 14)).available).toBe(true);
    expect(await codeOf(max.coach.cancel(b.id, { reason: '再取消' }))).toEqual({ status: 409, code: 'booking-not-active' });
  });
});
