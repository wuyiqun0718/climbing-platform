import { createAdminApi, fetchAdapter } from '@climb/api';
import { toDateKey } from '@climb/utils';
import gym from '@gym';
import { createMockAdapter } from './mock/adapter';
import { createMockDb } from './mock/db';

/** 设了 VITE_API_BASE 就连真后端，没设就用内存里的 mock（见 docs/tasks-dashboard.md） */
const base = import.meta.env.VITE_API_BASE;
export const usingMock = !base;

let token: string | null = null;
/** 登录后由会话模块设置（任务 2 会改成持久化） */
export const setToken = (t: string | null) => {
  token = t;
};

export const api = createAdminApi({
  baseURL: base ?? '',
  gymId: gym.id,
  adapter: usingMock ? createMockAdapter(createMockDb(toDateKey(new Date())), { delayMs: 200 }) : fetchAdapter,
  getToken: () => token,
});
