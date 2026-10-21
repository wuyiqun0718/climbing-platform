import { createApi, uniAdapter } from '@climb/api';
import gym from '@gym';
import { createRunner, withRelogin } from './lib/request';
import { createMock, mockToken, type MockStorage } from './mock';

const baseURL = import.meta.env.VITE_API_BASE ?? '';

const mockStorage: MockStorage = {
  get: key => uni.getStorageSync(key) || null,
  set: (key, value) => uni.setStorageSync(key, value),
};

/**
 * 后端还没开始写：VITE_API_BASE 留空时走 src/mock 里的假接口，数据存在本地存储里。
 * 身份是开发面板里选的示例会员（默认阿杰）；登录做好（任务 7）后再改成走 /auth。
 */
export const mock = baseURL ? null : createMock({ rules: gym.rules, storage: mockStorage });

/**
 * 401 时重新登录，返回新 token。
 * 登录流程（任务 7）还没做：先清掉旧 token，返回 null，让 401 照常报出去。
 */
async function relogin(): Promise<string | null> {
  uni.removeStorageSync('token');
  return null;
}

/** 小程序里调接口都用这个 */
export const api = createApi({
  baseURL,
  gymId: gym.id,
  adapter: withRelogin(mock ? mock.adapter : uniAdapter(uni), relogin),
  getToken: () => (mock ? mockToken(mock.currentMember()) : uni.getStorageSync('token') || null),
});

/** 页面里调接口包一层，统一转圈和中文错误提示：await run(() => api.me.cards(), { loading: '加载中' }) */
export const run = createRunner({
  showLoading: title => uni.showLoading({ title, mask: true }),
  hideLoading: () => uni.hideLoading(),
  toast: title => uni.showToast({ title, icon: 'none', duration: 2500 }),
});
