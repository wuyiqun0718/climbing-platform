import { ledgerEntry, type Card, type GymRules, type LedgerEntry } from '@climb/core';
import type { DateKey } from '@climb/utils';
import type { MockDb } from './db';
import { MockHttpError, type MockContext, type MockHandler, type MockRoutes } from './router';
import { createAuthRoutes } from './routes/auth';
import { createCardRoutes, settleFrozenCards } from './routes/cards';
import { createCheckInRoutes } from './routes/checkins';
import { createClassRoutes } from './routes/classes';
import { createInsuranceRoutes } from './routes/insurance';
import { createOrderRoutes } from './routes/orders';
import { createShareRoutes } from './routes/shares';
import { createWaiverRoutes } from './routes/waivers';

/**
 * 按 @climb/api 的契约实现接口。规则全部调 @climb/core，这里只负责存取数据。
 * 新加接口时，先在 packages/api 里加方法，再在这里加同样路径的实现。
 */
export function createRoutes(db: MockDb, env: { rules: GymRules; today: () => DateKey; now: () => Date }): MockRoutes {
  const nextId = (prefix: string) => `${prefix}-${++db.seq}`;

  const requireMember = (ctx: MockContext) => {
    // 微信登录了、还没验证手机号：前端据此跳去验证手机号，而不是重新微信登录
    if (!ctx.memberId && ctx.openid) throw new MockHttpError(401, 'phone-required', '请先验证手机号');
    if (!ctx.memberId) throw new MockHttpError(401, 'unauthorized', '请先登录');
    return ctx.memberId;
  };

  const myCard = (memberId: string, cardId: string) => {
    const card = db.cards.find(c => c.id === cardId && c.memberId === memberId);
    if (!card) throw new MockHttpError(404, 'card-not-found', '没找到这张卡');
    return card;
  };

  const replaceCard = (card: Card) => {
    db.cards = db.cards.map(c => (c.id === card.id ? card : c));
  };

  /** 卡变了就记一笔流水（card 是变化后的卡），跟后端同一个事务里写流水一样；on 不填是今天 */
  const record = (
    card: Card, delta: number, reason: LedgerEntry['reason'],
    ref?: { type: NonNullable<LedgerEntry['refType']>; id: string }, extra: { note?: string; on?: DateKey } = {},
  ) => {
    db.ledger.push(ledgerEntry({ id: nextId('led'), card, delta, reason, on: extra.on ?? env.today(), at: new Date().toISOString(), ref, note: extra.note }));
  };

  const routes: MockRoutes = {
    ...createAuthRoutes(db, { today: env.today, nextId, requireMember }),
    ...createCardRoutes(db, { ...env, requireMember, myCard, replaceCard, record }),
    ...createOrderRoutes(db, { ...env, nextId, requireMember, record }),
    ...createCheckInRoutes(db, { ...env, nextId, requireMember, replaceCard, record }),
    ...createWaiverRoutes(db, { ...env, nextId, requireMember }),
    ...createInsuranceRoutes(db, { ...env, requireMember }),
    ...createShareRoutes(db, { ...env, nextId, requireMember, myCard, replaceCard, record }),
    ...createClassRoutes(db, { ...env, nextId, requireMember, replaceCard, record }),

    'GET /products': () => db.products.filter(p => p.onSale),
    'GET /stores': () => db.stores,
  };

  // 冻满了的期限卡次日自动解冻：后端是每天的定时任务，mock 在每次请求前顺手做
  const settle = (handler: MockHandler): MockHandler => ctx => {
    settleFrozenCards(db, { today: env.today(), replaceCard, record });
    return handler(ctx);
  };
  return Object.fromEntries(Object.entries(routes).map(([key, handler]) => [key, settle(handler)]));
}

