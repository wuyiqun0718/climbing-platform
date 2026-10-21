import type { CardLedgerItem } from '@climb/api';
import type { Card } from '@climb/core';
import type { MockDb } from '../db';
import type { MockContext, MockRoutes } from '../router';

/** 卡包和使用记录：`GET /me/cards`、`GET /me/cards/:id/ledger` */
export function createCardRoutes(
  db: MockDb,
  helpers: { requireMember: (ctx: MockContext) => string; myCard: (memberId: string, cardId: string) => Card },
): MockRoutes {
  return {
    'GET /me/cards': ctx => {
      const me = helpers.requireMember(ctx);
      return db.cards.filter(c => c.memberId === me);
    },

    'GET /me/cards/:id/ledger': (ctx): CardLedgerItem[] => {
      const me = helpers.requireMember(ctx);
      const card = helpers.myCard(me, ctx.params.id);
      // 流水只追加，数组顺序就是发生顺序；最新的在前
      return db.ledger
        .filter(l => l.cardId === card.id)
        .reverse()
        .map(l => {
          if (l.refType !== 'check_in') return l;
          const storeId = db.checkIns.find(c => c.id === l.refId)?.storeId;
          return { ...l, storeName: db.stores.find(s => s.id === storeId)?.name };
        });
    },
  };
}
