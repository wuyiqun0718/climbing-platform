import { ApiError, createApi } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, MOCK_WAIVER, mockToken, seedDb, type MockStorage } from './index';

const TODAY = '2026-10-21';

/** 两位示例会员共用一份数据，像原型里的两部手机；小鹿也先签好告知书（告知书的规则在 checkins.test.ts 里测） */
function setup() {
  const mock = createMock({ rules: defaultRules, today: () => TODAY });
  mock.db.waivers.push({ id: 'waiver-sign-xiaolu', memberId: MOCK_MEMBERS.xiaolu, waiverVersionId: MOCK_WAIVER.id, signedAt: `${TODAY}T01:00:00.000Z` });
  const entry = (storeId: string, cardId: string) => ({ ...mock.issueEntryQr(storeId), cardId, idempotencyKey: `key-${Math.random()}` });
  const as = (memberId: string | null) =>
    createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => (memberId ? mockToken(memberId) : null) });
  return { mock, entry, db: mock.db, ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), laozhou: as(MOCK_MEMBERS.laozhou), guest: as(null) };
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
    expect((await ajie.me.cards()).map(c => c.kind)).toEqual(['period', 'count', 'class']);
  });

  it('次卡入场扣 1 次，同一天再次入场不扣', async () => {
    const { entry, ajie } = setup();
    const first = await ajie.checkIns.create(entry('binggang', 'card-ajie-c10'));
    const again = await ajie.checkIns.create(entry('binggang', 'card-ajie-c10'));
    expect([first.deducted, again.deducted]).toEqual([1, 0]);
    const c10 = (await ajie.me.cards()).find(c => c.id === 'card-ajie-c10');
    expect(c10).toMatchObject({ remaining: 5 });
  });

  it('不是本馆的码被拒', async () => {
    const { ajie } = setup();
    expect(await codeOf(ajie.checkIns.create({ storeId: 'binggang', qrToken: 'whatever', cardId: 'card-ajie-year', idempotencyKey: 'k1' }))).toEqual({ status: 400, code: 'invalid-qr' });
  });

  it('冻结中的卡不能入场，也不能转赠', async () => {
    const { entry, db, ajie } = setup();
    for (const c of db.cards) if (c.memberId === MOCK_MEMBERS.ajie) c.status = 'frozen';
    expect(await codeOf(ajie.checkIns.create(entry('binggang', 'card-ajie-year')))).toEqual({ status: 409, code: 'card-not-usable' });
    expect(await codeOf(ajie.checkIns.create(entry('binggang', 'card-ajie-c10')))).toEqual({ status: 409, code: 'card-not-usable' });
    expect(await codeOf(ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 }))).toEqual({ status: 409, code: 'card-inactive' });
    expect(db.checkIns.filter(c => c.memberId === MOCK_MEMBERS.ajie && c.on === TODAY)).toEqual([]);
  });

  it('次卡转赠：送出立即扣次，朋友领到好友送的次卡，自己不能领；重复领返回第一次的卡，别人不能再领', async () => {
    const { ajie, xiaolu, laozhou, db } = setup();
    const share = await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 2 });
    expect((await ajie.me.cards()).find(c => c.id === 'card-ajie-c10')).toMatchObject({ remaining: 4 });

    expect(await codeOf(ajie.shares.claim(share.token))).toEqual({ status: 409, code: 'own-share' });
    const { card } = await xiaolu.shares.claim(share.token);
    expect(card).toMatchObject({ kind: 'gift', remaining: 2, memberId: MOCK_MEMBERS.xiaolu });
    expect(await xiaolu.shares.claim(share.token)).toMatchObject({ again: true, card: { id: card.id } });
    expect(await codeOf(laozhou.shares.claim(share.token))).toEqual({ status: 409, code: 'already-claimed' });
    expect(db.cards.filter(c => c.kind === 'gift')).toHaveLength(1);
    expect(await xiaolu.shares.get(share.token)).toMatchObject({ status: 'claimed', display: 'claimed', claimedByMe: true, blockedBy: null, fromName: '阿杰', mine: false });
    expect(await laozhou.shares.get(share.token)).toMatchObject({ claimedByMe: false, blockedBy: 'already-claimed' });
  });

  it('送的次数超过剩余次数被拒', async () => {
    const { ajie } = setup();
    expect(await codeOf(ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 7 }))).toEqual({ status: 409, code: 'not-enough-remaining' });
  });

  it('分享只能按 token 查和领：token 是随机的，跟 id 无关；用 id 查不到', async () => {
    const { ajie, xiaolu, guest, db } = setup();
    const a = await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 });
    const b = await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 });
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.token).not.toContain(a.id);
    expect(await codeOf(xiaolu.shares.get(a.id))).toEqual({ status: 404, code: 'share-not-found' });
    expect(await codeOf(xiaolu.shares.claim(a.id))).toEqual({ status: 404, code: 'share-not-found' });
    // 没登录也能看（朋友点开先看到是谁送的），只返回会员要看的字段
    const seen = await guest.shares.get(a.token);
    expect(seen).toEqual({ token: a.token, kind: 'count', quantity: 1, createdOn: TODAY, expiresOn: a.expiresOn, status: 'pending', fromName: '阿杰', mine: false, display: 'pending', claimedByMe: false, blockedBy: null });
    expect(await ajie.shares.get(a.token)).toMatchObject({ mine: true });
    expect(db.shares.find(s => s.id === a.id)).toMatchObject({ fromCardId: 'card-ajie-c10', token: a.token });
  });

  it('期限卡、好友送的次卡不能转赠；被拒时原卡不扣、不记流水', async () => {
    const { ajie, xiaolu, db } = setup();
    expect(await codeOf(ajie.shares.createCount({ cardId: 'card-ajie-year', quantity: 1 }))).toEqual({ status: 409, code: 'card-not-shareable' });
    const { card: gift } = await xiaolu.shares.claim((await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 2 })).token);
    expect(await codeOf(xiaolu.shares.createCount({ cardId: gift.id, quantity: 1 }))).toEqual({ status: 409, code: 'card-not-shareable' });
    expect(await codeOf(ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 0 }))).toEqual({ status: 409, code: 'invalid-quantity' });
    expect(await codeOf(xiaolu.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 }))).toEqual({ status: 404, code: 'card-not-found' });
    expect(db.cards.find(c => c.id === 'card-ajie-c10')).toMatchObject({ remaining: 4 });
    expect(db.cards.find(c => c.id === gift.id)).toMatchObject({ remaining: 2 });
    expect(db.ledger.filter(l => l.reason === 'share_out')).toHaveLength(1);
    expect(db.shares).toHaveLength(1);
  });

  it('领取幂等：同时点两次只领到一张；两个人同时领只有一个成功', async () => {
    const { ajie, xiaolu, laozhou, db } = setup();
    const share = await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 });
    const [a, b] = await Promise.all([xiaolu.shares.claim(share.token), xiaolu.shares.claim(share.token)]);
    expect(a.card.id).toBe(b.card.id);
    expect([a.again, b.again].sort()).toEqual([false, true]);
    expect(db.ledger.filter(l => l.reason === 'claim')).toHaveLength(1);

    const other = await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 });
    const results = await Promise.allSettled([xiaolu.shares.claim(other.token), laozhou.shares.claim(other.token)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(db.cards.filter(c => c.kind === 'gift')).toHaveLength(2);
  });

  it('老带新体验券只给新客：买过卡的看到原因、领不了；领过一张的不能再领', async () => {
    const { ajie, xiaolu, laozhou, mock, guest } = setup();
    const share = await ajie.shares.createReferral();
    expect(await guest.shares.get(share.token)).toMatchObject({ blockedBy: null });
    expect(await laozhou.shares.get(share.token)).toMatchObject({ blockedBy: 'referral-not-newcomer' });
    expect(await codeOf(laozhou.shares.claim(share.token))).toEqual({ status: 409, code: 'referral-not-newcomer' });
    await xiaolu.shares.claim(share.token);

    mock.db.cards.push({ id: 'card-zhou-year', kind: 'period', memberId: MOCK_MEMBERS.laozhou, productId: 'year', name: '年卡', startsOn: '2026-01-01', expiresOn: '2026-12-31' });
    const again = await laozhou.shares.createReferral();
    expect(await codeOf(xiaolu.shares.claim(again.token))).toEqual({ status: 409, code: 'referral-not-newcomer' });
  });

  it('老带新页：本月名额、已发记录跟着领取和入场变', async () => {
    const { entry, ajie, xiaolu } = setup();
    expect(await ajie.me.referrals()).toEqual({ status: { perMonth: 1, used: 0, left: 1, blockedBy: null }, records: [] });
    expect((await xiaolu.me.referrals()).status).toMatchObject({ left: 0, blockedBy: 'no-period-card' });

    const share = await ajie.shares.createReferral();
    let mine = await ajie.me.referrals();
    expect(mine.status).toMatchObject({ used: 1, left: 0, blockedBy: 'referral-quota-used' });
    expect(mine.records).toEqual([{ token: share.token, createdOn: TODAY, expiresOn: '2026-10-31', state: 'pending', claimerName: null, usedOn: null }]);

    const { card } = await xiaolu.shares.claim(share.token);
    expect((await ajie.me.referrals()).records[0]).toMatchObject({ state: 'claimed', claimerName: '小鹿' });
    await ajie.checkIns.create(entry('huiju', 'card-ajie-year'));
    await xiaolu.checkIns.create(entry('huiju', card.id));
    expect((await ajie.me.referrals()).records[0]).toMatchObject({ state: 'used', usedOn: TODAY });
    expect((await xiaolu.me.referrals()).records).toEqual([]);
  });

  it('老带新：每月 1 次；邀请人当天先入场，体验券才能用', async () => {
    const { entry, ajie, xiaolu } = setup();
    const share = await ajie.shares.createReferral();
    expect(await codeOf(ajie.shares.createReferral())).toEqual({ status: 409, code: 'referral-quota-used' });
    expect(await codeOf(xiaolu.shares.createReferral())).toEqual({ status: 409, code: 'no-period-card' });

    const { card } = await xiaolu.shares.claim(share.token);
    expect(await codeOf(xiaolu.checkIns.create(entry('huiju', card.id)))).toEqual({ status: 409, code: 'inviter-not-checked-in' });
    await ajie.checkIns.create(entry('huiju', 'card-ajie-year'));
    expect(await xiaolu.checkIns.create(entry('huiju', card.id))).toMatchObject({ deducted: 0, memberId: MOCK_MEMBERS.xiaolu });
  });

  it('不能用别人的卡，没有的接口返回 404', async () => {
    const { entry, xiaolu, db } = setup();
    expect(await codeOf(xiaolu.checkIns.create(entry('binggang', 'card-ajie-c10')))).toEqual({ status: 404, code: 'card-not-found' });
    const res = await createMock({ rules: defaultRules, db }).adapter({ method: 'GET', url: '/nope', headers: {} });
    expect(res.status).toBe(404);
  });
});

describe('使用记录 GET /me/cards/:id/ledger', () => {
  it('示例数据的流水跟卡对得上：最新的在前，入场带门店名', async () => {
    const { ajie } = setup();
    const ledger = await ajie.me.cardLedger('card-ajie-c10');
    expect(ledger.map(l => [l.reason, l.delta, l.remainingAfter])).toEqual([
      ['check_in', -1, 6], ['check_in', -1, 7], ['check_in', -1, 8], ['check_in', -1, 9], ['purchase', 10, 10],
    ]);
    expect(ledger[0].storeName).toBe('环球港店');
  });

  it('入场扣次多一条，同日再次入场、期限卡入场不记', async () => {
    const { entry, ajie } = setup();
    await ajie.checkIns.create(entry('binggang', 'card-ajie-c10'));
    await ajie.checkIns.create(entry('binggang', 'card-ajie-c10'));
    await ajie.checkIns.create(entry('binggang', 'card-ajie-year'));
    const [latest, prev] = await ajie.me.cardLedger('card-ajie-c10');
    expect(latest).toMatchObject({ reason: 'check_in', delta: -1, remainingAfter: 5, storeName: '滨港店', on: TODAY, refType: 'check_in' });
    expect(prev.remainingAfter).toBe(6);
    expect((await ajie.me.cardLedger('card-ajie-year')).map(l => l.reason)).toEqual(['purchase']);
  });

  it('转赠：原卡记 share_out -N，领取人的卡记 claim +N，用掉再记入场', async () => {
    const { entry, ajie, xiaolu } = setup();
    const share = await ajie.shares.createCount({ cardId: 'card-ajie-c10', quantity: 2 });
    expect((await ajie.me.cardLedger('card-ajie-c10'))[0]).toMatchObject({ reason: 'share_out', delta: -2, remainingAfter: 4, refId: share.id });

    const { card } = await xiaolu.shares.claim(share.token);
    expect(await xiaolu.me.cardLedger(card.id)).toMatchObject([{ reason: 'claim', delta: 2, remainingAfter: 2, refId: share.id }]);
    await xiaolu.checkIns.create(entry('huiju', card.id));
    expect((await xiaolu.me.cardLedger(card.id)).map(l => [l.reason, l.remainingAfter])).toEqual([['check_in', 1], ['claim', 2]]);
  });

  it('体验券：领取记一条，用掉记一条', async () => {
    const { entry, ajie, xiaolu } = setup();
    const { card } = await xiaolu.shares.claim((await ajie.shares.createReferral()).token);
    await ajie.checkIns.create(entry('huiju', 'card-ajie-year'));
    await xiaolu.checkIns.create(entry('huiju', card.id));
    expect((await xiaolu.me.cardLedger(card.id)).map(l => [l.reason, l.delta, l.remainingAfter])).toEqual([['check_in', -1, 0], ['claim', 1, 1]]);
  });

  it('看不到别人的卡的记录', async () => {
    const { xiaolu, guest } = setup();
    expect(await codeOf(xiaolu.me.cardLedger('card-ajie-c10'))).toEqual({ status: 404, code: 'card-not-found' });
    expect(await codeOf(guest.me.cardLedger('card-ajie-c10'))).toEqual({ status: 401, code: 'unauthorized' });
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
    const entry = (storeId: string, cardId: string) => ({ ...mock.issueEntryQr(storeId), cardId, idempotencyKey: `key-${Math.random()}` });
    return { mock, api, entry };
  };

  it('刷新（重新创建 mock）后数据和身份还在；切到小鹿能领阿杰发的分享', async () => {
    const storage = memoryStorage();
    const first = open(storage);
    expect(first.mock.currentMember()).toBe(MOCK_MEMBERS.ajie);
    const share = await first.api.shares.createCount({ cardId: 'card-ajie-c10', quantity: 2 });
    first.mock.switchMember(MOCK_MEMBERS.xiaolu);

    const second = open(storage);
    expect(second.mock.currentMember()).toBe(MOCK_MEMBERS.xiaolu);
    expect(await second.api.shares.get(share.token)).toMatchObject({ status: 'pending' });
    const { card } = await second.api.shares.claim(share.token);
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
    const { entry, mock, api } = open(storage);
    await api.checkIns.create(entry('binggang', 'card-ajie-c10'));
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
