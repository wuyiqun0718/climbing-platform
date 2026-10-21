import { ApiError, createApi } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken, seedDb, type MockStorage } from './index';

const TODAY = '2026-10-21';

/** 两位示例会员共用一份数据，像原型里的两部手机 */
function setup() {
  const mock = createMock({ rules: defaultRules, today: () => TODAY });
  const as = (memberId: string | null) =>
    createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => (memberId ? mockToken(memberId) : null) });
  return { db: mock.db, ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), guest: as(null) };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: ((e as ApiError).data as { code: string }).code };
};

describe('mock 接口', () => {
  it('卡种不用登录，卡包要登录', async () => {
    const { guest, ajie } = setup();
    expect((await guest.products.list()).length).toBeGreaterThan(0);
    expect(await codeOf(guest.me.cards())).toEqual({ status: 401, code: 'unauthorized' });
    expect((await ajie.me.cards()).map(c => c.kind)).toEqual(['period', 'count']);
  });

  it('次卡入场扣 1 次，同一天再次入场不扣', async () => {
    const { ajie } = setup();
    const first = await ajie.checkIns.create({ qrToken: 'store:binggang', cardId: 'card-ajie-c10' });
    const again = await ajie.checkIns.create({ qrToken: 'store:binggang', cardId: 'card-ajie-c10' });
    expect([first.deducted, again.deducted]).toEqual([1, 0]);
    const c10 = (await ajie.me.cards()).find(c => c.id === 'card-ajie-c10');
    expect(c10).toMatchObject({ remaining: 5 });
  });

  it('不是本馆的码被拒', async () => {
    const { ajie } = setup();
    expect(await codeOf(ajie.checkIns.create({ qrToken: 'whatever', cardId: 'card-ajie-year' }))).toEqual({ status: 400, code: 'invalid-qr' });
  });

  it('次卡转赠：送出立即扣次，朋友领到好友送的次卡，自己不能领、不能重复领', async () => {
    const { ajie, xiaolu } = setup();
    const share = await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 2 });
    expect((await ajie.me.cards()).find(c => c.id === 'card-ajie-c10')).toMatchObject({ remaining: 4 });

    expect(await codeOf(ajie.shares.claim(share.id))).toEqual({ status: 409, code: 'own-share' });
    const { card } = await xiaolu.shares.claim(share.id);
    expect(card).toMatchObject({ kind: 'gift', remaining: 2, memberId: MOCK_MEMBERS.xiaolu });
    expect(await codeOf(xiaolu.shares.claim(share.id))).toEqual({ status: 409, code: 'already-claimed' });
    expect(await xiaolu.shares.get(share.id)).toMatchObject({ status: 'claimed', claimedBy: MOCK_MEMBERS.xiaolu });
  });

  it('送的次数超过剩余次数被拒', async () => {
    const { ajie } = setup();
    expect(await codeOf(ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 7 }))).toEqual({ status: 409, code: 'not-enough-remaining' });
  });

  it('老带新：每月 1 次；邀请人当天先入场，体验券才能用', async () => {
    const { ajie, xiaolu } = setup();
    const share = await ajie.shares.createReferral();
    expect(await codeOf(ajie.shares.createReferral())).toEqual({ status: 409, code: 'referral-quota-used' });
    expect(await codeOf(xiaolu.shares.createReferral())).toEqual({ status: 409, code: 'no-period-card' });

    const { card } = await xiaolu.shares.claim(share.id);
    expect(await codeOf(xiaolu.checkIns.create({ qrToken: 'store:huiju', cardId: card.id }))).toEqual({ status: 409, code: 'inviter-not-checked-in' });
    await ajie.checkIns.create({ qrToken: 'store:huiju', cardId: 'card-ajie-year' });
    expect(await xiaolu.checkIns.create({ qrToken: 'store:huiju', cardId: card.id })).toMatchObject({ deducted: 0, memberId: MOCK_MEMBERS.xiaolu });
  });

  it('不能用别人的卡，没有的接口返回 404', async () => {
    const { xiaolu, db } = setup();
    expect(await codeOf(xiaolu.checkIns.create({ qrToken: 'store:binggang', cardId: 'card-ajie-c10' }))).toEqual({ status: 404, code: 'card-not-found' });
    const res = await createMock({ rules: defaultRules, db }).adapter({ method: 'GET', url: '/nope', headers: {} });
    expect(res.status).toBe(404);
  });
});

describe('mock 数据持久化、切换身份、重置', () => {
  const memoryStorage = (): MockStorage & { data: Map<string, unknown> } => {
    const data = new Map<string, unknown>();
    // 跟 uni 存储一样存的是序列化后的副本
    return { data, get: k => (data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : null), set: (k, v) => data.set(k, JSON.parse(JSON.stringify(v))) };
  };
  const open = (storage: MockStorage) => {
    const mock = createMock({ rules: defaultRules, today: () => TODAY, storage });
    const api = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(mock.currentMember() ?? '') });
    return { mock, api };
  };

  it('刷新（重新创建 mock）后数据和身份还在；切到小鹿能领阿杰发的分享', async () => {
    const storage = memoryStorage();
    const first = open(storage);
    expect(first.mock.currentMember()).toBe(MOCK_MEMBERS.ajie);
    const share = await first.api.shares.createCount({ cardId: 'card-ajie-c10', quantity: 2 });
    first.mock.switchMember(MOCK_MEMBERS.xiaolu);

    const second = open(storage);
    expect(second.mock.currentMember()).toBe(MOCK_MEMBERS.xiaolu);
    expect(await second.api.shares.get(share.id)).toMatchObject({ status: 'pending' });
    const { card } = await second.api.shares.claim(share.id);
    expect(card).toMatchObject({ kind: 'gift', memberId: MOCK_MEMBERS.xiaolu, remaining: 2 });

    const third = open(storage);
    expect((await third.api.me.cards()).map(c => c.id)).toEqual([card.id]);
    third.mock.switchMember(MOCK_MEMBERS.ajie);
    expect((await third.api.me.cards()).find(c => c.id === 'card-ajie-c10')).toMatchObject({ remaining: 4 });
  });

  it('规则错误的请求不会把数据弄乱，新 id 不和存着的重复', async () => {
    const storage = memoryStorage();
    const a = open(storage);
    const s1 = await a.api.shares.createReferral();
    await a.api.shares.createReferral().catch(() => null);
    const b = open(storage);
    const s2 = await b.api.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 });
    expect(s2.id).not.toBe(s1.id);
    expect(b.mock.db.shares.map(s => s.id)).toEqual([s1.id, s2.id]);
  });

  it('重置后回到示例数据，身份不变，重置结果也存下来', async () => {
    const storage = memoryStorage();
    const { mock, api } = open(storage);
    await api.checkIns.create({ qrToken: 'store:binggang', cardId: 'card-ajie-c10' });
    await api.shares.createReferral();
    mock.switchMember(MOCK_MEMBERS.xiaolu);
    mock.reset();
    expect(mock.db).toEqual(seedDb(TODAY));
    expect(mock.currentMember()).toBe(MOCK_MEMBERS.xiaolu);

    const again = open(storage);
    expect(again.mock.db).toEqual(seedDb(TODAY));
    again.mock.switchMember(MOCK_MEMBERS.ajie);
    expect((await again.api.me.cards()).find(c => c.id === 'card-ajie-c10')).toMatchObject({ remaining: 6 });
  });

  it('换成新微信：没有绑定的会员，微信登录拿到的是临时 token', async () => {
    const { mock, api } = open(memoryStorage());
    mock.switchToNewWx();
    expect(mock.currentMember()).toBeNull();
    expect(await api.auth.wxLogin({ code: mock.currentWx() })).toMatchObject({ phoneBound: false });
  });

  it('存着的数据版本不对或身份无效时用默认值', () => {
    const storage = memoryStorage();
    storage.set('mock:db', { version: 0, db: { members: [] } });
    storage.set('mock:wx', 42);
    const { mock } = open(storage);
    expect(mock.db).toEqual(seedDb(TODAY));
    expect(mock.currentMember()).toBe(MOCK_MEMBERS.ajie);
    expect(() => mock.switchMember('m-nobody')).toThrow();
  });
});
