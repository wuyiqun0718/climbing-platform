import { ApiError, type AdminApi, type Staff } from '@climb/api';
import gym from '@gym';
import { reactive } from 'vue';
import { api, setToken } from './api';

/** localStorage 的最小接口，测试里传假的 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Saved {
  token: string;
  staff: Staff;
}

/**
 * 员工会话：token 和员工信息存在 storage 里，刷新后同步恢复（路由守卫不用等接口），
 * 再在后台用 /admin/auth/me 校验并刷新员工信息。
 * storage 可能不可用（隐私模式、被禁用），读写都包 try/catch，不可用时只在内存里保持登录。
 */
export function createSession(deps: { api: AdminApi; storage: () => KeyValueStorage | null; key: string; onToken?: (t: string | null) => void }) {
  const state = reactive<{ token: string | null; staff: Staff | null }>({ token: null, staff: null });

  const set = (v: Saved | null) => {
    state.token = v?.token ?? null;
    state.staff = v?.staff ?? null;
    deps.onToken?.(state.token);
    try {
      if (v) deps.storage()?.setItem(deps.key, JSON.stringify(v));
      else deps.storage()?.removeItem(deps.key);
    } catch {
      // 存不了就算了，本次打开页面内仍然是登录状态
    }
  };

  const load = (): Saved | null => {
    try {
      const raw = deps.storage()?.getItem(deps.key);
      const v = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
      return v && typeof v.token === 'string' && v.staff ? (v as Saved) : null;
    } catch {
      return null;
    }
  };

  return {
    state,
    get loggedIn() {
      return !!state.token;
    },

    /** 页面打开时调用：从 storage 恢复，然后校验 token。返回校验的 promise，方便测试等待 */
    restore(): Promise<void> {
      const saved = load();
      if (!saved) return Promise.resolve();
      set(saved);
      return deps.api.auth.me().then(
        staff => {
          if (state.token === saved.token) set({ token: saved.token, staff });
        },
        (e: unknown) => {
          // 401 说明 token 失效；断网等其他错误先保留登录，等下次请求再说
          if (e instanceof ApiError && e.status === 401 && state.token === saved.token) set(null);
        },
      );
    },

    async login(phone: string, password: string) {
      const res = await deps.api.auth.login({ phone, password });
      set(res);
      return res.staff;
    },

    logout() {
      set(null);
    },
  };
}

export type Session = ReturnType<typeof createSession>;

const browserStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const session = createSession({ api, storage: browserStorage, key: `climb.dashboard.${gym.id}.session`, onToken: setToken });
session.restore();

/** 登录接口的错误转成给人看的话 */
export function loginErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const msg = (e.data as { message?: unknown } | null)?.message;
    if (typeof msg === 'string' && msg) return msg;
    if (e.status === 401) return '手机号或密码不对';
    if (e.status >= 500) return '服务器出错了，稍后再试';
    return `登录失败（${e.status}）`;
  }
  return '连不上服务器，检查一下网络';
}
