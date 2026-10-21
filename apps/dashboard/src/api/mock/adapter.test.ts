import { ApiError, createAdminApi } from '@climb/api';
import { ledgerMismatch } from '@climb/core';
import { addDays } from '@climb/utils';
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
      id, fromMemberId: from, createdOn, claimedByMemberId: by, usedOn,
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
      { id: 'r1', orderId: 'b', amountCents: 64_000, refundedOn: '2026-10-21', reason: '退一半' },
      { id: 'r2', orderId: 'e', amountCents: 9_900, refundedOn: '2026-10-01', reason: '没来' },
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
      { id: 'r1', orderId: 'o11', amountCents: 20_000, refundedOn: '2026-10-15', reason: '' },
      { id: 'r2', orderId: 'o11', amountCents: 10_000, refundedOn: null, reason: '' },
    ];
    await login('13800000003');
    const rows = (await api.members.get('a')).recentOrders;
    expect(rows.map(r => r.id)).toEqual(['o99', 'o11', 'o10', 'o9', 'o8', 'o7', 'o6', 'o5', 'o4', 'o3']);
    expect(rows[1].refundedCents).toBe(20_000);
    expect(rows[2].refundedCents).toBe(0);
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
