import { ApiError, createAdminApi } from '@climb/api';
import { describe, expect, it } from 'vitest';
import { createMockAdapter } from './adapter';
import { createMockDb } from './db';

function setup() {
  let token: string | null = null;
  const api = createAdminApi({ baseURL: '', gymId: 'benchmark', adapter: createMockAdapter(createMockDb('2026-10-21')), getToken: () => token });
  const login = async (phone: string) => {
    token = (await api.auth.login({ phone, password: '123456' })).token;
  };
  return { api, login };
}

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
});
