import { ApiError, type AdminApi, type Staff, type Store } from '@climb/api';
import gym from '@gym';
import { reactive } from 'vue';
import { api, setToken } from './api';
import { resolveStore } from './permissions';

/** localStorage 的最小接口，测试里传假的 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface Saved {
  token: string;
  staff: Staff;
  /** 选中的门店，null 是全部门店；旧数据里没有 */
  storeId?: string | null;
}

/**
 * 员工会话：token 和员工信息存在 storage 里，刷新后同步恢复（路由守卫不用等接口），
 * 再在后台用 /admin/auth/me 校验并刷新员工信息。
 * 顶部选中的门店（storeId，null 是全部门店）也存在会话里，各页面读 state.storeId。
 * storage 可能不可用（隐私模式、被禁用），读写都包 try/catch，不可用时只在内存里保持登录。
 */
export function createSession(deps: { api: AdminApi; storage: () => KeyValueStorage | null; key: string; onToken?: (t: string | null) => void }) {
  const state = reactive<{ token: string | null; staff: Staff | null; stores: Store[]; storeId: string | null }>({
    token: null,
    staff: null,
    stores: [],
    storeId: null,
  });

  const save = () => {
    try {
      if (state.token && state.staff) deps.storage()?.setItem(deps.key, JSON.stringify({ token: state.token, staff: state.staff, storeId: state.storeId } satisfies Saved));
      else deps.storage()?.removeItem(deps.key);
    } catch {
      // 存不了就算了，本次打开页面内仍然是登录状态
    }
  };

  const set = (v: Saved | null) => {
    state.token = v?.token ?? null;
    state.staff = v?.staff ?? null;
    if (!v) state.stores = [];
    state.storeId = v ? resolveStore(v.staff, state.stores, v.storeId) : null;
    deps.onToken?.(state.token);
    save();
  };

  /** 拉门店列表（按员工权限过滤过的），再校正当前门店 */
  const loadStores = async (token: string) => {
    const stores = await deps.api.stores.list();
    if (state.token !== token || !state.staff) return;
    state.stores = stores;
    state.storeId = resolveStore(state.staff, stores, state.storeId);
    save();
  };

  const load = (): Saved | null => {
    try {
      const raw = deps.storage()?.getItem(deps.key);
      const v = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
      if (!v || typeof v.token !== 'string' || !v.staff) return null;
      return { token: v.token, staff: v.staff, storeId: typeof v.storeId === 'string' || v.storeId === null ? v.storeId : undefined };
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
          if (state.token !== saved.token) return;
          set({ token: saved.token, staff, storeId: state.storeId });
          return loadStores(saved.token).catch(() => {});
        },
        (e: unknown) => {
          // 401 说明 token 失效；断网等其他错误先保留登录，等下次请求再说
          if (e instanceof ApiError && e.status === 401 && state.token === saved.token) set(null);
        },
      );
    },

    async login(phone: string, password: string) {
      const res = await deps.api.auth.login({ phone, password });
      // 换了人就不沿用上一个人选的门店
      set({ ...res, storeId: undefined });
      await loadStores(res.token).catch(() => {});
      return res.staff;
    },

    logout() {
      set(null);
    },

    /** 切换门店；没有权限的门店忽略 */
    setStore(storeId: string | null) {
      if (!state.staff) return;
      const next = resolveStore(state.staff, state.stores, storeId);
      if (next !== storeId) return;
      state.storeId = next;
      save();
    },

    /** 门店列表加载失败时可以重试 */
    reloadStores() {
      return state.token ? loadStores(state.token) : Promise.resolve();
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
