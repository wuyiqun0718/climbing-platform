import { ApiError, createAdminApi, createApi, type CreateStaffBody } from '@climb/api';
import { defaultFreezeRules, freezeBlockedBy, ledgerMismatch } from '@climb/core';
import { addDays, endOfMonth } from '@climb/utils';
import { describe, expect, it } from 'vitest';
import { createMockAdapter } from './adapter';
import { createMockDb, type MockDb } from './db';

function setup() {
  let token: string | null = null;
  const db = createMockDb('2026-10-21');
  const api = createAdminApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(db), getToken: () => token });
  const login = async (phone: string) => {
    token = (await api.auth.login({ phone, password: '123456' })).token;
  };
  return { api, login, db };
}

type M = MockDb['members'][number];
const member = (id: string, source: M['source'], store: string, firstVisitOn: string, firstCardOn: string | null = null): M => ({
  id, name: `会员${id}`, phone: '', source, homeStoreId: store, firstVisitOn, firstVisitStoreId: store, firstCardOn, lastEntryOn: null, waiverSignedOn: null,
});

/** 某个会员的保单（示例数据里别人也有保单） */
const policiesOf = (db: MockDb, memberId: string) => db.policies.filter(p => p.memberId === memberId);

const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);

describe('后台 mock', () => {
  it('登录成功返回员工信息，不带密码', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const me = await api.auth.me();
    expect(me).toMatchObject({ name: '馆长', role: 'owner' });
    expect(me).not.toHaveProperty('password');
  });

  it('密码不对返回 401', async () => {
    const { api } = setup();
    expect(await status(api.auth.login({ phone: '13800000001', password: 'x' }))).toBe(401);
  });

  it('没登录返回 401', async () => {
    const { api } = setup();
    expect(await status(api.dashboard())).toBe(401);
  });

  it('看板：全部门店 = 各店相加，单店只算这家', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const all = await api.dashboard();
    const stores = await api.stores.list();
    const each = await Promise.all(stores.map(s => api.dashboard({ store: s.id })));
    expect(all.todayEntries).toBe(each.reduce((n, d) => n + d.todayEntries, 0));
    expect(all.monthRevenueCents).toBe(each.reduce((n, d) => n + d.monthRevenueCents, 0));
    expect(all.activeMembers).toBe(each.reduce((n, d) => n + d.activeMembers, 0));
    expect(new Set(each.map(d => d.todayEntries)).size).toBe(each.length);
    expect(each[0]).toMatchObject({ storeId: 'bingang', today: '2026-10-21' });
  });

  it('只管一家店的员工看不了别的店和全部门店', async () => {
    const { api, login } = setup();
    await login('13800000003');
    expect((await api.stores.list()).map(s => s.id)).toEqual(['bingang']);
    expect(await status(api.dashboard({ store: 'bingang' }))).toBe(200);
    expect(await status(api.dashboard({ store: 'huiju' }))).toBe(403);
    expect(await status(api.dashboard())).toBe(403);
  });

  it('没有这家店返回 404', async () => {
    const { api, login } = setup();
    await login('13800000001');
    expect(await status(api.dashboard({ store: 'nope' }))).toBe(404);
  });

  it('新客按来源：只算本月到今天第一次到店的，办卡只算到今天为止办的', async () => {
    const { api, login, db } = setup();
    db.members = [
      member('a', 'walkin', 'bingang', '2026-10-01', '2026-10-01'),
      member('b', 'walkin', 'bingang', '2026-10-21'),
      member('c', 'walkin', 'huiju', '2026-10-05', '2026-10-20'),
      member('d', 'platform', 'bingang', '2026-10-10', '2026-10-22'), // 明天才办卡，不算
      member('e', 'gift', 'bingang', '2026-09-30', '2026-10-02'), // 上个月第一次来，不是本月新客
      member('f', 'legacy_import', 'huanqiu', '2026-10-03', '2026-10-03'),
      member('g', 'referral', 'bingang', '2026-10-22'), // 明天，不算
    ];
    db.referrals = [];
    await login('13800000001');
    const all = await api.dashboard();
    expect(all.newcomers).toEqual([
      { source: 'walkin', visitors: 3, bought: 2 },
      { source: 'referral', visitors: 0, bought: 0 },
      { source: 'gift', visitors: 0, bought: 0 },
      { source: 'platform', visitors: 1, bought: 0 },
      { source: 'legacy_import', visitors: 1, bought: 1 },
    ]);
    const bingang = await api.dashboard({ store: 'bingang' });
    expect(bingang.newcomers.find(r => r.source === 'walkin')).toEqual({ source: 'walkin', visitors: 2, bought: 1 });
    expect(bingang.newcomers.find(r => r.source === 'legacy_import')).toEqual({ source: 'legacy_import', visitors: 0, bought: 0 });
  });

  it('老带新漏斗：只算本月发出的，按邀请人的门店', async () => {
    const { api, login, db } = setup();
    db.members = [
      member('old1', 'walkin', 'bingang', '2026-01-01', '2026-01-01'),
      member('old2', 'walkin', 'huiju', '2026-01-01', '2026-01-01'),
      member('n1', 'referral', 'bingang', '2026-10-03', '2026-10-03'),
      member('n2', 'referral', 'bingang', '2026-10-08'),
      member('n3', 'referral', 'huiju', '2026-10-09', '2026-10-09'),
      member('n4', 'referral', 'bingang', '2026-09-28', '2026-09-28'),
    ];
    const r = (id: string, from: string, createdOn: string, by: string | null = null, usedOn: string | null = null) => ({
      id, fromMemberId: from, createdOn, expiresOn: endOfMonth(createdOn), claimedByMemberId: by, usedOn,
    });
    db.referrals = [
      r('r1', 'old1', '2026-10-03', 'n1', '2026-10-03'), // 发出、领取、到店、办卡
      r('r2', 'old1', '2026-10-08', 'n2', '2026-10-08'), // 到店没办卡
      r('r3', 'old1', '2026-10-15', 'x'), // 领了没来
      r('r4', 'old1', '2026-10-20'), // 没人领
      r('r5', 'old2', '2026-10-09', 'n3', '2026-10-09'), // 汇聚店的
      r('r6', 'old1', '2026-09-28', 'n4', '2026-09-28'), // 上个月发的
    ];
    await login('13800000001');
    expect((await api.dashboard()).referral).toEqual({ sent: 5, claimed: 4, visited: 3, bought: 2 });
    expect((await api.dashboard({ store: 'bingang' })).referral).toEqual({ sent: 4, claimed: 3, visited: 2, bought: 1 });
    expect((await api.dashboard({ store: 'huanqiu' })).referral).toEqual({ sent: 0, claimed: 0, visited: 0, bought: 0 });
  });

  it('示例数据：新客和老带新的全部门店 = 各店相加，漏斗逐步不增', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const all = await api.dashboard();
    const each = await Promise.all(['bingang', 'huiju', 'huanqiu'].map(store => api.dashboard({ store })));
    all.newcomers.forEach((row, i) => {
      expect(row.visitors).toBe(each.reduce((n, d) => n + d.newcomers[i].visitors, 0));
      expect(row.bought).toBe(each.reduce((n, d) => n + d.newcomers[i].bought, 0));
      expect(row.bought).toBeLessThanOrEqual(row.visitors);
    });
    for (const k of ['sent', 'claimed', 'visited', 'bought'] as const) {
      expect(all.referral[k]).toBe(each.reduce((n, d) => n + d.referral[k], 0));
    }
    const f = all.referral;
    expect(f.sent).toBeGreaterThanOrEqual(f.claimed);
    expect(f.claimed).toBeGreaterThanOrEqual(f.visited);
    expect(f.visited).toBeGreaterThanOrEqual(f.bought);
    expect(f.bought).toBeGreaterThan(0);
    expect(all.newcomers.find(r => r.source === 'referral')!.visitors).toBeGreaterThan(0);
  });

  it('7 天内到期：按会员归属门店，今天到 7 天后，续过的不算', async () => {
    const { api, login, db } = setup();
    db.members = [member('a', 'walkin', 'bingang', '2026-01-01'), member('b', 'walkin', 'huiju', '2026-01-01'), member('c', 'walkin', 'bingang', '2026-01-01')];
    const card = (id: string, memberId: string, expiresOn: string) => ({ id, kind: 'period' as const, memberId, productId: 'p', name: '月卡', startsOn: '2026-01-01', expiresOn });
    db.cards = [
      card('a1', 'a', '2026-10-28'),
      card('a0', 'a', '2026-10-20'), // 昨天过期
      card('b1', 'b', '2026-10-21'),
      card('c1', 'c', '2026-10-23'),
      card('c2', 'c', '2026-11-22'), // c 已经续了
      card('x1', 'nobody', '2026-10-22'), // 找不到会员的不出现
    ];
    await login('13800000001');
    expect((await api.dashboard()).expiring).toEqual([
      { cardId: 'b1', cardName: '月卡', memberId: 'b', memberName: '会员b', storeId: 'huiju', expiresOn: '2026-10-21' },
      { cardId: 'a1', cardName: '月卡', memberId: 'a', memberName: '会员a', storeId: 'bingang', expiresOn: '2026-10-28' },
    ]);
    expect((await api.dashboard({ store: 'bingang' })).expiring.map(r => r.cardId)).toEqual(['a1']);
  });

  it('门店对比：只在全部门店时返回，每家店的数字跟单店看板一致', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const all = await api.dashboard();
    const stores = await api.stores.list();
    expect(all.stores!.map(r => r.storeId)).toEqual(stores.map(s => s.id));
    for (const row of all.stores!) {
      const one = await api.dashboard({ store: row.storeId });
      expect(one.stores).toBeNull();
      expect(row).toEqual({
        storeId: row.storeId,
        monthRevenueCents: one.monthRevenueCents,
        todayEntries: one.todayEntries,
        activeMembers: one.activeMembers,
        newcomers: one.newcomers.reduce((n, r) => n + r.visitors, 0),
        newcomersBought: one.newcomers.reduce((n, r) => n + r.bought, 0),
      });
    }
    expect(all.expiring.length).toBeGreaterThan(0);
    await login('13800000002');
    expect((await api.dashboard({ store: 'bingang' })).stores).toBeNull();
  });
});

describe('后台 mock：财务', () => {
  const range = { from: '2026-10-01', to: '2026-10-21' };
  const sum = (rows: { grossCents: number; refundCents: number }[], k: 'grossCents' | 'refundCents') => rows.reduce((n, r) => n + r[k], 0);

  it('合计 = 渠道分项之和 = 品类分项之和，净收入 = 营收 − 退款', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const f = await api.finance(range);
    expect(f.grossCents).toBeGreaterThan(0);
    expect(f.refundCents).toBeGreaterThan(0);
    for (const rows of [f.byChannel, f.byCategory]) {
      expect(sum(rows, 'grossCents')).toBe(f.grossCents);
      expect(sum(rows, 'refundCents')).toBe(f.refundCents);
    }
    expect(f.netCents).toBe(f.grossCents - f.refundCents);
    expect(f.refunds.reduce((n, r) => n + r.amountCents, 0)).toBe(f.refundCents);
    expect(f.byChannel.find(b => b.key === 'meituan')!.grossCents).toBeGreaterThan(0);
  });

  it('全部门店 = 各店相加', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const all = await api.finance(range);
    const each = await Promise.all(['bingang', 'huiju', 'huanqiu'].map(store => api.finance({ ...range, store })));
    expect(each.reduce((n, f) => n + f.grossCents, 0)).toBe(all.grossCents);
    expect(each.reduce((n, f) => n + f.refundCents, 0)).toBe(all.refundCents);
  });

  it('跟数据库里的订单对得上：没付款、青橙导入、范围外的不算', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    db.orders = [
      { id: 'a', storeId: 'bingang', memberId: 'm-old-0', productName: '月卡', channel: 'wechat', category: 'period', amountCents: 59_900, paidOn: '2026-10-01' },
      { id: 'b', storeId: 'bingang', memberId: 'm-old-0', productName: '10 次卡', channel: 'desk_cash', category: 'count', amountCents: 128_000, paidOn: '2026-10-21' },
      { id: 'c', storeId: 'bingang', memberId: 'm-old-0', productName: '月卡', channel: 'wechat', category: 'period', amountCents: 59_900, paidOn: null },
      { id: 'd', storeId: 'bingang', memberId: 'm-old-0', productName: '20 次卡', channel: 'legacy', category: 'count', amountCents: 229_900, paidOn: '2026-10-02' },
      { id: 'e', storeId: 'bingang', memberId: 'm-old-0', productName: '单次票', channel: 'meituan', category: 'single', amountCents: 9_900, paidOn: '2026-09-30' },
    ];
    db.refunds = [
      { id: 'r1', orderId: 'b', amountCents: 64_000, refundedOn: '2026-10-21', reason: '退一半', method: 'offline', status: 'succeeded' },
      { id: 'r2', orderId: 'e', amountCents: 9_900, refundedOn: '2026-10-01', reason: '没来', method: 'offline', status: 'succeeded' },
    ];
    const f = await api.finance({ ...range, store: 'bingang' });
    expect(f).toMatchObject({ grossCents: 187_900, refundCents: 73_900, netCents: 114_000 });
    expect(f.refunds.map(r => [r.refundId, r.channel, r.productName])).toEqual([['r1', 'desk_cash', '10 次卡'], ['r2', 'meituan', '单次票']]);
  });

  it('前台看不了；店长只能看自己的店；日期不对返回 400', async () => {
    const { api, login } = setup();
    await login('13800000003');
    expect(await status(api.finance({ ...range, store: 'bingang' }))).toBe(403);
    await login('13800000002');
    expect(await status(api.finance({ ...range, store: 'bingang' }))).toBe(200);
    expect(await status(api.finance({ ...range, store: 'huiju' }))).toBe(403);
    expect(await status(api.finance(range))).toBe(403);
    expect(await status(api.finance({ from: '2026-10-21', to: '2026-10-01', store: 'bingang' }))).toBe(400);
  });
});

describe('后台 mock：会员列表', () => {
  const m = (id: string, name: string, phone: string, lastEntryOn: string | null, firstVisitOn = '2026-09-01'): M => ({
    ...member(id, 'walkin', 'huiju', firstVisitOn), name, phone, lastEntryOn,
  });

  it('按手机号（数字）或名字搜，手机号脱敏，最近入场的在前', async () => {
    const { api, login, db } = setup();
    db.members = [
      m('a', '林小满', '13812345678', '2026-10-01'),
      m('b', '陈一鸣', '13987655678', '2026-10-20'),
      m('c', '林舟', '13700001111', null, '2026-10-02'),
      m('d', '王越', '13600002222', null, '2026-10-05'),
    ];
    await login('13800000003');
    const all = await api.members.list();
    expect(all).toMatchObject({ total: 4, page: 1, pageSize: 20 });
    expect(all.items.map(r => r.id)).toEqual(['b', 'a', 'd', 'c']);
    expect(all.items[1]).toMatchObject({ phoneMasked: '138****5678', source: 'walkin', firstVisitOn: '2026-09-01', lastEntryOn: '2026-10-01' });
    expect(JSON.stringify(all)).not.toContain('13812345678');
    expect((await api.members.list({ q: '5678' })).items.map(r => r.id)).toEqual(['b', 'a']);
    expect((await api.members.list({ q: ' 林 ' })).items.map(r => r.id)).toEqual(['a', 'c']);
    expect(await api.members.list({ q: '没有这个人' })).toMatchObject({ items: [], total: 0, page: 1 });
  });

  it('有效卡数按 @climb/core：过期、用完、冻结的不算', async () => {
    const { api, login, db } = setup();
    db.members = [m('a', '林小满', '13812345678', null)];
    const count = (id: string, extra: object = {}) => ({ id, kind: 'count' as const, memberId: 'a', productId: 'p', name: '10 次卡', total: 10, remaining: 3, expiresOn: '2026-12-31', ...extra });
    db.cards = [
      count('ok'),
      count('used', { remaining: 0 }),
      count('expired', { expiresOn: '2026-10-20' }),
      count('frozen', { status: 'frozen' }),
      { id: 'p1', kind: 'period', memberId: 'a', productId: 'p', name: '月卡', startsOn: '2026-10-01', expiresOn: '2026-10-21' },
      count('other', { memberId: 'b' }),
    ];
    await login('13800000003');
    expect((await api.members.list()).items[0].validCards).toBe(2);
  });

  it('分页：每页 20 条，超出夹到最后一页，页码不对返回 400', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const total = db.members.length;
    const p1 = await api.members.list();
    const p2 = await api.members.list({ page: 2 });
    expect(p1.total).toBe(total);
    expect(p1.items).toHaveLength(20);
    expect(new Set([...p1.items, ...p2.items].map(r => r.id)).size).toBe(40);
    const last = Math.ceil(total / 20);
    const far = await api.members.list({ page: 999 });
    expect(far.page).toBe(last);
    expect(far.items).toHaveLength(total - (last - 1) * 20);
    expect(await status(api.members.list({ page: 1.5 }))).toBe(400);
  });

  it('示例数据：手机号不重复，本月办卡的新客有有效卡', async () => {
    const { db, api, login } = setup();
    expect(new Set(db.members.map(x => x.phone)).size).toBe(db.members.length);
    expect(db.members.every(x => /^1\d{10}$/.test(x.phone))).toBe(true);
    await login('13800000001');
    const rows = (await api.members.list({ page: 1 })).items;
    expect(rows.some(r => r.validCards > 0)).toBe(true);
  });
});

describe('后台 mock：会员详情', () => {
  it('基本信息、完整手机号、告知书；没这个人 404', async () => {
    const { api, login, db } = setup();
    db.members = [{ ...member('a', 'referral', 'huiju', '2026-10-02'), phone: '13812345678', waiverSignedOn: '2026-10-02' }, member('b', 'walkin', 'huiju', '2026-10-03')];
    await login('13800000003');
    const a = await api.members.get('a');
    expect(a).toMatchObject({ id: 'a', phone: '13812345678', source: 'referral', homeStoreId: 'huiju', waiver: { signedOn: '2026-10-02', version: db.waiverVersion } });
    expect((await api.members.get('b')).waiver).toBeNull();
    expect(await status(api.members.get('nobody'))).toBe(404);
  });

  it('卡：全部列出，有效的在前，再按到期日倒序；不带别人的卡', async () => {
    const { api, login, db } = setup();
    db.members = [member('a', 'walkin', 'huiju', '2026-09-01')];
    const count = (id: string, extra: object = {}) => ({ id, kind: 'count' as const, memberId: 'a', productId: 'p', name: '10 次卡', total: 10, remaining: 3, expiresOn: '2026-12-31', ...extra });
    db.cards = [
      count('expired', { expiresOn: '2026-10-20' }),
      count('ok'),
      count('refunded', { status: 'refunded', expiresOn: '2027-06-01' }),
      count('later', { expiresOn: '2027-03-01' }),
      count('other', { memberId: 'b' }),
    ];
    await login('13800000003');
    expect((await api.members.get('a')).cards.map(c => c.id)).toEqual(['later', 'ok', 'refunded', 'expired']);
  });

  it('最近订单：倒序、最多 10 条，退款只算退成功的', async () => {
    const { api, login, db } = setup();
    db.members = [member('a', 'walkin', 'huiju', '2026-01-01')];
    const order = (i: number, paidOn: string | null) => ({ id: `o${i}`, storeId: 'huiju', memberId: 'a', productName: '月卡', channel: 'wechat' as const, category: 'period' as const, amountCents: 59_900, paidOn });
    db.orders = [...Array.from({ length: 12 }, (_, i) => order(i, `2026-10-${String(i + 1).padStart(2, '0')}`)), order(99, null), { ...order(100, '2026-10-20'), memberId: 'b' }];
    db.refunds = [
      { id: 'r1', orderId: 'o11', amountCents: 20_000, refundedOn: '2026-10-15', reason: '', method: 'wechat_original', status: 'succeeded' },
      { id: 'r2', orderId: 'o11', amountCents: 10_000, refundedOn: null, reason: '', method: 'wechat_original', status: 'processing' },
    ];
    await login('13800000003');
    const rows = (await api.members.get('a')).recentOrders;
    expect(rows.map(r => r.id)).toEqual(['o99', 'o11', 'o10', 'o9', 'o8', 'o7', 'o6', 'o5', 'o4', 'o3']);
    expect(rows[1]).toMatchObject({ refundedCents: 20_000, status: 'partially_refunded' });
    expect(rows[2]).toMatchObject({ refundedCents: 0, status: 'paid' });
    expect(rows[0].status).toBe('unpaid');
  });

  it('最近入场：倒序，撤销的也列出；示例数据里最晚一次 = 会员列表的最近入场', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const withEntries = db.members.filter(x => x.lastEntryOn);
    for (const x of withEntries.slice(0, 40)) {
      const d = await api.members.get(x.id);
      expect(d.recentEntries[0]?.on).toBe(x.lastEntryOn);
      expect(d.recentEntries.map(e => e.on)).toEqual([...d.recentEntries.map(e => e.on)].sort().reverse());
    }
    for (const x of db.members.filter(y => !y.lastEntryOn)) expect((await api.members.get(x.id)).recentEntries).toEqual([]);
    expect(db.checkIns.filter(c => c.voided)).toHaveLength(1);
    // 用了卡的入场，卡都是这个会员自己的，而且当天在有效期内
    for (const c of db.checkIns.filter(x => x.cardId)) {
      const card = db.cards.find(k => k.id === c.cardId)!;
      expect(card.memberId).toBe(c.memberId);
      expect(card.expiresOn >= c.on).toBe(true);
    }
  });

  it('卡流水：每张卡最后一笔的剩余、到期日 = 卡上的，每笔都接得上', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    for (const card of db.cards) {
      const res = await api.cards.ledger(card.id);
      const last = res.entries[res.entries.length - 1]!;
      expect(last.remainingAfter).toBe('remaining' in card ? card.remaining : null);
      expect(last.expiresOnAfter).toBe(card.expiresOn);
      expect(ledgerMismatch(res.card, res.entries)).toBeNull();
      expect(res.entries.map(e => e.at)).toEqual([...res.entries.map(e => e.at)].sort());
    }
    // 示例数据里有扣次、送朋友、冻结
    const reasons = new Set(db.ledger.map(e => e.reason));
    for (const r of ['purchase', 'check_in', 'share_out', 'freeze'] as const) expect(reasons.has(r)).toBe(true);
  });

  it('卡流水：次卡扣次的入场各有一笔 -1，前台登记的操作人是员工', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const ci = db.checkIns.find(c => c.deducted > 0 && c.method === 'desk')!;
    const res = await api.cards.ledger(ci.cardId!);
    const row = res.entries.find(e => e.ref?.id === ci.id)!;
    expect(row).toMatchObject({ reason: 'check_in', delta: -1, operatorType: 'staff' });
    expect(row.operatorName).not.toBe('');
    expect(res.entries.filter(e => e.reason === 'check_in')).toHaveLength(db.checkIns.filter(c => c.cardId === ci.cardId && c.deducted > 0).length);
    expect(res.memberName).toBe(db.members.find(m => m.id === ci.memberId)!.name);
  });

  it('卡流水：没有这张卡 404，没登录 401', async () => {
    const { api, login } = setup();
    expect(await status(api.cards.ledger('c-old-0'))).toBe(401);
    await login('13800000003');
    expect(await status(api.cards.ledger('nope'))).toBe(404);
    expect(await status(api.cards.ledger('c-old-0'))).toBe(200);
  });

  it('新建会员：存规范化后的手机号，还没来过店，列表和详情都能查到', async () => {
    const { api, login } = setup();
    await login('13800000003');
    const m = await api.members.create({ phone: '+86 199-0000-1234', name: ' 小林 ', source: 'walkin', storeId: 'bingang' });
    expect(m).toMatchObject({ phone: '19900001234', name: '小林', source: 'walkin', homeStoreId: 'bingang', firstVisitOn: null, waiver: null, cards: [] });
    expect((await api.members.get(m.id)).phone).toBe('19900001234');
    const found = await api.members.list({ q: '19900001234' });
    expect(found.items.map(r => r.id)).toEqual([m.id]);
    expect(found.items[0]).toMatchObject({ firstVisitOn: null, validCards: 0, lastEntryOn: null });
  });

  it('新建会员：手机号已经有档案返回 409，带上那个人的 ID', async () => {
    const { api, login, db } = setup();
    await login('13800000003');
    const old = db.members[0]!;
    const before = db.members.length;
    const err = await api.members.create({ phone: old.phone.replace(/(\d{3})(\d{4})/, '$1 $2 '), name: '', source: 'walkin', storeId: 'bingang' }).catch(e => e as ApiError);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).data).toMatchObject({ code: 'member-exists', memberId: old.id, memberName: old.name });
    expect(db.members).toHaveLength(before);
  });

  it('新建会员：填错 400，别的店 403，没登录 401', async () => {
    const { api, login } = setup();
    const body = { phone: '19900001234', name: '', source: 'walkin' as const, storeId: 'bingang' };
    expect(await status(api.members.create(body))).toBe(401);
    await login('13800000003');
    const bad = await api.members.create({ ...body, phone: '123' }).catch(e => e as ApiError);
    expect(bad).toMatchObject({ status: 400, data: { field: 'phone' } });
    expect(await status(api.members.create({ ...body, source: 'legacy_import' }))).toBe(400);
    expect(await status(api.members.create({ ...body, storeId: 'huiju' }))).toBe(403);
    expect(await status(api.members.create({ ...body, storeId: 'nope' }))).toBe(404);
  });
});

describe('后台 mock：线下收款开卡', () => {
  const body = (over: Record<string, unknown> = {}) => ({
    requestId: 'req-1', memberId: 'm-old-5', productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash' as const, amountCents: 128_000, priceReason: '', ...over,
  });

  it('生成订单、卡和一笔 purchase 流水，会员详情马上能看到', async () => {
    const { api, login, db } = setup();
    await login('13800000003');
    const { order, card } = await api.orders.create(body());
    expect(order).toMatchObject({ productName: '10 次卡', category: 'count', channel: 'desk_cash', amountCents: 128_000, paidOn: '2026-10-21', refundedCents: 0, storeId: 'bingang' });
    expect(card).toMatchObject({ kind: 'count', memberId: 'm-old-5', total: 10, remaining: 10, expiresOn: '2027-04-20' });
    const detail = await api.members.get('m-old-5');
    expect(detail.recentOrders[0]!.id).toBe(order.id);
    expect(detail.cards.map(c => c.id)).toContain(card.id);
    const ledger = await api.cards.ledger(card.id);
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({ reason: 'purchase', delta: 10, remainingAfter: 10, ref: { type: 'order', id: order.id }, operatorType: 'staff', operatorName: '前台小葵' });
    expect(ledgerMismatch(ledger.card, ledger.entries)).toBeNull();
    expect(db.orders.find(o => o.id === order.id)).toMatchObject({ createdByStaffId: 's-desk', listPriceCents: 128_000, productId: 'p-10x' });
  });

  it('同一个 requestId 重复提交只开一次卡', async () => {
    const { api, login, db } = setup();
    await login('13800000003');
    const before = { orders: db.orders.length, cards: db.cards.length, ledger: db.ledger.length };
    const a = await api.orders.create(body());
    const b = await api.orders.create(body());
    expect(b).toEqual(a);
    expect({ orders: db.orders.length, cards: db.cards.length, ledger: db.ledger.length }).toEqual({ orders: before.orders + 1, cards: before.cards + 1, ledger: before.ledger + 1 });
  });

  it('改价要写原因，原因记在流水备注；不能高于标价', async () => {
    const { api, login } = setup();
    await login('13800000003');
    const bad = await api.orders.create(body({ amountCents: 100_000 })).catch((e: ApiError) => e);
    expect(bad).toMatchObject({ status: 400, data: { field: 'priceReason' } });
    expect(await status(api.orders.create(body({ requestId: 'r2', amountCents: 200_000, priceReason: 'x' })))).toBe(400);
    const { order, card } = await api.orders.create(body({ requestId: 'r3', amountCents: 100_000, priceReason: '老会员续卡' }));
    expect(order.amountCents).toBe(100_000);
    const ledger = await api.cards.ledger(card.id);
    expect(ledger.entries[0]!.note).toContain('老会员续卡');
  });

  it('期限卡接在没到期的期限卡后面；新建的会员第一次办卡记下办卡日和归属门店', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const old = db.cards.find(c => c.id === 'c-old-20')!;
    const { card } = await api.orders.create(body({ memberId: 'm-old-20', productId: 'p-30', amountCents: 59_900 }));
    expect(card).toMatchObject({ kind: 'period', startsOn: addDays(old.expiresOn, 1) });

    const m = await api.members.create({ phone: '13912345678', name: '新人', source: 'walkin', storeId: 'bingang' });
    await api.orders.create(body({ requestId: 'r2', memberId: m.id, productId: 'p-90', storeId: 'huiju', channel: 'desk_pos', amountCents: 159_900 }));
    const after = await api.members.get(m.id);
    expect(after.homeStoreId).toBe('huiju');
    expect(db.members.find(x => x.id === m.id)!.firstCardOn).toBe('2026-10-21');
    expect(after.cards[0]).toMatchObject({ kind: 'period', startsOn: '2026-10-21', expiresOn: '2027-01-18' });
  });

  it('下架的卡种 422；微信不是线下方式 400；别的店 403；没这个会员、卡种 404；列出卡种含下架的', async () => {
    const { api, login } = setup();
    await login('13800000003');
    expect((await api.products.list()).some(p => !p.onSale)).toBe(true);
    expect(await status(api.orders.create(body({ productId: 'p-summer', amountCents: 49_900 })))).toBe(422);
    expect(await status(api.orders.create(body({ channel: 'wechat' })))).toBe(400);
    expect(await status(api.orders.create(body({ storeId: 'huiju' })))).toBe(403);
    expect(await status(api.orders.create(body({ memberId: 'nobody' })))).toBe(404);
    expect(await status(api.orders.create(body({ productId: 'nothing' })))).toBe(404);
    expect(await status(api.orders.create(body({ requestId: '' })))).toBe(400);
  });
});

describe('后台 mock：手动登记入场', () => {
  // 新建一个会员，前台给他开一张 10 次卡
  async function withCard(productId = 'p-10x', amountCents = 128_000) {
    const s = setup();
    await s.login('13800000003');
    const m = await s.api.members.create({ phone: '13912345678', name: '没电的人', source: 'walkin', storeId: 'bingang' });
    const { card } = await s.api.orders.create({ requestId: 'o1', memberId: m.id, productId, storeId: 'bingang', channel: 'desk_cash', amountCents, priceReason: '' });
    const body = (over: Record<string, unknown> = {}) => ({ requestId: 'ci-req-1', memberId: m.id, storeId: 'bingang', cardId: card.id, ...over });
    return { ...s, m, card, body };
  }

  it('列出能用的卡和扣几次；没签告知书照样能列，带上 waiverSigned = false', async () => {
    const { api, m, card } = await withCard();
    const p = await api.checkIns.preview({ memberId: m.id, storeId: 'bingang' });
    expect(p).toMatchObject({ memberName: '没电的人', reentry: false, waiverSigned: false });
    expect(p.options.map(o => [o.card.id, o.usable, o.deducts])).toEqual([[card.id, true, 1]]);
  });

  it('扣 1 次，记入场记录和 check_in 流水，会员详情能看到；同一天第二次 deducted = 0', async () => {
    const { api, m, card, body, db } = await withCard();
    const first = await api.checkIns.create(body());
    expect(first).toMatchObject({ deducted: 1, reentry: false, waiverSigned: false, card: { remaining: 9 }, checkIn: { method: 'desk', on: '2026-10-21', storeId: 'bingang', deducted: 1, voided: false } });
    const ledger = await api.cards.ledger(card.id);
    expect(ledger.entries.at(-1)).toMatchObject({ reason: 'check_in', delta: -1, remainingAfter: 9, ref: { type: 'check_in', id: first.checkIn.id }, operatorName: '前台小葵' });
    expect(ledgerMismatch(ledger.card, ledger.entries)).toBeNull();
    const detail = await api.members.get(m.id);
    expect(detail.recentEntries[0]!.id).toBe(first.checkIn.id);
    expect(detail).toMatchObject({ firstVisitOn: '2026-10-21', firstVisitStoreId: 'bingang' });
    expect(db.members.find(x => x.id === m.id)!.lastEntryOn).toBe('2026-10-21');

    expect(await api.checkIns.preview({ memberId: m.id, storeId: 'bingang' })).toMatchObject({ reentry: true, options: [{ deducts: 0 }] });
    const second = await api.checkIns.create(body({ requestId: 'ci-req-2' }));
    expect(second).toMatchObject({ deducted: 0, reentry: true, card: { remaining: 9 } });
    expect((await api.cards.ledger(card.id)).entries).toHaveLength(2);
  });

  it('带同一个幂等键重复提交不重复扣', async () => {
    const { api, body, db, card } = await withCard();
    const before = { checkIns: db.checkIns.length, ledger: db.ledger.length };
    const a = await api.checkIns.create(body());
    const b = await api.checkIns.create(body());
    expect(b).toEqual(a);
    expect({ checkIns: db.checkIns.length, ledger: db.ledger.length }).toEqual({ checkIns: before.checkIns + 1, ledger: before.ledger + 1 });
    expect(db.cards.find(c => c.id === card.id)).toMatchObject({ remaining: 9 });
  });

  it('单次票今天用掉后再进还能用，不扣', async () => {
    const { api, db, m, body } = await withCard();
    db.products.push({ id: 'p-1x', category: 'count', name: '单次票', priceCents: 9_900, quantity: 1, perks: [], onSale: true });
    const ticket = await api.orders.create({ requestId: 'o2', memberId: m.id, productId: 'p-1x', storeId: 'bingang', channel: 'desk_cash', amountCents: 9_900, priceReason: '' });
    expect(await api.checkIns.create(body({ cardId: ticket.card.id }))).toMatchObject({ deducted: 1, card: { remaining: 0 } });
    const again = await api.checkIns.preview({ memberId: m.id, storeId: 'bingang' });
    expect(again.options[0]).toMatchObject({ card: { id: ticket.card.id }, deducts: 0 });
    expect(await api.checkIns.create(body({ requestId: 'ci-req-2', cardId: ticket.card.id }))).toMatchObject({ deducted: 0 });
  });

  it('保险：当天第一次入场生成一张 pending 保单；同一天再次入场复用，不再生成；预览里带保险状态', async () => {
    const { api, db, m, body } = await withCard();
    expect((await api.checkIns.preview({ memberId: m.id, storeId: 'bingang' })).insurance).toEqual({ needed: true, policyId: null, status: null });
    const first = await api.checkIns.create(body());
    expect(first.insurance).toMatchObject({ needed: true, status: 'pending' });
    expect(policiesOf(db, m.id)).toEqual([{ id: first.insurance.policyId, memberId: m.id, storeId: 'bingang', on: '2026-10-21', checkInId: first.checkIn.id, status: 'pending' }]);

    expect((await api.checkIns.preview({ memberId: m.id, storeId: 'bingang' })).insurance).toEqual({ needed: false, policyId: first.insurance.policyId, status: 'pending' });
    const second = await api.checkIns.create(body({ requestId: 'ci-req-2' }));
    expect(second.insurance).toEqual({ needed: false, policyId: first.insurance.policyId, status: 'pending' });
    expect(policiesOf(db, m.id)).toHaveLength(1);
  });

  it('保险：同一个幂等键重复提交不重复投保', async () => {
    const { api, db, body } = await withCard();
    await api.checkIns.create(body());
    await api.checkIns.create(body());
    expect(policiesOf(db, body().memberId)).toHaveLength(1);
  });

  it('保险：今天的保单待退保（撤销入场后）再入场新投一张', async () => {
    const { api, db, body } = await withCard();
    const first = await api.checkIns.create(body());
    db.checkIns.find(c => c.id === first.checkIn.id)!.voided = true;
    db.policies.find(p => p.id === first.insurance.policyId)!.status = 'refund_pending';
    const again = await api.checkIns.create(body({ requestId: 'ci-req-2' }));
    expect(again).toMatchObject({ reentry: false, insurance: { needed: true, status: 'pending' } });
    expect(again.insurance.policyId).not.toBe(first.insurance.policyId);
    expect(policiesOf(db, body().memberId).map(p => p.checkInId)).toEqual([first.checkIn.id, again.checkIn.id]);
  });

  it('冻结的卡 422；别人的卡、没这个会员、没这家店 404；别的店 403；没有 requestId 400', async () => {
    const { api, db, body, card } = await withCard();
    const other = db.cards.find(c => c.memberId !== body().memberId)!;
    expect(await status(api.checkIns.create(body({ cardId: other.id })))).toBe(404);
    expect(await status(api.checkIns.create(body({ memberId: 'nobody' })))).toBe(404);
    expect(await status(api.checkIns.create(body({ storeId: 'nope' })))).toBe(404);
    expect(await status(api.checkIns.create(body({ storeId: 'huiju' })))).toBe(403);
    expect(await status(api.checkIns.preview({ memberId: body().memberId, storeId: 'huiju' }))).toBe(403);
    expect(await status(api.checkIns.create(body({ requestId: '' })))).toBe(400);
    const i = db.cards.findIndex(c => c.id === card.id);
    db.cards[i] = { ...db.cards[i]!, status: 'frozen' };
    const err = await api.checkIns.create(body()).catch((e: ApiError) => e);
    expect(err).toMatchObject({ status: 422, data: { code: 'card-not-usable' } });
    expect((await api.checkIns.preview({ memberId: body().memberId, storeId: 'bingang' })).options).toEqual([]);
  });
});

describe('后台 mock：撤销入场', () => {
  async function entered() {
    const s = setup();
    await s.login('13800000003');
    const m = await s.api.members.create({ phone: '13912345678', name: '扫错的人', source: 'walkin', storeId: 'bingang' });
    const { card } = await s.api.orders.create({ requestId: 'o1', memberId: m.id, productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash', amountCents: 128_000, priceReason: '' });
    const enter = (requestId: string, cardId = card.id) => s.api.checkIns.create({ requestId, memberId: m.id, storeId: 'bingang', cardId });
    const first = await enter('ci-req-1');
    return { ...s, m, card, enter, first };
  }

  it('撤销后剩余次数恢复，记 check_in_void 流水；记下撤销人和原因；保单待退保；最近入场重新算', async () => {
    const { api, db, m, card, first } = await entered();
    expect(first.card).toMatchObject({ remaining: 9 });
    const r = await api.checkIns.void(first.checkIn.id, { reason: '扫错了卡' });
    expect(r).toMatchObject({ restored: 1, card: { remaining: 10 }, insurance: { policyId: first.insurance.policyId, status: 'refund_pending' } });
    expect(r.checkIn).toMatchObject({ voided: true, voidInfo: { byName: '前台小葵', reason: '扫错了卡' } });
    const ledger = await api.cards.ledger(card.id);
    expect(ledger.entries.at(-1)).toMatchObject({ reason: 'check_in_void', delta: 1, remainingAfter: 10, note: '扫错了卡', ref: { id: first.checkIn.id }, operatorName: '前台小葵' });
    expect(ledgerMismatch(ledger.card, ledger.entries)).toBeNull();
    const detail = await api.members.get(m.id);
    expect(detail.cards.find(c => c.id === card.id)).toMatchObject({ remaining: 10 });
    expect(detail.recentEntries[0]).toMatchObject({ id: first.checkIn.id, voided: true, voidInfo: { reason: '扫错了卡' } });
    expect(db.members.find(x => x.id === m.id)!.lastEntryOn).toBeNull();
  });

  it('同日再次入场扣 0 的撤销不退；撤销扣次的那次时还有免扣再进的：不退，扣次转给那次，保单改挂过去', async () => {
    const { api, db, m, card, enter, first } = await entered();
    const again = await enter('ci-req-2');
    expect(again.deducted).toBe(0);
    expect(await api.checkIns.void(again.checkIn.id, { reason: '登记重了' })).toMatchObject({ restored: 0, card: { remaining: 9 }, insurance: null });
    const third = await enter('ci-req-3');
    expect(third.deducted).toBe(0);
    const r = await api.checkIns.void(first.checkIn.id, { reason: '扫错了' });
    expect(r).toMatchObject({
      restored: 0,
      card: { remaining: 9 },
      moved: { checkIn: { id: third.checkIn.id, deducted: 1, voided: false }, card: null },
      insurance: { policyId: first.insurance.policyId, status: 'pending', checkInId: third.checkIn.id },
    });
    expect(db.checkIns.find(c => c.id === third.checkIn.id)!.deducted).toBe(1);
    expect(db.ledger.at(-1)).toMatchObject({ cardId: card.id, reason: 'check_in_void', delta: 0, remainingAfter: 9 });
    expect(policiesOf(db, m.id)).toHaveLength(1);
    expect(db.members.find(x => x.id === m.id)!.lastEntryOn).toBe('2026-10-21');
    expect(ledgerMismatch(db.cards.find(c => c.id === card.id)!, db.ledger)).toBeNull();
    // 转过去的那次再撤销，当天没有别的入场了，才退回
    expect(await api.checkIns.void(third.checkIn.id, { reason: '人走了' })).toMatchObject({ restored: 1, moved: null, card: { remaining: 10 }, insurance: { status: 'refund_pending' } });
    expect(ledgerMismatch(db.cards.find(c => c.id === card.id)!, db.ledger)).toBeNull();
  });

  it('重复撤销幂等：返回第一次的结果，不再退次、不再记流水', async () => {
    const { api, db, card, first } = await entered();
    const a = await api.checkIns.void(first.checkIn.id, { reason: '扫错了卡' });
    const ledgerLen = db.ledger.length;
    const b = await api.checkIns.void(first.checkIn.id, { reason: '又点了一次' });
    expect(b).toEqual(a);
    expect(db.ledger).toHaveLength(ledgerLen);
    expect(db.cards.find(c => c.id === card.id)).toMatchObject({ remaining: 10 });
  });

  it('撤销后再入场：重新扣次、新投保单', async () => {
    const { api, db, m, enter, first } = await entered();
    await api.checkIns.void(first.checkIn.id, { reason: '扫错了卡' });
    const again = await enter('ci-req-2');
    expect(again).toMatchObject({ deducted: 1, reentry: false, insurance: { needed: true, status: 'pending' } });
    expect(policiesOf(db, m.id).map(p => p.status)).toEqual(['refund_pending', 'pending']);
  });

  it('体验券撤销后恢复成没用过，老带新记录也清掉到店日', async () => {
    const { api, db, m, enter, first } = await entered();
    db.rules = { ...db.rules, referralRequiresInviterSameDay: false };
    const ref = db.referrals.find(r => r.claimedByMemberId && !r.usedOn) ?? db.referrals[0]!;
    db.cards.push({ id: 'v-test', kind: 'referral', memberId: m.id, fromMemberId: ref.fromMemberId, shareId: ref.id, name: '老带新体验券', expiresOn: '2026-10-31' });
    ref.usedOn = null;
    // 当天已经用次卡进过一次，再用体验券登记一次（体验券照样记用掉）
    const used = await enter('ci-req-2', 'v-test');
    expect(db.cards.find(c => c.id === 'v-test')).toMatchObject({ usedOn: '2026-10-21' });
    // 先撤次卡那次：体验券那次不是次卡，不接扣次，次卡照常退回
    expect(await api.checkIns.void(first.checkIn.id, { reason: '扫错了卡' })).toMatchObject({ restored: 1, moved: null });
    // 当天只剩体验券这次，撤销后体验券恢复（同一天还有别的入场时不恢复，见 core 单测）
    const r = await api.checkIns.void(used.checkIn.id, { reason: '邀请人没来' });
    expect(r).toMatchObject({ restored: 0, voucherRestored: true });
    expect(db.cards.find(c => c.id === 'v-test')).not.toHaveProperty('usedOn');
    expect(ref.usedOn).toBeNull();
  });

  it('没写原因 400；没这条入场 404；别的店的入场 403；没登录 401；示例里已撤销的再撤返回 200', async () => {
    const { api, db, first } = await entered();
    expect(await api.checkIns.void(first.checkIn.id, { reason: '  ' }).catch((e: ApiError) => e)).toMatchObject({ status: 400, data: { field: 'reason' } });
    expect(db.checkIns.find(c => c.id === first.checkIn.id)!.voided).toBe(false);
    expect(await status(api.checkIns.void('nope', { reason: 'x' }))).toBe(404);
    const elsewhere = db.checkIns.find(c => c.storeId !== 'bingang' && !c.voided)!;
    expect(await status(api.checkIns.void(elsewhere.id, { reason: 'x' }))).toBe(403);
    const seeded = db.checkIns.find(c => c.voided)!;
    const s2 = setup();
    await s2.login('13800000001');
    expect((await s2.api.checkIns.void(seeded.id, { reason: 'x' })).checkIn).toMatchObject({ voided: true, voidInfo: { reason: '扫错了卡' } });
    const anon = setup();
    expect(await status(anon.api.checkIns.void(first.checkIn.id, { reason: 'x' }))).toBe(401);
  });

  it('冻结规则：都能看，只有老板能改；改了以后冻结按新规则拦', async () => {
    const { api, login, db } = setup();
    await login('13800000003');
    expect(await api.settings.freezeRules()).toEqual(defaultFreezeRules);
    const next = { memberSelfService: false, perMonth: 2, perYear: 6, minDays: 7, maxDays: 60 };
    expect(await status(api.settings.saveFreezeRules(next))).toBe(403);
    await login('13800000002');
    expect(await status(api.settings.saveFreezeRules(next))).toBe(403);
    await login('13800000001');
    const bad = await api.settings.saveFreezeRules({ ...next, minDays: 10, maxDays: 9 }).catch((e: ApiError) => e);
    expect(bad).toMatchObject({ status: 400, data: { field: 'maxDays' } });
    expect(await api.settings.saveFreezeRules({ ...next, extra: 1 } as typeof next)).toEqual(next);
    expect(await api.settings.freezeRules()).toEqual(next);
    expect(db.rules.freezeRules).toEqual(next);
    const card = { id: 'p', kind: 'period' as const, memberId: 'm', productId: 'y', name: '年卡', startsOn: '2026-01-01', expiresOn: '2026-12-31' };
    const args = { card, cards: [card], history: [], today: db.today, rules: db.rules.freezeRules };
    expect(freezeBlockedBy(args)).toBe('freeze-not-self-service');
    expect(freezeBlockedBy({ ...args, rules: { ...db.rules.freezeRules, memberSelfService: true }, history: ['2026-10-01', '2026-10-02'] })).toBe('freeze-month-quota-used');
  });
});

describe('后台 mock：调整卡、冻结和解冻', () => {
  async function withCards() {
    const s = setup();
    const m = member('m-t', 'walkin', 'bingang', '2026-03-15', '2026-03-15');
    s.db.members.push(m);
    const year = { id: 'p-t', kind: 'period' as const, memberId: m.id, productId: 'y', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
    const next = { id: 'p-t2', kind: 'period' as const, memberId: m.id, productId: 'm', name: '月卡', startsOn: '2027-03-15', expiresOn: '2027-04-14' };
    const count = { id: 'c-t', kind: 'count' as const, memberId: m.id, productId: 'c', name: '10 次卡', total: 10, remaining: 5, expiresOn: '2027-02-06' };
    s.db.cards.push(year, next, count);
    for (const c of [year, next, count]) {
      const counted = c.kind === 'count';
      s.db.ledger.push({ id: `l-buy-${c.id}`, cardId: c.id, at: '2026-03-15T10:00:00+08:00', delta: counted ? 5 : 0, remainingAfter: counted ? 5 : null, expiresOnAfter: c.expiresOn, reason: 'purchase', ref: null, operatorType: 'staff', operatorId: 's-owner', note: '' });
    }
    await s.login('13800000002');
    return { ...s, m };
  }
  const card = (db: MockDb, id: string) => db.cards.find(c => c.id === id)!;
  const reasons = (db: MockDb, id: string) => db.ledger.filter(e => e.cardId === id).map(e => e.reason);

  it('调次数、改到期日：必须写原因，记 adjust 流水，对账接得上；期限卡改到期日后面的卡跟着挪', async () => {
    const { api, db } = await withCards();
    expect(await api.cards.adjust('c-t', { remaining: 7, reason: ' ' }).catch((e: ApiError) => e)).toMatchObject({ status: 400, data: { field: 'reason' } });
    expect(await api.cards.adjust('c-t', { remaining: 7, expiresOn: '2027-03-01', reason: '补偿闭馆' })).toMatchObject({ card: { remaining: 7, expiresOn: '2027-03-01' } });
    expect(db.ledger.at(-1)).toMatchObject({ cardId: 'c-t', reason: 'adjust', delta: 2, remainingAfter: 7, operatorType: 'staff', operatorId: 's-manager', note: '补偿闭馆' });
    expect(ledgerMismatch(card(db, 'c-t'), db.ledger)).toBeNull();
    const r = await api.cards.adjust('p-t', { expiresOn: '2027-03-21', reason: '补 7 天' });
    expect(r.followers).toMatchObject([{ id: 'p-t2', startsOn: '2027-03-22', expiresOn: '2027-04-21' }]);
    expect(reasons(db, 'p-t2')).toEqual(['purchase', 'adjust']);
    for (const id of ['p-t', 'p-t2']) expect(ledgerMismatch(card(db, id), db.ledger)).toBeNull();
    expect(await api.cards.adjust('p-t', { remaining: 3, reason: 'x' }).catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'adjust-invalid' } });
  });

  it('只有店长以上能调、能冻；没有这张卡 404', async () => {
    const { api, login } = await withCards();
    await login('13800000003');
    expect(await status(api.cards.adjust('c-t', { remaining: 7, reason: 'x' }))).toBe(403);
    expect(await status(api.cards.freeze('p-t', { days: 10 }))).toBe(403);
    expect(await status(api.cards.unfreeze('p-t'))).toBe(403);
    await login('13800000002');
    expect(await status(api.cards.adjust('nope', { remaining: 7, reason: 'x' }))).toBe(404);
  });

  it('后台帮冻：会员不能自助时也能办；冻结中的卡不能入场；记 freeze 流水，后面的卡跟着挪', async () => {
    const { api, db, m } = await withCards();
    db.rules = { ...db.rules, freezeRules: { ...db.rules.freezeRules, memberSelfService: false } };
    expect(await api.cards.freezeOptions('p-t')).toMatchObject({ blockedBy: null, needsOverride: [], monthLeft: 1 });
    const r = await api.cards.freeze('p-t', { days: 10, note: '出差' });
    expect(r).toMatchObject({ card: { status: 'frozen', frozenFrom: '2026-10-21', frozenUntil: '2026-10-30' }, followers: [{ startsOn: '2027-03-25' }], overridden: [] });
    expect(db.ledger.filter(e => e.cardId === 'p-t').at(-1)).toMatchObject({ reason: 'freeze', operatorType: 'staff', note: '前台代办冻结 10 天，到 2026-10-30；出差' });
    const preview = await api.checkIns.preview({ memberId: m.id, storeId: 'bingang' });
    expect(preview.options.some(o => o.card.id === 'p-t')).toBe(false);
    expect(await api.cards.freeze('p-t', { days: 10 }).catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'freeze-card-not-active' } });
  });

  it('后台代办的计入每月次数：再冻要写原因破例，破例记在流水里', async () => {
    const { api, db } = await withCards();
    db.cards.push({ id: 'p-t3', kind: 'period', memberId: db.members[0]!.id, productId: 'y', name: '年卡', startsOn: '2026-01-01', expiresOn: '2026-12-31' });
    await api.cards.freeze('p-t', { days: 7 });
    await api.cards.unfreeze('p-t');
    expect(await api.cards.freezeOptions('p-t')).toMatchObject({ needsOverride: ['freeze-month-quota-used'], monthLeft: 0 });
    expect(await api.cards.freeze('p-t', { days: 7 }).catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'freeze-month-quota-used' } });
    expect(await api.cards.freeze('p-t', { days: 45, overrideReason: '骨折，有医生证明' })).toMatchObject({ overridden: ['freeze-month-quota-used', 'freeze-days-out-of-range'] });
    expect(db.ledger.at(-2)).toMatchObject({ cardId: 'p-t', reason: 'freeze', note: '前台代办冻结 45 天，到 2026-12-04；破例：骨折，有医生证明' });
    // 别的会员不受影响
    expect(await api.cards.freezeOptions('p-t3')).toMatchObject({ monthLeft: 1 });
  });

  it('解冻：会员自助冻的也能提前解，到期日按实际冻结天数顺延；冻满没解的自动解冻', async () => {
    const { api, db } = await withCards();
    const y = card(db, 'p-t') as Extract<ReturnType<typeof card>, { kind: 'period' }>;
    Object.assign(y, { status: 'frozen', frozenFrom: '2026-10-15', frozenUntil: '2026-11-13' });
    const r = await api.cards.unfreeze('p-t', { note: '提前回来了' });
    expect(r).toMatchObject({ days: 6, card: { status: 'normal', expiresOn: '2027-03-20' }, followers: [{ startsOn: '2027-03-21' }] });
    expect(r.card).not.toHaveProperty('frozenFrom');
    expect(db.ledger.filter(e => e.cardId === 'p-t').at(-1)).toMatchObject({ reason: 'unfreeze', note: '前台办理提前解冻，到期日顺延 6 天；提前回来了' });
    expect(await api.cards.unfreeze('p-t').catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'card-not-frozen' } });
    for (const id of ['p-t', 'p-t2']) expect(ledgerMismatch(card(db, id), db.ledger)).toBeNull();

    Object.assign(card(db, 'p-t'), { status: 'frozen', frozenFrom: '2026-10-01', frozenUntil: '2026-10-10' });
    await api.cards.freezeOptions('p-t');
    expect(card(db, 'p-t')).toMatchObject({ status: 'normal', expiresOn: addDays('2027-03-20', 10) });
    expect(db.ledger.find(e => e.cardId === 'p-t' && e.operatorType === 'system')).toMatchObject({ reason: 'unfreeze', at: '2026-10-11T00:00:00+08:00' });
  });
});

describe('后台 mock：退款', () => {
  /** 店长在滨港店给 m-old-5 线下开一张 10 次卡，入场一次，再微信买一张季卡（模拟小程序订单） */
  async function withOrders() {
    const s = setup();
    await s.login('13800000002');
    const desk = await s.api.orders.create({ requestId: 'buy-1', memberId: 'm-old-5', productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash', amountCents: 128_000, priceReason: '' });
    await s.api.checkIns.create({ requestId: 'in-1', memberId: 'm-old-5', storeId: 'bingang', cardId: desk.card.id });
    const season = { id: 'c-wx', kind: 'period' as const, memberId: 'm-old-5', productId: 'p-90', name: '季卡', startsOn: '2026-09-22', expiresOn: '2026-12-20' };
    s.db.cards.push(season);
    s.db.ledger.push({ id: 'l-wx', cardId: 'c-wx', at: '2026-09-22T10:00:00+08:00', delta: 0, remainingAfter: null, expiresOnAfter: season.expiresOn, reason: 'purchase', ref: { type: 'order', id: 'o-wx' }, operatorType: 'member', operatorId: 'm-old-5', note: '' });
    s.db.orders.push({ id: 'o-wx', storeId: 'bingang', memberId: 'm-old-5', productName: '季卡', channel: 'wechat', category: 'period', amountCents: 159_900, paidOn: '2026-09-22', productId: 'p-90', cardId: 'c-wx' });
    return { ...s, desk };
  }
  const body = (over: Record<string, unknown> = {}) => ({ requestId: 'rf-req-1', amountCents: 100_000, reason: '搬家了', ...over });

  it('预览：还能退多少、按剩余比例建议金额、退款方式', async () => {
    const { api, desk } = await withOrders();
    expect(await api.orders.refundPreview(desk.order.id)).toMatchObject({
      blockedBy: null, method: 'offline', refundableCents: 128_000, suggestedCents: 115_200, basis: { kind: 'count', remaining: 9, total: 10 }, refunds: [], card: { id: desk.card.id },
    });
    // 季卡 90 天，9-22 开始，今天 10-21 起还剩 61 天
    expect(await api.orders.refundPreview('o-wx')).toMatchObject({ method: 'wechat_original', suggestedCents: Math.floor((159_900 * 61) / 90), basis: { kind: 'period', remainingDays: 61, totalDays: 90 } });
  });

  it('线下订单只记录：订单部分退款，卡已退款、次数清零、不能再入场；流水对得上；财务页退款单列', async () => {
    const { api, db, desk } = await withOrders();
    const r = await api.orders.refund(desk.order.id, body());
    expect(r.refund).toMatchObject({ amountCents: 100_000, method: 'offline', status: 'succeeded', refundedOn: '2026-10-21', reason: '搬家了', byName: '店长阿凯' });
    expect(r.order).toMatchObject({ refundedCents: 100_000, status: 'partially_refunded' });
    expect(r.card).toMatchObject({ status: 'refunded', remaining: 0 });
    const ledger = await api.cards.ledger(desk.card.id);
    expect(ledger.entries.at(-1)).toMatchObject({ reason: 'refund', delta: -9, remainingAfter: 0, ref: { type: 'order', id: desk.order.id }, note: '搬家了', operatorName: '店长阿凯' });
    expect(ledgerMismatch(ledger.card, ledger.entries)).toBeNull();
    const preview = await api.checkIns.preview({ memberId: 'm-old-5', storeId: 'bingang' });
    expect(preview.options.some(o => o.card.id === desk.card.id)).toBe(false);
    expect(await api.checkIns.create({ requestId: 'in-2', memberId: 'm-old-5', storeId: 'bingang', cardId: desk.card.id }).catch((e: ApiError) => e.status)).toBe(422);
    expect((await api.members.get('m-old-5')).recentOrders.find(o => o.id === desk.order.id)).toMatchObject({ status: 'partially_refunded', cardId: desk.card.id });
    const f = await api.finance({ from: '2026-10-01', to: '2026-10-21', store: 'bingang' });
    expect(f.refunds[0]).toMatchObject({ orderId: desk.order.id, amountCents: 100_000, method: 'offline', reason: '搬家了' });
    expect(db.refunds.at(-1)).toMatchObject({ staffId: 's-manager' });

    // 再补退剩下的：订单变成已退款
    const again = await api.orders.refund(desk.order.id, body({ requestId: 'rf-req-2', amountCents: 28_000, reason: '补退' }));
    expect(again.order).toMatchObject({ refundedCents: 128_000, status: 'refunded' });
    expect(await api.orders.refundPreview(desk.order.id)).toMatchObject({ blockedBy: 'order-fully-refunded', method: null, refundableCents: 0 });
  });

  it('微信订单原路退（mock 当场回调成功）；期限卡退了不能再入场', async () => {
    const { api } = await withOrders();
    const r = await api.orders.refund('o-wx', body({ amountCents: 159_900 }));
    expect(r.refund).toMatchObject({ method: 'wechat_original', status: 'succeeded', refundedOn: '2026-10-21' });
    expect(r.order.status).toBe('refunded');
    expect(r.card).toMatchObject({ id: 'c-wx', status: 'refunded' });
    const preview = await api.checkIns.preview({ memberId: 'm-old-5', storeId: 'bingang' });
    expect(preview.options.some(o => o.card.id === 'c-wx')).toBe(false);
  });

  it('超额退款 422；金额不对、没写原因 400；同一个 requestId 只退一次', async () => {
    const { api, db, desk } = await withOrders();
    expect(await api.orders.refund(desk.order.id, body({ amountCents: 128_001 })).catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'refund-exceeds' } });
    expect(await api.orders.refund(desk.order.id, body({ amountCents: 0 })).catch((e: ApiError) => e)).toMatchObject({ status: 400, data: { field: 'amountCents' } });
    expect(await api.orders.refund(desk.order.id, body({ reason: ' ' })).catch((e: ApiError) => e)).toMatchObject({ status: 400, data: { field: 'reason' } });
    const n = db.refunds.length;
    const a = await api.orders.refund(desk.order.id, body());
    expect(await api.orders.refund(desk.order.id, body())).toEqual(a);
    expect(db.refunds.length).toBe(n + 1);
    expect(await api.orders.refund(desk.order.id, body({ requestId: 'rf-req-3', amountCents: 28_001 })).catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'refund-exceeds' } });
  });

  it('前台不能退 403；别的店的订单 403；没这个订单 404；美团的、没付款的 422', async () => {
    const { api, login, db, desk } = await withOrders();
    await login('13800000003');
    expect(await status(api.orders.refundPreview(desk.order.id))).toBe(403);
    expect(await status(api.orders.refund(desk.order.id, body()))).toBe(403);
    await login('13800000002');
    const other = db.orders.find(o => o.storeId === 'huiju')!;
    expect(await status(api.orders.refund(other.id, body()))).toBe(403);
    expect(await status(api.orders.refund('nope', body()))).toBe(404);
    await login('13800000001');
    const meituan = db.orders.find(o => o.channel === 'meituan')!;
    expect(await api.orders.refund(meituan.id, body({ amountCents: 1 })).catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'refund-channel-unsupported' } });
    expect(await api.orders.refund('o-pending', body({ amountCents: 1 })).catch((e: ApiError) => e)).toMatchObject({ status: 422, data: { code: 'order-not-paid' } });
  });
});

describe('后台 mock：卡种与价格', () => {
  const half = { category: 'period' as const, name: '半年卡', priceCents: 299_900, days: 180, perks: ['每月 1 次老带新'], onSale: true };
  const memberApi = (db: MockDb) => createApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(db) });

  it('列出全部卡种（含下架的），按组和排序排；前台也能看', async () => {
    const { api, login } = setup();
    await login('13800000003');
    const list = await api.products.list();
    expect(list.map(p => p.id)).toEqual(['p-30', 'p-90', 'p-365', 'p-10x', 'p-20x', 'p-summer', 'p-pt5', 'p-class10']);
    expect(list.find(p => p.id === 'p-summer')!.onSale).toBe(false);
  });

  it('新建、改价、改卖点、排序；返回改后的卡种，列表跟着变', async () => {
    const { api, login } = setup();
    await login('13800000002');
    const made = await api.products.create(half);
    expect(made).toMatchObject({ ...half, sort: 9 });
    const changed = await api.products.update(made.id, { priceCents: 279_900, perks: ['送一节体验课'], sort: 0 });
    expect(changed).toMatchObject({ priceCents: 279_900, perks: ['送一节体验课'], days: 180 });
    expect((await api.products.list()).filter(p => p.category === 'period').map(p => p.id)).toEqual([made.id, 'p-30', 'p-90', 'p-365']);
  });

  it('改价、改名只影响以后的订单：已有订单和卡用下单时的，新订单按新价', async () => {
    const { api, login } = setup();
    await login('13800000002');
    const order = (requestId: string, amountCents: number) =>
      api.orders.create({ requestId, memberId: 'm-old-5', productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash', amountCents, priceReason: '' });
    const first = await order('r1', 128_000);
    await api.products.update('p-10x', { priceCents: 138_000, name: '十次卡' });
    const detail = await api.members.get('m-old-5');
    expect(detail.recentOrders.find(o => o.id === first.order.id)).toMatchObject({ productName: '10 次卡', amountCents: 128_000 });
    expect(detail.cards.find(c => c.id === first.card.id)).toMatchObject({ name: '10 次卡', total: 10, expiresOn: first.card.expiresOn });
    // 按旧价收要写原因（低于新标价），按新价不用
    expect(await status(order('r2', 128_000))).toBe(400);
    const second = await order('r3', 138_000);
    expect(second.order).toMatchObject({ productName: '十次卡', amountCents: 138_000 });
  });

  it('下架的在小程序 GET /products 里消失、前台开不了卡；重新上架又能买', async () => {
    const { api, login, db } = setup();
    const mp = memberApi(db);
    expect((await mp.products.list()).map(p => p.id)).not.toContain('p-summer');
    expect((await mp.products.list()).map(p => p.id)).toContain('p-10x');
    await login('13800000001');
    await api.products.update('p-10x', { onSale: false });
    expect((await mp.products.list()).map(p => p.id)).not.toContain('p-10x');
    const body = { requestId: 'r1', memberId: 'm-old-5', productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash' as const, amountCents: 128_000, priceReason: '' };
    const err = await api.orders.create(body).catch((e: ApiError) => e);
    expect(err).toMatchObject({ status: 422, data: { code: 'product-off-sale' } });
    await api.products.update('p-10x', { onSale: true });
    expect((await api.orders.create(body)).card.kind).toBe('count');
  });

  it('前台不能新建、不能改；改价按 product.price；没有的 404', async () => {
    const { api, login } = setup();
    await login('13800000003');
    expect(await status(api.products.create(half))).toBe(403);
    expect(await status(api.products.update('p-30', { priceCents: 1 }))).toBe(403);
    expect(await status(api.products.update('p-30', { onSale: false }))).toBe(403);
    await login('13800000002');
    expect(await status(api.products.update('nope', { onSale: false }))).toBe(404);
  });

  it('填得不对 400：品类和规格不能改、在售的不能重名、标价不对', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const bad = (p: Promise<unknown>) => p.then(() => null, (e: ApiError) => (e.data as { field?: string }).field);
    expect(await bad(api.products.update('p-30', { days: 31 } as never))).toBe('days');
    expect(await bad(api.products.update('p-90', { name: '月卡' }))).toBe('name');
    expect(await bad(api.products.update('p-30', { priceCents: 0 }))).toBe('priceCents');
    expect(await bad(api.products.create({ ...half, name: '季卡' }))).toBe('name');
    expect(await bad(api.products.create({ ...half, days: undefined }))).toBe('days');
  });
});

describe('后台 mock：入场记录', () => {
  it('按日期、门店列出，后入场的在前；带会员名、卡、扣次、方式、保单', async () => {
    const { api, login, db } = setup();
    await login('13800000003');
    const m = await api.members.create({ phone: '13912345678', name: '来爬的人', source: 'walkin', storeId: 'bingang' });
    const { card } = await api.orders.create({ requestId: 'o1', memberId: m.id, productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash', amountCents: 128_000, priceReason: '' });
    const first = await api.checkIns.create({ requestId: 'c1', memberId: m.id, storeId: 'bingang', cardId: card.id });
    const again = await api.checkIns.create({ requestId: 'c2', memberId: m.id, storeId: 'bingang', cardId: card.id });

    const list = await api.checkIns.list({ date: '2026-10-21', store: 'bingang' });
    expect(list).toMatchObject({ storeId: 'bingang', date: '2026-10-21' });
    expect(list.items.slice(0, 2).map(r => r.id)).toEqual([again.checkIn.id, first.checkIn.id]);
    expect(list.items[1]).toMatchObject({ memberId: m.id, memberName: '来爬的人', cardName: '10 次卡', deducted: 1, method: 'desk', voided: false, insurance: { policyId: first.insurance.policyId, status: 'pending' } });
    // 同日再次入场沿用当天那张保单
    expect(list.items[0]).toMatchObject({ deducted: 0, insurance: { policyId: first.insurance.policyId } });
    expect(list.items.every(r => r.on === '2026-10-21' && r.storeId === 'bingang')).toBe(true);
    const expected = db.checkIns.filter(c => c.on === '2026-10-21' && c.storeId === 'bingang').length;
    expect(list.items).toHaveLength(expected);
    // 不带日期是今天
    expect((await api.checkIns.list({ store: 'bingang' })).items).toHaveLength(expected);
  });

  it('门店：只管部分门店的必须带自己的店；能看全部的不带就是全部门店', async () => {
    const { api, login, db } = setup();
    await login('13800000003');
    expect(await status(api.checkIns.list({ date: '2026-10-21' }))).toBe(403);
    expect(await status(api.checkIns.list({ date: '2026-10-21', store: 'huiju' }))).toBe(403);
    expect(await status(api.checkIns.list({ date: '2026-10-21', store: 'nope' }))).toBe(404);
    expect(await status(api.checkIns.list({ date: '2026-02-30', store: 'bingang' }))).toBe(400);
    await login('13800000001');
    // 找一天有两家店以上入场的
    const day = db.checkIns.find(c => db.checkIns.some(o => o.on === c.on && o.storeId !== c.storeId))!.on;
    const all = await api.checkIns.list({ date: day });
    expect(all.storeId).toBeNull();
    expect(new Set(all.items.map(r => r.storeId)).size).toBeGreaterThan(1);
    expect(all.items).toHaveLength(db.checkIns.filter(c => c.on === day).length);
  });

  it('示例数据：每条入场都有保单，以前的已投保；撤销的那条有标记，保单已退保', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const voided = db.checkIns.find(c => c.voided)!;
    const row = (await api.checkIns.list({ date: voided.on })).items.find(r => r.id === voided.id)!;
    expect(row).toMatchObject({ voided: true, voidInfo: { reason: '扫错了卡' }, insurance: { status: 'refunded' } });
    expect(db.checkIns.every(c => c.policyId)).toBe(true);
    const past = db.checkIns.find(c => !c.voided && c.on < '2026-10-21')!;
    expect((await api.checkIns.list({ date: past.on })).items.find(r => r.id === past.id)!.insurance).toMatchObject({ status: 'insured' });
  });

  it('在列表里撤销走撤销入场接口（前台也能），撤完列表里有标记，保单待退保', async () => {
    const { api, login } = setup();
    await login('13800000003');
    const m = await api.members.create({ phone: '13912345678', name: '扫错的人', source: 'walkin', storeId: 'bingang' });
    const { card } = await api.orders.create({ requestId: 'o1', memberId: m.id, productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash', amountCents: 128_000, priceReason: '' });
    const ci = await api.checkIns.create({ requestId: 'c1', memberId: m.id, storeId: 'bingang', cardId: card.id });
    await api.checkIns.void(ci.checkIn.id, { reason: '扫错了卡' });
    const row = (await api.checkIns.list({ store: 'bingang' })).items.find(r => r.id === ci.checkIn.id)!;
    expect(row).toMatchObject({ voided: true, voidInfo: { byName: '前台小葵', reason: '扫错了卡' }, insurance: { status: 'refund_pending' } });
  });
});

describe('后台 mock：分享记录', () => {
  it('次卡转赠和老带新都列出来，最近发的在前；示例数据里的送出、领取、入场流水对得上', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const { storeId, items } = await api.shares();
    expect(storeId).toBeNull();
    expect(items).toHaveLength(db.shares.length + db.referrals.length);
    expect(items.map(r => r.createdOn)).toEqual([...items.map(r => r.createdOn)].sort().reverse());
    const counts = items.filter(r => r.kind === 'count');
    expect(counts.map(r => r.state).sort()).toEqual(['claimed', 'pending', 'used']);
    expect(counts.find(r => r.state === 'pending')).toMatchObject({ createdOn: '2026-10-21', claimerId: null, claimerName: null, quantity: 2 });
    expect(counts.find(r => r.state === 'used')!.usedOn).toBeTruthy();
    expect(items.some(r => r.kind === 'referral' && r.state === 'used' && r.usedOn)).toBe(true);
    expect(items[0]).not.toHaveProperty('token');
    for (const sh of db.shares) {
      expect(ledgerMismatch(db.cards.find(c => c.memberId === sh.fromMemberId && c.kind === 'count')!, db.ledger)).toBeNull();
      const gift = db.cards.find(c => c.kind === 'gift' && c.shareId === sh.id);
      if (gift) expect(ledgerMismatch(gift, db.ledger)).toBeNull();
    }
  });

  it('状态由数据推导：过了 expiresOn 没人领是过期，到期当天还算等朋友领取', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const from = db.members.find(m => m.id.startsWith('m-old-'))!.id;
    db.referrals = [
      { id: 'r-a', fromMemberId: from, createdOn: '2026-09-10', expiresOn: '2026-09-30', claimedByMemberId: null, usedOn: null },
      { id: 'r-b', fromMemberId: from, createdOn: '2026-10-01', expiresOn: '2026-10-21', claimedByMemberId: null, usedOn: null },
      { id: 'r-c', fromMemberId: from, createdOn: '2026-09-12', expiresOn: '2026-09-30', claimedByMemberId: 'm-walkin-0', usedOn: null },
    ];
    const rows = (await api.shares({ kind: 'referral' })).items;
    expect(rows.map(r => [r.id, r.state])).toEqual([['r-b', 'pending'], ['r-c', 'claimed'], ['r-a', 'expired']]);
    expect(rows.every(r => r.kind === 'referral')).toBe(true);
    expect((await api.shares({ kind: 'count' })).items.every(r => r.kind === 'count')).toBe(true);
    expect(await status(api.shares({ kind: 'gift' as never }))).toBe(400);
  });

  it('朋友用送的次卡入场变 used，撤销那次入场变回领了还没来', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const used = (await api.shares({ kind: 'count' })).items.find(r => r.state === 'used')!;
    const gift = db.cards.find(c => c.kind === 'gift' && c.shareId === used.id)!;
    const ci = db.checkIns.find(c => c.cardId === gift.id)!;
    await api.checkIns.void(ci.id, { reason: '登记错了' });
    expect((await api.shares({ kind: 'count' })).items.find(r => r.id === used.id)).toMatchObject({ state: 'claimed', usedOn: null });

    const claimed = (await api.shares({ kind: 'count' })).items.find(r => r.state === 'claimed' && r.id !== used.id)!;
    const card = db.cards.find(c => c.kind === 'gift' && c.shareId === claimed.id)!;
    await api.checkIns.create({ requestId: 'g1', memberId: card.memberId, storeId: db.members.find(m => m.id === card.memberId)!.homeStoreId, cardId: card.id });
    expect((await api.shares({ kind: 'count' })).items.find(r => r.id === claimed.id)).toMatchObject({ state: 'used', usedOn: '2026-10-21' });
  });

  it('按发起人的归属门店过滤；只管部分门店的必须带自己的店', async () => {
    const { api, login, db } = setup();
    await login('13800000003');
    expect(await status(api.shares())).toBe(403);
    expect(await status(api.shares({ store: 'huiju' }))).toBe(403);
    expect(await status(api.shares({ store: 'nope' }))).toBe(404);
    const mine = await api.shares({ store: 'bingang' });
    expect(mine.items.length).toBeGreaterThan(0);
    const home = (id: string) => db.members.find(m => m.id === id)!.homeStoreId;
    expect(mine.items.every(r => r.storeId === 'bingang' && home(r.fromMemberId) === 'bingang')).toBe(true);
  });
});

describe('后台 mock：员工账号', () => {
  const body = (over: Partial<CreateStaffBody> = {}): CreateStaffBody => ({ phone: '13900000009', name: '前台小新', role: 'desk', allStores: false, storeIds: ['huiju'], password: 'abc123', ...over });

  it('只有馆长能管员工', async () => {
    const { api, login } = setup();
    for (const phone of ['13800000002', '13800000003']) {
      await login(phone);
      expect(await status(api.staff.list())).toBe(403);
      expect(await status(api.staff.create(body()))).toBe(403);
      expect(await status(api.staff.update('s-desk', { name: 'x' }))).toBe(403);
    }
  });

  it('新建的能用初始密码登录；列表不带密码，内存里只有哈希；写一条操作日志', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const made = await api.staff.create(body({ phone: '139 0000 0009' }));
    expect(made).toMatchObject({ phone: '13900000009', name: '前台小新', role: 'desk', storeIds: ['huiju'], active: true });
    const list = await api.staff.list();
    expect(list.map(s => s.id)).toContain(made.id);
    expect(JSON.stringify(list)).not.toMatch(/password|abc123|123456|tokenVersion/);
    expect(JSON.stringify(db.staff)).not.toContain('abc123');
    expect(db.auditLogs).toEqual([
      expect.objectContaining({ staffId: 's-owner', action: 'staff.create', targetType: 'staff', targetId: made.id, before: null, after: { phone: '13900000009', name: '前台小新', role: 'desk', storeIds: ['huiju'], active: true } }),
    ]);
    const other = createAdminApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(db) });
    expect((await other.auth.login({ phone: '13900000009', password: 'abc123' })).staff.id).toBe(made.id);
    expect(await status(other.auth.login({ phone: '13900000009', password: '123456' }))).toBe(401);
  });

  it('手机号唯一（停用的也算）；门店至少一家且要存在，全部门店存成空数组', async () => {
    const { api, login } = setup();
    await login('13800000001');
    const field = (p: Promise<unknown>) => p.then(() => null, (e: ApiError) => [e.status, (e.data as { field?: string }).field]);
    expect(await field(api.staff.create(body({ phone: '13800000003' })))).toEqual([400, 'phone']);
    expect(await field(api.staff.create(body({ storeIds: [] })))).toEqual([400, 'storeIds']);
    expect(await field(api.staff.create(body({ storeIds: ['nope'] })))).toEqual([400, 'storeIds']);
    expect(await field(api.staff.create(body({ password: '1' })))).toEqual([400, 'password']);
    expect((await api.staff.create(body({ allStores: true, storeIds: ['huiju'] }))).storeIds).toEqual([]);
    await api.staff.update('s-desk', { active: false });
    expect(await field(api.staff.create(body({ phone: '13800000003' })))).toEqual([400, 'phone']);
    expect(await field(api.staff.update('s-manager', { phone: '13800000003' }))).toEqual([400, 'phone']);
    expect(await field(api.staff.update('s-manager', { storeIds: [] }))).toEqual([400, 'storeIds']);
    expect(await status(api.staff.update('nope', { name: 'x' }))).toBe(404);
  });

  it('停用后登录失败，已登录的 token 立即失效；重新启用后能登录', async () => {
    const { api, login, db } = setup();
    let deskToken: string | null = null;
    const desk = createAdminApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(db), getToken: () => deskToken });
    deskToken = (await desk.auth.login({ phone: '13800000003', password: '123456' })).token;
    expect((await desk.auth.me()).id).toBe('s-desk');
    await login('13800000001');
    expect(await api.staff.update('s-desk', { active: false })).toMatchObject({ active: false });
    expect(await status(desk.auth.me())).toBe(401);
    expect(await status(desk.auth.login({ phone: '13800000003', password: '123456' }))).toBe(403);
    await api.staff.update('s-desk', { active: true });
    expect(await status(desk.auth.me())).toBe(401);
    deskToken = (await desk.auth.login({ phone: '13800000003', password: '123456' })).token;
    expect((await desk.auth.me()).id).toBe('s-desk');
    expect(db.auditLogs.map(l => [l.action, l.before, l.after])).toEqual([
      ['staff.update', { active: true }, { active: false }],
      ['staff.update', { active: false }, { active: true }],
    ]);
  });

  it('重置密码后旧密码不能登录、旧 token 失效；日志不记密码', async () => {
    const { api, login, db } = setup();
    let deskToken: string | null = null;
    const desk = createAdminApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(db), getToken: () => deskToken });
    deskToken = (await desk.auth.login({ phone: '13800000003', password: '123456' })).token;
    await login('13800000001');
    await api.staff.update('s-desk', { password: 'newpass1' });
    expect(await status(desk.auth.me())).toBe(401);
    expect(await status(desk.auth.login({ phone: '13800000003', password: '123456' }))).toBe(401);
    expect((await desk.auth.login({ phone: '13800000003', password: 'newpass1' })).staff.id).toBe('s-desk');
    expect(db.auditLogs).toEqual([expect.objectContaining({ action: 'staff.password_reset', targetId: 's-desk', before: null, after: null })]);
    expect(JSON.stringify(db.auditLogs)).not.toContain('newpass1');
  });

  it('改角色、门店马上生效，日志只记改了的字段', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    await api.staff.update('s-desk', { role: 'manager', allStores: false, storeIds: ['bingang', 'huiju'], name: '前台小葵' });
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'staff.update', before: { role: 'desk', storeIds: ['bingang'] }, after: { role: 'manager', storeIds: ['bingang', 'huiju'] } });
    await login('13800000003');
    expect(await api.auth.me()).toMatchObject({ role: 'manager', storeIds: ['bingang', 'huiju'] });
  });

  it('不能停用、降级自己；至少留一个在用的馆长', async () => {
    const { api, login, db } = setup();
    await login('13800000001');
    const code = (p: Promise<unknown>) => p.then(() => null, (e: ApiError) => [e.status, (e.data as { code?: string }).code]);
    expect(await code(api.staff.update('s-owner', { active: false }))).toEqual([422, 'staff-self-deactivate']);
    expect(await code(api.staff.update('s-owner', { role: 'manager' }))).toEqual([422, 'staff-self-demote']);
    // 再来一个馆长，可以停用他、降级他；自己还是不行
    const boss2 = await api.staff.create(body({ phone: '13900000010', name: '二老板', role: 'owner', allStores: true }));
    expect(await api.staff.update(boss2.id, { role: 'manager' })).toMatchObject({ role: 'manager' });
    expect(await api.staff.update(boss2.id, { active: false })).toMatchObject({ active: false });
    expect(await code(api.staff.update('s-owner', { active: false }))).toEqual([422, 'staff-self-deactivate']);
    expect(db.staff.find(s => s.id === 's-owner')).toMatchObject({ active: true, role: 'owner' });
    // 改自己的名字、门店可以
    expect(await api.staff.update('s-owner', { name: '老板' })).toMatchObject({ name: '老板' });
  });
});

describe('后台 mock：操作日志', () => {
  /** 前台给新会员开一张 10 次卡（实收改价）、登记入场，返回各自的结果 */
  async function deskOps() {
    const s = setup();
    await s.login('13800000003');
    const m = await s.api.members.create({ phone: '13912345678', name: '日志测试', source: 'walkin', storeId: 'bingang' });
    const order = await s.api.orders.create({ requestId: 'o1', memberId: m.id, productId: 'p-10x', storeId: 'bingang', channel: 'desk_cash', amountCents: 120_000, priceReason: '老会员介绍' });
    const ci = await s.api.checkIns.create({ requestId: 'c1', memberId: m.id, storeId: 'bingang', cardId: order.card.id });
    return { ...s, m, order, ci };
  }
  const logsOf = (db: MockDb, action: string) => db.auditLogs.filter(l => l.action === action);

  it('14 线下收款开卡：谁、哪家店、改价原因、标价和实收', async () => {
    const { db, order, m } = await deskOps();
    expect(logsOf(db, 'order.create')).toEqual([
      expect.objectContaining({
        staffId: 's-desk', targetType: 'order', targetId: order.order.id, storeId: 'bingang', reason: '老会员介绍', before: null,
        after: expect.objectContaining({ memberId: m.id, productId: 'p-10x', listPriceCents: 128_000, amountCents: 120_000, channel: 'desk_cash', cardId: order.card.id }),
      }),
    ]);
    expect(logsOf(db, 'order.create')[0]!.at).toMatch(/^2026-10-21T/);
  });

  it('15 前台登记入场：卡、扣次、保单', async () => {
    const { db, ci, order } = await deskOps();
    expect(logsOf(db, 'check_in.create')).toEqual([
      expect.objectContaining({ staffId: 's-desk', targetType: 'check_in', targetId: ci.checkIn.id, storeId: 'bingang', after: expect.objectContaining({ cardId: order.card.id, deducted: 1, remaining: 9, policyId: ci.insurance.policyId }) }),
    ]);
  });

  it('16 撤销入场：原因，改前改后的次数和保单；重复撤销不再记', async () => {
    const { api, db, ci } = await deskOps();
    await api.checkIns.void(ci.checkIn.id, { reason: '扫错了卡' });
    await api.checkIns.void(ci.checkIn.id, { reason: '又点了一次' });
    const logs = logsOf(db, 'check_in.void');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      staffId: 's-desk', targetId: ci.checkIn.id, storeId: 'bingang', reason: '扫错了卡',
      before: { voided: false, deducted: 1, card: { remaining: 9 }, policy: { status: 'pending' } },
      after: { voided: true, restored: 1, card: { remaining: 10 }, policy: { status: 'refund_pending' } },
    });
  });

  it('17 调整次数、有效期：只记改了的字段，带原因；门店按会员的归属门店', async () => {
    const { api, db, login, order } = await deskOps();
    await login('13800000002');
    await api.cards.adjust(order.card.id, { remaining: 12, reason: '补偿闭馆' });
    expect(logsOf(db, 'card.adjust')).toEqual([
      expect.objectContaining({ staffId: 's-manager', targetType: 'card', targetId: order.card.id, storeId: 'bingang', reason: '补偿闭馆', before: { remaining: 9, total: 10 }, after: { remaining: 12, total: 12 } }),
    ]);
  });

  it('17 冻结、解冻：状态、冻结日期、到期日改前改后', async () => {
    const { api, db, login } = setup();
    await login('13800000001');
    const card = db.cards.find(c => c.kind === 'period' && c.startsOn <= '2026-10-21' && c.expiresOn > '2026-11-30' && (c.status ?? 'normal') === 'normal')!;
    const { rules } = await api.cards.freezeOptions(card.id);
    await api.cards.freeze(card.id, { days: rules.minDays, note: '出差' });
    await api.cards.unfreeze(card.id, { note: '提前回来' });
    const store = db.members.find(m => m.id === card.memberId)!.homeStoreId;
    expect(logsOf(db, 'card.freeze')[0]).toMatchObject({ staffId: 's-owner', targetId: card.id, storeId: store, reason: '出差', before: { status: 'normal' }, after: { status: 'frozen', frozenFrom: '2026-10-21' } });
    expect(logsOf(db, 'card.unfreeze')[0]).toMatchObject({ targetId: card.id, reason: '提前回来', before: { status: 'frozen' }, after: { status: 'normal' } });
  });

  it('18 退款：金额、方式、原因，订单和卡改前改后', async () => {
    const { api, db, login, order } = await deskOps();
    await login('13800000002');
    await api.orders.refund(order.order.id, { requestId: 'rf1', amountCents: 50_000, reason: '搬家了' });
    expect(logsOf(db, 'order.refund')).toEqual([
      expect.objectContaining({
        staffId: 's-manager', targetType: 'order', targetId: order.order.id, storeId: 'bingang', reason: '搬家了',
        before: expect.objectContaining({ refundedCents: 0, status: 'paid', card: expect.objectContaining({ status: 'normal', remaining: 9 }) }),
        after: expect.objectContaining({ refundedCents: 50_000, status: 'partially_refunded', refund: expect.objectContaining({ amountCents: 50_000, method: 'offline', status: 'succeeded' }), card: expect.objectContaining({ status: 'refunded', remaining: 0 }) }),
      }),
    ]);
  });

  it('19 新建卡种、改价、上下架：全馆的（门店为空），只记改了的字段', async () => {
    const { api, db, login } = setup();
    await login('13800000002');
    const made = await api.products.create({ category: 'period', name: '半年卡', priceCents: 299_900, days: 180, perks: [], onSale: true });
    await api.products.update('p-30', { priceCents: 49_900, name: '月卡' });
    await api.products.update('p-30', { onSale: false });
    expect(logsOf(db, 'product.create')[0]).toMatchObject({ staffId: 's-manager', targetId: made.id, storeId: null, before: null, after: { name: '半年卡', priceCents: 299_900 } });
    expect(logsOf(db, 'product.update').map(l => [l.targetId, l.storeId, l.before, l.after])).toEqual([
      ['p-30', null, { priceCents: 59_900 }, { priceCents: 49_900 }],
      ['p-30', null, { onSale: true }, { onSale: false }],
    ]);
  });

  it('查询：最新的在前，带员工名；按门店、操作类型筛', async () => {
    const { api, login } = await deskOps();
    await login('13800000001');
    await api.products.update('p-30', { priceCents: 49_900 });
    const all = await api.auditLogs();
    expect(all.items.map(l => l.action)).toEqual(['product.update', 'check_in.create', 'order.create']);
    expect(all.items[1]).toMatchObject({ staffName: '前台小葵' });
    expect((await api.auditLogs({ store: 'bingang' })).items.map(l => l.action)).toEqual(['check_in.create', 'order.create']);
    expect((await api.auditLogs({ store: 'huiju' })).items).toEqual([]);
    expect((await api.auditLogs({ action: 'order.create' })).total).toBe(1);
    expect(await status(api.auditLogs({ action: 'nope' as never }))).toBe(400);
    expect(await status(api.auditLogs({ store: 'nope' }))).toBe(404);
  });

  it('按员工能看的门店过滤：前台看不了；店长只能按自己的店查，看不到全馆的', async () => {
    const { api, login } = await deskOps();
    await login('13800000002');
    await api.products.update('p-30', { priceCents: 49_900 });
    expect(await status(api.auditLogs())).toBe(403);
    expect(await status(api.auditLogs({ store: 'huiju' }))).toBe(403);
    const mine = await api.auditLogs({ store: 'bingang' });
    expect(mine.items.every(l => l.storeId === 'bingang')).toBe(true);
    expect(mine.items.some(l => l.action === 'product.update')).toBe(false);
    await login('13800000003');
    expect(await status(api.auditLogs({ store: 'bingang' }))).toBe(403);
  });

  it('只读：改、删都 405，日志不变；员工变更的日志不记密码', async () => {
    const { api, db, login } = setup();
    await login('13800000001');
    await api.staff.create({ phone: '13900000009', name: '新人', role: 'desk', allStores: false, storeIds: ['bingang'], password: 'secret99' });
    await api.staff.update('s-desk', { password: 'another99' });
    const before = structuredClone(db.auditLogs);
    const adapter = createMockAdapter(db);
    const token = (await api.auth.login({ phone: '13800000001', password: '123456' })).token;
    const id = db.auditLogs[0]!.id;
    for (const [method, url] of [['DELETE', `/admin/audit-logs/${id}`], ['PATCH', `/admin/audit-logs/${id}`], ['POST', '/admin/audit-logs'], ['PUT', `/admin/audit-logs/${id}`]] as const) {
      const res = await adapter({ method, url, headers: { Authorization: `Bearer ${token}` }, body: { reason: 'x' } });
      expect(res.status).toBe(405);
    }
    expect(db.auditLogs).toEqual(before);
    // 动作名 staff.password_reset 里有 password，查的是字段和值
    expect(JSON.stringify(db.auditLogs)).not.toMatch(/secret99|another99|"password(Hash)?":|"tokenVersion":/);
    expect(db.auditLogs.map(l => l.action)).toEqual(['staff.create', 'staff.password_reset']);
  });
});
