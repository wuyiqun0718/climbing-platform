import { createApi, uniAdapter } from '@climb/api';
import gym from '@gym';
import { createAuth, type Session } from './lib/auth';
import { createRunner, withRelogin } from './lib/request';
import { createMock, type MockStorage } from './mock';

const baseURL = import.meta.env.VITE_API_BASE ?? '';

const mockStorage: MockStorage = {
  get: key => uni.getStorageSync(key) || null,
  set: (key, value) => uni.setStorageSync(key, value),
};

/**
 * 后端还没开始写：VITE_API_BASE 留空时走 src/mock 里的假接口，数据存在本地存储里。
 * 登录照样走 /auth，只是 `uni.login` 的 code 换成开发面板里选的微信（默认阿杰的）。
 */
export const mock = baseURL ? null : createMock({ rules: gym.rules, storage: mockStorage });

const SESSION_KEY = 'session';

function wxCode(): Promise<string> {
  if (mock) return Promise.resolve(mock.currentWx());
  return new Promise((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: r => (r.code ? resolve(r.code) : reject(new Error('uni.login 没有返回 code'))),
      fail: reject,
    });
  });
}

/** 小程序里调接口都用这个；401 时静默重新登录再试一次 */
export const api = createApi({
  baseURL,
  gymId: gym.id,
  adapter: withRelogin(mock ? mock.adapter : uniAdapter(uni), () => auth.relogin()),
  getToken: () => auth.token(),
});

/** 登录状态，见 src/lib/auth.ts；页面要登录用 src/lib/use-login.ts 里的 useRequireLogin */
export const auth = createAuth({
  api,
  wxCode,
  load: () => {
    const s = uni.getStorageSync(SESSION_KEY) as Session | '';
    return s && typeof s.token === 'string' ? s : null;
  },
  save: s => (s ? uni.setStorageSync(SESSION_KEY, s) : uni.removeStorageSync(SESSION_KEY)),
});

/** 页面里调接口包一层，统一转圈和中文错误提示：await run(() => api.me.cards(), { loading: '加载中' }) */
export const run = createRunner({
  showLoading: title => uni.showLoading({ title, mask: true }),
  hideLoading: () => uni.hideLoading(),
  toast: title => uni.showToast({ title, icon: 'none', duration: 2500 }),
});
