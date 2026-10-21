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

function mockAdapter(): RequestAdapter {
  const db = createMockDb(toDateKey(new Date()), gym.rules);
  db.entryQrLink = gym.entryQrLink;
  return createMockAdapter(db, { delayMs: 200 });
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
