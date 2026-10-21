import { createApi, uniAdapter } from '@climb/api';
import gym from '@gym';
import { createMock, MOCK_MEMBERS, mockToken } from './mock';

const baseURL = import.meta.env.VITE_API_BASE ?? '';

/** 后端还没开始写：VITE_API_BASE 留空时走 src/mock 里的假接口，默认以阿杰的身份登录 */
const useMock = !baseURL;

/** 小程序里调接口都用这个 */
export const api = createApi({
  baseURL,
  gymId: gym.id,
  adapter: useMock ? createMock({ rules: gym.rules }).adapter : uniAdapter(uni),
  getToken: () => uni.getStorageSync('token') || (useMock ? mockToken(MOCK_MEMBERS.ajie) : null),
});
