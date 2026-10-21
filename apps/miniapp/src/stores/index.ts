import { api, mock } from '../api';
import { createMemberStore, type Me } from './member';

/**
 * 当前会员。`GET /me` 还没有（任务 6），先这样凑：
 * - mock：开发面板选的示例会员；告知书一律当没签过（任务 20 在 mock 里记签署）
 * - 真后端：返回 null，当成没登录
 */
async function fetchMe(): Promise<Me | null> {
  if (!mock) return null;
  const id = mock.currentMember();
  const m = mock.db.members.find(x => x.id === id);
  return m ? { id: m.id, name: m.name, waiverSigned: false } : null;
}

/** 全局共享的会员状态，页面里 `member.state.cards` 直接用 */
export const member = createMemberStore({
  fetchMe,
  fetchCards: () => api.me.cards(),
});
