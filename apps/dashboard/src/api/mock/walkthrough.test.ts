/**
 * 任务 41 中期走查：把原型（prototype/js/main.js 的 ROUTES）里跟后台有关的演示路线，用 owner / manager / desk 三个 mock 账号走一遍，
 * 加一张三种角色的权限表。结果和差异记在 docs/walkthrough-dashboard.md。
 * 小程序那一侧（会员下单、送卡、领券、约课）在小程序分支，这里用 mock 的数据或会员扫码接口代替。
 */
import { ApiError, createAdminApi, createDeskApi } from '@climb/api';
import { bookPt, ledgerMismatch } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMockAdapter } from './adapter';
import { createMockDb, type MockDb } from './db';

const OWNER = '13800000001';
const MANAGER = '13800000002';
const DESK = '13800000003';
const MAX = '13900000001';

function setup() {
  const db = createMockDb('2026-10-21');
  db.clock = '12:00:00';
  let token: string | null = null;
  const api = createAdminApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(db), getToken: () => token });
  const login = async (phone: string) => {
    token = (await api.auth.login({ phone, password: '123456' })).token;
  };
  /** 店长绑一台滨港店的前台平板 */
  const tablet = async () => {
    await login(MANAGER);
    const b = await api.deskDevices.bind({ storeId: 'bingang' });
    return createDeskApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(db), getToken: () => b.deviceToken });
  };
  /** 会员扫平板上的码入场（mock 用 X-Mock-Member 代替会员登录） */
  const scan = (memberId: string, qrToken: string, cardId: string) =>
    createMockAdapter(db)({ method: 'POST', url: '/check-ins', headers: { 'X-Mock-Member': memberId }, body: { storeId: 'bingang', qrToken, cardId } });
  return { db, api, login, tablet, scan };
}

const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);

/** 今天能用期限卡、今天还没入场的滨港店老会员（演示里的「阿杰」） */
function periodMember(db: MockDb) {
  const c = db.cards.find(
    x => x.kind === 'period' && x.startsOn <= db.today && x.expiresOn >= db.today && (x.status ?? 'normal') === 'normal' &&
      db.members.find(m => m.id === x.memberId)!.homeStoreId === 'bingang' && !db.checkIns.some(ci => ci.memberId === x.memberId && ci.on === db.today),
  )!;
  return { memberId: c.memberId, cardId: c.id };
}

describe('走查：原型演示路线（后台部分）', () => {
  it('1 买一张次卡：前台收款开 10 次卡，会员详情有卡，财务今天多一笔次卡收入；卖单次票记在「单次票」、不算办卡', async () => {
    const { api, login, db } = setup();
    await login(MANAGER);
    const before = await api.finance({ from: '2026-10-21', to: '2026-10-21', store: 'bingang' });
    await login(DESK);
    const m = await api.members.create({ phone: '13912345678', name: '小鹿', source: 'walkin', storeId: 'bingang' });
    const r = await api.orders.create({ requestId: 'o1', memberId: m.id, productId: 'p-10x', storeId: 'bingang', channel: 'desk_pos', amountCents: 128_000, priceReason: '' });
    expect((await api.members.get(m.id)).cards.map(c => c.id)).toContain(r.card.id);
    await login(MANAGER);
    const after = await api.finance({ from: '2026-10-21', to: '2026-10-21', store: 'bingang' });
    expect(after.grossCents - before.grossCents).toBe(128_000);
    expect(after.byCategory.find(b => b.key === 'count')!.grossCents - before.byCategory.find(b => b.key === 'count')!.grossCents).toBe(128_000);

    const n = await api.members.create({ phone: '13912345679', name: '只买单次', source: 'walkin', storeId: 'bingang' });
    const single = await api.orders.create({ requestId: 'o2', memberId: n.id, productId: 'p-single', storeId: 'bingang', channel: 'desk_cash', amountCents: 9_900, priceReason: '' });
    expect(single.order.category).toBe('single');
    expect(db.members.find(x => x.id === n.id)!.firstCardOn).toBeNull();
  });

  it('2 扫码入场：店长绑平板，会员扫码用期限卡入场不扣次、自动投保；前台在入场记录和平板列表里都看得到', async () => {
    const { api, login, tablet, scan, db } = setup();
    const desk = await tablet();
    const qr = await desk.qr();
    const { memberId, cardId } = periodMember(db);
    const r = await scan(memberId, qr.token, cardId);
    expect(r).toMatchObject({ status: 200, data: { deducted: 0, checkIn: { method: 'scan', storeId: 'bingang' } } });
    await login(DESK);
    const row = (await api.checkIns.list({ store: 'bingang' })).items.find(x => x.memberId === memberId)!;
    expect(row).toMatchObject({ method: 'scan', deducted: 0, insurance: { status: 'pending' } });
    expect((await desk.feed()).items.some(i => i.id === row.id)).toBe(true);
    expect(await scan(memberId, qr.token, cardId)).toMatchObject({ status: 422, data: { code: 'qr-used' } });
  });

  it('3 入场自动投当日保险：前台卖单次票，会员扫码入场扣 1 次、投保；入场记录显示投保中', async () => {
    const { api, login, tablet, scan } = setup();
    const desk = await tablet();
    await login(DESK);
    const m = await api.members.create({ phone: '13912345678', name: '小鹿', source: 'walkin', storeId: 'bingang' });
    const { card } = await api.orders.create({ requestId: 'o1', memberId: m.id, productId: 'p-single', storeId: 'bingang', channel: 'desk_cash', amountCents: 9_900, priceReason: '' });
    const r = await scan(m.id, (await desk.qr()).token, card.id);
    expect(r).toMatchObject({ status: 200, data: { deducted: 1 } });
    const detail = await api.members.get(m.id);
    expect(detail.recentEntries[0]).toMatchObject({ method: 'scan', insurance: { status: 'pending' } });
    expect(detail.firstVisitOn).toBe('2026-10-21');
  });

  it('4 把次卡送给朋友：后台分享记录能看到；朋友用送的次卡扫码入场后状态变「朋友来过了」，流水对得上', async () => {
    const { api, login, tablet, scan, db } = setup();
    const desk = await tablet();
    await login(OWNER);
    const claimed = (await api.shares({ kind: 'count' })).items.find(s => s.state === 'claimed')!;
    const gift = db.cards.find(c => c.kind === 'gift' && c.shareId === claimed.id)!;
    db.members.find(m => m.id === gift.memberId)!.homeStoreId = 'bingang';
    expect((await scan(gift.memberId, (await desk.qr()).token, gift.id)).status).toBe(200);
    await login(OWNER);
    expect((await api.shares({ kind: 'count' })).items.find(s => s.id === claimed.id)).toMatchObject({ state: 'used', usedOn: '2026-10-21' });
    expect(ledgerMismatch(db.cards.find(c => c.id === gift.id)!, db.ledger)).toBeNull();
  });

  it('5 老带新：被邀请的人先扫码被拦（邀请人今天还没入场），邀请人入场后再扫就能免费进，后台分享记录变「朋友来过了」', async () => {
    const { api, login, tablet, scan, db } = setup();
    const desk = await tablet();
    const inviter = periodMember(db);
    const friend = db.members.find(m => m.source === 'walkin' && !db.checkIns.some(c => c.memberId === m.id && c.on === db.today))!;
    db.referrals.push({ id: 'r-demo', fromMemberId: inviter.memberId, createdOn: '2026-10-21', expiresOn: '2026-10-31', claimedByMemberId: friend.id, usedOn: null });
    db.cards.push({ id: 'v-demo', kind: 'referral', memberId: friend.id, fromMemberId: inviter.memberId, shareId: 'r-demo', name: '老带新体验券', expiresOn: '2026-10-31' });
    expect(await scan(friend.id, (await desk.qr()).token, 'v-demo')).toMatchObject({ status: 422 });
    expect((await scan(inviter.memberId, (await desk.qr()).token, inviter.cardId)).status).toBe(200);
    expect(await scan(friend.id, (await desk.qr()).token, 'v-demo')).toMatchObject({ status: 200, data: { deducted: 0 } });
    await login(OWNER);
    expect((await api.shares({ kind: 'referral' })).items.find(s => s.id === 'r-demo')).toMatchObject({ state: 'used', usedOn: '2026-10-21' });
  });

  it('6 约私教、团课：会员约的团课在名单里，约的私教在时间轴上（会员下单在小程序分支，这里直接写进共用的数据）', async () => {
    const { api, login, db } = setup();
    const thu = db.classSessions.find(s => s.on === '2026-10-22' && s.storeId === 'bingang')!;
    db.cards.push({ id: 'cc-jie', kind: 'class', memberId: 'm-old-1', productId: 'p-class10', name: '团课 10 次', total: 10, remaining: 9, expiresOn: '2026-12-31' });
    db.classBookings.push({ id: 'cb-jie', sessionId: thu.id, memberId: 'm-old-1', status: 'booked', cardId: 'cc-jie', createdAt: '2026-10-21T11:00:00+08:00', deducted: 1 });
    await login(DESK);
    expect((await api.classes.roster(thu.id)).booked.map(b => b.id)).toContain('cb-jie');
    db.ptBookings.push({ id: 'pb-jie', coachId: 's-coach-max', memberId: 'm-old-1', storeId: 'bingang', on: '2026-10-23', hour: 16, status: 'booked', cardId: 'c-pt-m-old-14', deducted: 1, createdAt: 'x' });
    const v = await api.ptSlots({ store: 'bingang' });
    const slot = v.coaches.find(c => c.coach.id === 's-coach-max')!.days.find(d => d.on === '2026-10-23')!.slots.find(s => s.hour === 16)!;
    expect(slot).toMatchObject({ status: 'member', booking: { memberId: 'm-old-1' } });
  });

  it('7 教练自己占时段：Max（员工账号）在后台标线下约，时间轴上显示，会员再约这一格被拦', async () => {
    const { api, login, db } = setup();
    await login(MAX);
    await api.ptSlotMarks.create({ coachId: 's-coach-max', on: '2026-10-22', hour: 16, kind: 'offline', note: '小王' });
    const slot = (await api.ptSlots({ store: 'bingang' })).coaches.find(c => c.coach.id === 's-coach-max')!.days.find(d => d.on === '2026-10-22')!.slots.find(s => s.hour === 16)!;
    expect(slot).toMatchObject({ status: 'offline', mark: { note: '小王' } });
    db.cards.push({ id: 'pt-jie', kind: 'pt', memberId: 'm-old-1', productId: 'p-pt5', name: '私教 5 节', total: 5, remaining: 5, expiresOn: '2026-12-31' });
    expect(() => bookPt({ id: 'x', coachId: 's-coach-max', on: '2026-10-22', hour: 16, storeId: 'bingang', bookings: db.ptBookings, marks: db.ptSlotMarks, cards: db.cards, memberId: 'm-old-1', now: new Date('2026-10-21T12:00:00'), rules: db.rules.ptRules })).toThrow();
  });

  it('9 在后台发布课程：店长加一节团课，小程序课表马上能看到；前台不能排课', async () => {
    const { api, login, db } = setup();
    await login(MANAGER);
    const made = await api.classes.create({ classTypeId: 'ct-intro', storeId: 'bingang', on: '2026-10-23', startTime: '19:30' });
    const mp = await createMockAdapter(db)({ method: 'GET', url: '/classes?store=bingang', headers: {} });
    expect((mp.data as { id: string }[]).map(s => s.id)).toContain(made.id);
    await login(DESK);
    expect(await status(api.classes.create({ classTypeId: 'ct-intro', storeId: 'bingang', on: '2026-10-24', startTime: '19:30' }))).toBe(403);
  });
});

describe('走查：三种角色的权限', () => {
  type Role = 'owner' | 'manager' | 'desk';
  const PHONE: Record<Role, string> = { owner: OWNER, manager: MANAGER, desk: DESK };
  // [说明, 请求, 老板, 店长（只管滨港）, 前台（只管滨港）] 期望的状态码
  const CASES: [string, (api: ReturnType<typeof setup>['api']) => Promise<unknown>, number, number, number][] = [
    ['看板（全部门店）', api => api.dashboard(), 200, 403, 403],
    ['看板（滨港）', api => api.dashboard({ store: 'bingang' }), 200, 200, 200],
    ['看板（汇聚）', api => api.dashboard({ store: 'huiju' }), 200, 403, 403],
    ['财务（滨港）', api => api.finance({ from: '2026-10-01', to: '2026-10-21', store: 'bingang' }), 200, 200, 403],
    ['会员列表', api => api.members.list(), 200, 200, 200],
    ['卡种列表', api => api.products.list(), 200, 200, 200],
    ['改价', api => api.products.update('p-30', { priceCents: 60_000 }), 200, 200, 403],
    ['调整次数', api => api.cards.adjust('c-m-walkin-0', { remaining: 5, reason: '走查' }).catch(e => (e.status === 422 || e.status === 404 ? 200 : Promise.reject(e))), 200, 200, 403],
    // o-pending 在滨港店（没付款，预览里 blockedBy 不为空，但接口照样 200）
    ['退款预览（滨港的订单）', api => api.orders.refundPreview('o-pending'), 200, 200, 403],
    ['入场记录（滨港）', api => api.checkIns.list({ store: 'bingang' }), 200, 200, 200],
    ['分享记录（滨港）', api => api.shares({ store: 'bingang' }), 200, 200, 200],
    ['员工列表', api => api.staff.list(), 200, 403, 403],
    ['操作日志（滨港）', api => api.auditLogs({ store: 'bingang' }), 200, 200, 403],
    ['操作日志（全部）', api => api.auditLogs(), 200, 403, 403],
    ['导出会员', api => api.exports.create('members', {}), 200, 200, 403],
    ['冻结规则（看）', api => api.settings.freezeRules(), 200, 200, 200],
    ['团课规则（改）', api => api.settings.saveClassRules({ cancelBeforeMinutes: 120, waitlist: true, waitlistMax: null, lateGraceMinutes: 15 }), 200, 403, 403],
    ['团课课程（新建）', api => api.classTypes.create({ name: '走查课', minutes: 60, capacity: 8 }), 200, 200, 403],
    ['课表（滨港）', api => api.classes.week({ store: 'bingang' }), 200, 200, 200],
    ['私教时间轴（滨港）', api => api.ptSlots({ store: 'bingang' }), 200, 200, 200],
    ['绑定前台平板', api => api.deskDevices.bind({ storeId: 'bingang' }), 200, 200, 403],
  ];

  for (const role of ['owner', 'manager', 'desk'] as Role[]) {
    it(`${role}`, async () => {
      const results: string[] = [];
      for (const [name, call, ...want] of CASES) {
        const { api, login } = setup();
        await login(PHONE[role]);
        const got = await status(call(api));
        const expected = want[['owner', 'manager', 'desk'].indexOf(role)]!;
        if (got !== expected) results.push(`${name}：期望 ${expected}，实际 ${got}`);
      }
      expect(results).toEqual([]);
    });
  }

  it('前台看看板不返回营收（营收只给能看财务的人）', async () => {
    const { api, login } = setup();
    await login(DESK);
    expect((await api.dashboard({ store: 'bingang' })).monthRevenueCents).toBeNull();
    await login(MANAGER);
    expect((await api.dashboard({ store: 'bingang' })).monthRevenueCents).toBeGreaterThan(0);
  });
});
