import type { RequestAdapter } from '@climb/api';
import type { GymRules } from '@climb/core';
import { toDateKey, type DateKey } from '@climb/utils';
import { seedDb, type MockDb } from './db';
import { createRoutes } from './routes';
import { createMockAdapter } from './router';

export { MOCK_MEMBERS, mockToken, seedDb, type MockDb } from './db';

export interface MockOptions {
  rules: GymRules;
  /** 测试里固定日期；默认取当天 */
  today?: () => DateKey;
  db?: MockDb;
}

/**
 * 后端没好之前用的假接口：实现 @climb/api 的契约，数据放在内存里。
 * 返回的 db 可以直接看和改，测试和开发面板（任务 2）会用到。
 */
export function createMock(opts: MockOptions): { adapter: RequestAdapter; db: MockDb } {
  const today = opts.today ?? (() => toDateKey(new Date()));
  const db = opts.db ?? seedDb(today());
  const resolveToken = (token: string) => {
    const id = token.startsWith('mock:') ? token.slice(5) : '';
    return db.members.some(m => m.id === id) ? id : null;
  };
  return { adapter: createMockAdapter(createRoutes(db, { rules: opts.rules, today }), resolveToken), db };
}
