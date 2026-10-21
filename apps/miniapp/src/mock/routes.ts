import { applyEntry, claimShare, createReferral, shareFromCountCard, type EntryCard, type EntryContext, type GymRules } from '@climb/core';
import type { DateKey } from '@climb/utils';
import type { MockDb } from './db';
import { MockHttpError, type MockContext, type MockRoutes } from './router';

/**
 * 按 @climb/api 的契约实现接口。规则全部调 @climb/core，这里只负责存取数据。
 * 新加接口时，先在 packages/api 里加方法，再在这里加同样路径的实现。
 */
export function createRoutes(db: MockDb, env: { rules: GymRules; today: () => DateKey }): MockRoutes {
  const nextId = (prefix: string) => `${prefix}-${++db.seq}`;

  const requireMember = (ctx: MockContext) => {
    if (!ctx.memberId) throw new MockHttpError(401, 'unauthorized', '请先登录');
    return ctx.memberId;
  };

  const entryContext = (today: DateKey): EntryContext => ({
    today,
    rules: env.rules,
    hasCheckedIn: (memberId, on) => db.checkIns.some(c => c.memberId === memberId && c.on === on),
  });

  const myCard = (memberId: string, cardId: string) => {
    const card = db.cards.find(c => c.id === cardId && c.memberId === memberId);
    if (!card) throw new MockHttpError(404, 'card-not-found', '没找到这张卡');
    return card;
  };

  const replaceCard = (card: (typeof db.cards)[number]) => {
    db.cards = db.cards.map(c => (c.id === card.id ? card : c));
  };

  return {
    'GET /products': () => db.products.filter(p => p.onSale),

    'GET /me/cards': ctx => {
      const me = requireMember(ctx);
      return db.cards.filter(c => c.memberId === me);
    },

    'POST /check-ins': ctx => {
      const me = requireMember(ctx);
      const { qrToken, cardId } = ctx.body as { qrToken: string; cardId: string };
      // mock 的前台码就是 `store:<门店 id>`；真后端会验签和过期时间（任务 17）
      const store = db.stores.find(s => `store:${s.id}` === qrToken);
      if (!store) throw new MockHttpError(400, 'invalid-qr', '这个码不是本馆的入场码');
      const card = myCard(me, cardId);
      if (card.kind === 'pt' || card.kind === 'class') throw new MockHttpError(409, 'card-not-usable', '课时卡不能用来入场');
      const today = env.today();
      const ctxEntry = entryContext(today);
      const reentry = ctxEntry.hasCheckedIn(me, today);
      const { card: updated, deducted } = applyEntry(card as EntryCard, ctxEntry, reentry);
      replaceCard(updated);
      const checkIn = { id: nextId('ci'), memberId: me, cardId, on: today, deducted, storeId: store.id };
      db.checkIns.push(checkIn);
      return checkIn;
    },

    'POST /shares/count': ctx => {
      const me = requireMember(ctx);
      const { cardId, quantity } = ctx.body as { cardId: string; quantity: number };
      const card = myCard(me, cardId);
      if (card.kind !== 'count') throw new MockHttpError(409, 'card-not-shareable', '只有自己买的次卡可以分给朋友');
      const { card: updated, share } = shareFromCountCard({ id: nextId('share'), card, quantity, today: env.today() });
      replaceCard(updated);
      db.shares.push(share);
      return share;
    },

    'POST /shares/referral': ctx => {
      const me = requireMember(ctx);
      const share = createReferral({ id: nextId('share'), cards: db.cards, sent: db.shares, memberId: me, today: env.today(), rules: env.rules });
      db.shares.push(share);
      return share;
    },

    'GET /shares/:id': ctx => {
      const share = db.shares.find(s => s.id === ctx.params.id);
      if (!share) throw new MockHttpError(404, 'share-not-found', '这个分享不存在');
      return share;
    },

    'POST /shares/:id/claim': ctx => {
      const me = requireMember(ctx);
      const share = db.shares.find(s => s.id === ctx.params.id);
      if (!share) throw new MockHttpError(404, 'share-not-found', '这个分享不存在');
      const result = claimShare({ share, claimerId: me, cardId: nextId('card'), today: env.today() });
      db.shares = db.shares.map(s => (s.id === share.id ? result.share : s));
      db.cards.push(result.card);
      return result;
    },
  };
}

