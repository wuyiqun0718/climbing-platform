import { createAdminApi, fetchAdapter, type RequestAdapter } from '@climb/api';
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

export const api = createAdminApi({
  baseURL: base ?? '',
  gymId: gym.id,
  adapter: withUnauthorizedHook(
    usingMock ? createMockAdapter(createMockDb(toDateKey(new Date()), gym.rules), { delayMs: 200 }) : fetchAdapter,
    () => unauthorized(),
  ),
  getToken: () => token,
});
