import { createApi, uniAdapter } from '@climb/api';
import gym from '@gym';
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

/** 小程序里调接口都用这个 */
export const api = createApi({
  baseURL,
  gymId: gym.id,
  adapter: mock ? mock.adapter : uniAdapter(uni),
  getToken: () => (mock ? mockToken(mock.currentMember()) : uni.getStorageSync('token') || null),
});
