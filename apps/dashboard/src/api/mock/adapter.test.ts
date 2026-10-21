import { ApiError, createAdminApi } from '@climb/api';
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
  id, source, homeStoreId: store, firstVisitOn, firstVisitStoreId: store, firstCardOn,
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
});
