import { createAdminApi, createDeskApi, fetchAdapter, type RequestAdapter } from '@climb/api';
import { toDateKey } from '@climb/utils';
import gym from '@gym';
import { createMockAdapter } from './mock/adapter';
import { createMockDb } from './mock/db';

/** 设了 VITE_API_BASE 就连真后端，没设就用内存里的 mock（见 docs/tasks-dashboard.md） */
const base = import.meta.env.VITE_API_BASE;
export const usingMock = !base;

let token: string | null = null;
/** 由会话模块（session.ts）设置 */
export const setToken = (t: string | null) => {
  token = t;
};

let unauthorized: () => void = () => {};
/** 带着 token 的请求返回 401（token 过期、账号停用）时调用，由路由里注册：清会话、回登录页 */
export const onUnauthorized = (cb: () => void) => {
  unauthorized = cb;
};

/** 包一层 adapter：带 token 的请求遇到 401 就通知会话。登录接口本身的 401（密码不对）不算 */
export function withUnauthorizedHook(adapter: RequestAdapter, cb: () => void): RequestAdapter {
  return async req => {
    const res = await adapter(req);
    if (res.status === 401 && req.headers.Authorization) cb();
    return res;
  };
}

/**
 * 走查用的故障开关（只在本地开发时有）：改 window.__climbMock.fault，之后的请求按它出错。
 * network：像断网一样抛 TypeError；server：返回 500 没有说明；empty：GET 列表返回空的；delayMs：再慢这么多毫秒。
 * match 给了就只影响 url 里带它的请求（比如 '/admin/members'），登录请求不受影响。
 */
export interface MockFault {
  mode?: 'network' | 'server' | 'empty' | null;
  delayMs?: number;
  match?: string;
}

/** 列表接口变成空的：数组 → []，分页 → 0 条 */
const emptied = (data: unknown): unknown => {
  if (Array.isArray(data)) return [];
  if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) return { ...data, items: [], total: 0 };
  return data;
};

export function withMockFault(adapter: RequestAdapter, fault: () => MockFault): RequestAdapter {
  return async req => {
    const f = fault();
    if (!f.mode && !f.delayMs) return adapter(req);
    if (req.url.endsWith('/admin/auth/login') || (f.match && !req.url.includes(f.match))) return adapter(req);
    if (f.delayMs) await new Promise(r => setTimeout(r, f.delayMs));
    if (f.mode === 'network') throw new TypeError('Failed to fetch');
    if (f.mode === 'server') return { status: 500, data: null };
    const res = await adapter(req);
    return f.mode === 'empty' && req.method === 'GET' && res.status < 400 ? { ...res, data: emptied(res.data) } : res;
  };
}

function mockAdapter(): RequestAdapter {
  const db = createMockDb(toDateKey(new Date()), gym.rules);
  db.entryQrLink = gym.entryQrLink;
  const adapter = createMockAdapter(db, { delayMs: 200 });
  if (!import.meta.env.DEV) return adapter;
  // 本地开发时挂到 window，走查脚本可以模拟「会员扫平板上的码」（POST /check-ins 带 X-Mock-Member）、断网和出错，打包后没有
  const mock: { db: typeof db; adapter: RequestAdapter; fault: MockFault } = { db, adapter, fault: {} };
  (globalThis as { __climbMock?: unknown }).__climbMock = mock;
  return withMockFault(adapter, () => mock.fault);
}

/** 后台和前台平板共用一个 adapter（mock 时是同一份数据） */
const adapter = usingMock ? mockAdapter() : fetchAdapter;

export const api = createAdminApi({
  baseURL: base ?? '',
  gymId: gym.id,
  adapter: withUnauthorizedHook(adapter, () => unauthorized()),
  getToken: () => token,
});

/** 前台平板绑定门店后拿到的设备 token，存在这台平板上（读写包 try/catch，存不了就每次打开重新绑定） */
const DESK_TOKEN_KEY = 'climb.deskDevice';
type DeskDevice = { token: string; storeId: string; deviceId: string };
let deskMemory: DeskDevice | null = null;
export const deskDevice = {
  get(): DeskDevice | null {
    try {
      const v = JSON.parse(localStorage.getItem(DESK_TOKEN_KEY) ?? 'null');
      if (v && typeof v.token === 'string') return v;
    } catch {
      // 读不了就用内存里的
    }
    return deskMemory;
  },
  set(v: DeskDevice | null) {
    deskMemory = v;
    try {
      if (v) localStorage.setItem(DESK_TOKEN_KEY, JSON.stringify(v));
      else localStorage.removeItem(DESK_TOKEN_KEY);
    } catch {
      // 存不了：这次能用，刷新后要重新绑定
    }
  },
};

/** 前台平板接口：用设备 token，401 不影响员工会话 */
export const deskApi = createDeskApi({ baseURL: base ?? '', gymId: gym.id, adapter, getToken: () => deskDevice.get()?.token });
