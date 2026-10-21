import type { RequestAdapter } from '@climb/api';
import type { GymRules } from '@climb/core';
import { toDateKey, type DateKey } from '@climb/utils';
import { loadCurrentMember, loadDb, MOCK_MEMBERS, saveCurrentMember, saveDb, seedDb, type MockDb, type MockStorage } from './db';
import { createRoutes } from './routes';
import { createMockAdapter } from './router';

export { MOCK_MEMBERS, mockToken, seedDb, type MockDb, type MockStorage } from './db';

export interface MockOptions {
  rules: GymRules;
  /** 测试里固定日期；默认取当天 */
  today?: () => DateKey;
  db?: MockDb;
  /** 给了就从这里读数据，每次改数据的请求后存回去，刷新不丢 */
  storage?: MockStorage;
}

export interface Mock {
  adapter: RequestAdapter;
  db: MockDb;
  /** 当前以哪位示例会员的身份调接口 */
  currentMember(): string;
  switchMember(memberId: string): void;
  /** 数据回到示例数据（不改当前身份） */
  reset(): void;
}

/**
 * 后端没好之前用的假接口：实现 @climb/api 的契约。
 * 返回的 db 可以直接看和改，测试和开发面板会用到。
 */
export function createMock(opts: MockOptions): Mock {
  const today = opts.today ?? (() => toDateKey(new Date()));
  const { storage } = opts;
  const db = opts.db ?? (storage ? loadDb(storage, today()) : seedDb(today()));
  let current: string = storage ? loadCurrentMember(storage, db) : MOCK_MEMBERS.ajie;

  const resolveToken = (token: string) => {
    const id = token.startsWith('mock:') ? token.slice(5) : '';
    return db.members.some(m => m.id === id) ? id : null;
  };
  const inner = createMockAdapter(createRoutes(db, { rules: opts.rules, today }), resolveToken);
  const adapter: RequestAdapter = async req => {
    try {
      return await inner(req);
    } finally {
      if (storage && req.method !== 'GET') saveDb(storage, db);
    }
  };

  return {
    adapter,
    db,
    currentMember: () => current,
    switchMember(memberId) {
      if (!db.members.some(m => m.id === memberId)) throw new Error(`mock 里没有会员 ${memberId}`);
      current = memberId;
      if (storage) saveCurrentMember(storage, memberId);
    },
    reset() {
      // 路由里拿的是同一个 db 对象，所以原地替换内容
      Object.assign(db, seedDb(today()));
      if (storage) saveDb(storage, db);
    },
  };
}
