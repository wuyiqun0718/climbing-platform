import { ApiError, createAdminApi } from '@climb/api';
import { describe, expect, it } from 'vitest';
import { withUnauthorizedHook } from './api';
import { createMockAdapter } from './api/mock/adapter';
import { createMockDb, type MockDb } from './api/mock/db';
import { createSession, loginErrorText, type KeyValueStorage } from './session';

const KEY = 'test.session';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: k => void data.delete(k) };
}

const brokenStorage: KeyValueStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

/** 跟 api/index.ts 一样的接法：session 写 token，api 读 token，401 时回调 */
function setup(opts: { db?: MockDb; storage?: KeyValueStorage } = {}) {
  const db = opts.db ?? createMockDb('2026-10-21');
  const storage = opts.storage ?? memoryStorage();
  let token: string | null = null;
  let unauthorized = 0;
  const api = createAdminApi({
    baseURL: '',
    gymId: 'benchmark',
    adapter: withUnauthorizedHook(createMockAdapter(db), () => unauthorized++),
    getToken: () => token,
  });
  const session = createSession({ api, storage: () => storage, key: KEY, onToken: t => (token = t) });
  return { db, api, storage, session, unauthorizedCount: () => unauthorized };
}

describe('员工会话', () => {
  it('登录后保存 token 和员工，接口带上 token', async () => {
    const { api, session, storage } = setup();
    const staff = await session.login('13800000001', '123456');
    expect(staff.name).toBe('馆长');
    expect(session.loggedIn).toBe(true);
    expect(JSON.parse(storage.getItem(KEY)!)).toMatchObject({ staff: { id: 's-owner' } });
    expect((await api.auth.me()).id).toBe('s-owner');
  });

  it('密码不对：不登录，给出提示，不触发 401 回调', async () => {
    const { session, storage, unauthorizedCount } = setup();
    const err = await session.login('13800000001', 'x').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(loginErrorText(err)).toBe('手机号或密码不对');
    expect(session.loggedIn).toBe(false);
    expect(storage.getItem(KEY)).toBeNull();
    expect(unauthorizedCount()).toBe(0);
  });

  it('停用的账号登录给出停用提示', async () => {
    const db = createMockDb('2026-10-21');
    db.staff.find(s => s.id === 's-desk')!.active = false;
    const { session } = setup({ db });
    expect(loginErrorText(await session.login('13800000003', '123456').catch(e => e))).toContain('停用');
  });

  it('刷新后（新建会话）从 storage 恢复，并用 me 刷新员工信息', async () => {
    const db = createMockDb('2026-10-21');
    const storage = memoryStorage();
    await setup({ db, storage }).session.login('13800000002', '123456');
    db.staff.find(s => s.id === 's-manager')!.name = '店长阿凯（改名）';

    const { session } = setup({ db, storage });
    const checking = session.restore();
    expect(session.loggedIn).toBe(true); // 同步恢复，路由守卫不用等
    expect(session.state.staff?.name).toBe('店长阿凯');
    await checking;
    expect(session.state.staff?.name).toBe('店长阿凯（改名）');
  });

  it('恢复时 token 已失效：清掉会话', async () => {
    const db = createMockDb('2026-10-21');
    const storage = memoryStorage();
    await setup({ db, storage }).session.login('13800000003', '123456');
    db.staff.find(s => s.id === 's-desk')!.active = false;

    const { session, unauthorizedCount } = setup({ db, storage });
    await session.restore();
    expect(session.loggedIn).toBe(false);
    expect(storage.getItem(KEY)).toBeNull();
    expect(unauthorizedCount()).toBe(1);
  });

  it('storage 里是坏数据：当作没登录', async () => {
    const storage = memoryStorage();
    storage.setItem(KEY, '{not json');
    const { session } = setup({ storage });
    await session.restore();
    expect(session.loggedIn).toBe(false);
  });

  it('登录后的请求返回 401 时触发回调', async () => {
    const { api, db, session, unauthorizedCount } = setup();
    await session.login('13800000001', '123456');
    db.staff.find(s => s.id === 's-owner')!.active = false;
    expect(await api.stores.list().catch((e: ApiError) => e.status)).toBe(401);
    expect(unauthorizedCount()).toBe(1);
  });

  it('退出后清掉 token 和 storage', async () => {
    const { api, session, storage } = setup();
    await session.login('13800000001', '123456');
    session.logout();
    expect(session.loggedIn).toBe(false);
    expect(storage.getItem(KEY)).toBeNull();
    expect(await api.auth.me().catch((e: ApiError) => e.status)).toBe(401);
  });

  it('storage 读写都抛错时仍能在内存里登录和退出', async () => {
    const { session } = setup({ storage: brokenStorage });
    await session.restore();
    await session.login('13800000001', '123456');
    expect(session.loggedIn).toBe(true);
    session.logout();
    expect(session.loggedIn).toBe(false);
  });
});

describe('当前门店', () => {
  it('馆长登录后默认全部门店，门店列表有三家', async () => {
    const { session } = setup();
    await session.login('13800000001', '123456');
    expect(session.state.storeId).toBeNull();
    expect(session.state.stores.map(s => s.id)).toEqual(['bingang', 'huiju', 'huanqiu']);
  });

  it('只管一家店的员工登录后选自己的店，切到别的店或全部门店无效', async () => {
    const { session } = setup();
    await session.login('13800000003', '123456');
    expect(session.state.storeId).toBe('bingang');
    session.setStore('huiju');
    session.setStore(null);
    expect(session.state.storeId).toBe('bingang');
  });

  it('选中的门店存在会话里，刷新后还在', async () => {
    const db = createMockDb('2026-10-21');
    const storage = memoryStorage();
    const first = setup({ db, storage }).session;
    await first.login('13800000001', '123456');
    first.setStore('huiju');

    const { session } = setup({ db, storage });
    const checking = session.restore();
    expect(session.state.storeId).toBe('huiju');
    await checking;
    expect(session.state.storeId).toBe('huiju');
  });

  it('刷新时权限变了（门店被收回）：改回能看的店', async () => {
    const db = createMockDb('2026-10-21');
    const storage = memoryStorage();
    const first = setup({ db, storage }).session;
    await first.login('13800000001', '123456');
    first.setStore('huiju');
    db.staff.find(s => s.id === 's-owner')!.storeIds = ['huanqiu'];

    const { session } = setup({ db, storage });
    await session.restore();
    expect(session.state.storeId).toBe('huanqiu');
    expect(session.state.stores.map(s => s.id)).toEqual(['huanqiu']);
  });

  it('退出后换人登录不沿用上一个人选的门店', async () => {
    const { session } = setup();
    await session.login('13800000001', '123456');
    session.setStore('huiju');
    session.logout();
    expect(session.state.stores).toEqual([]);
    await session.login('13800000002', '123456');
    expect(session.state.storeId).toBe('bingang');
  });
});
