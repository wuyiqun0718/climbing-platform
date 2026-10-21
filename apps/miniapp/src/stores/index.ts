import { ApiError } from '@climb/api';
import { api } from '../api';
import { createMemberStore, type Me } from './member';

/** 当前会员；401（没登录、或者还没验证手机号）当成没登录 */
async function fetchMe(): Promise<Me | null> {
  try {
    return await api.me.get();
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

/** 全局共享的会员状态，页面里 `member.state.cards` 直接用 */
export const member = createMemberStore({
  fetchMe,
  fetchCards: () => api.me.cards(),
});
