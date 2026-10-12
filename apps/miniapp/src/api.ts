import { createApi, uniAdapter } from '@climb/api';
import gym from '@gym';

/** 小程序里调接口都用这个。后端还没开始写，VITE_API_BASE 先留空。 */
export const api = createApi({
  baseURL: import.meta.env.VITE_API_BASE ?? '',
  gymId: gym.id,
  adapter: uniAdapter(uni),
  getToken: () => uni.getStorageSync('token') || null,
});
