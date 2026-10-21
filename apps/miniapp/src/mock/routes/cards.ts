import type { CardLedgerItem, FreezeOptions } from '@climb/api';
import {
  freezeBlockedBy, freezePeriodCard, freezeQuotaLeft, settleFreeze, unfreezePeriodCard,
  type Card, type GymRules, type LedgerEntry, type PeriodCard,
} from '@climb/core';
import { addDays, type DateKey } from '@climb/utils';
import type { MockDb } from '../db';
import type { MockContext, MockRoutes } from '../router';

type RecordFn = (card: Card, delta: number, reason: LedgerEntry['reason'], ref?: undefined, extra?: { note?: string; on?: DateKey }) => void;

/** 这个会员以前每次冻结开始的日子（冻结的那张卡的 freeze 流水；后面跟着挪日期的卡记的是 adjust） */
const freezeHistory = (db: MockDb, memberId: string) => {
  const mine = new Set(db.cards.filter(c => c.memberId === memberId).map(c => c.id));
  return db.ledger.filter(l => l.reason === 'freeze' && mine.has(l.cardId)).map(l => l.on);
};

/** 冻结、解冻后，后面接着的期限卡跟着挪了开始日：换掉并记一笔 adjust */
function saveFollowers(followers: PeriodCard[], h: { replaceCard: (c: Card) => void; record: RecordFn }, note: string, on?: DateKey) {
  for (const f of followers) {
    h.replaceCard(f);
    h.record(f, 0, 'adjust', undefined, { note, on });
  }
}

/** 冻满了还没解冻的期限卡自动解冻，流水的日子记恢复能用的那天 */
export function settleFrozenCards(db: MockDb, h: { today: DateKey; replaceCard: (c: Card) => void; record: RecordFn }) {
  for (const card of db.cards) {
    const r = settleFreeze(card, db.cards.filter(c => c.memberId === card.memberId), h.today);
    if (!r) continue;
    const on = addDays((card as PeriodCard).frozenUntil!, 1);
    h.replaceCard(r.card);
    h.record(r.card, 0, 'unfreeze', undefined, { note: `冻满 ${r.days} 天，自动解冻，到期日顺延 ${r.days} 天`, on });
    saveFollowers(r.followers, h, '前一张期限卡解冻，开始日跟着调整', on);
  }
}

/** 卡包、使用记录和自助冻结：`GET /me/cards`、`GET /me/cards/:id/ledger`、`/me/cards/:id/freeze`、`/unfreeze` */
export function createCardRoutes(
  db: MockDb,
  helpers: {
    rules: GymRules;
    today: () => DateKey;
    requireMember: (ctx: MockContext) => string;
    myCard: (memberId: string, cardId: string) => Card;
    replaceCard: (card: Card) => void;
    record: RecordFn;
  },
): MockRoutes {
  const myCards = (me: string) => db.cards.filter(c => c.memberId === me);

  return {
    'GET /me/cards': ctx => {
      const me = helpers.requireMember(ctx);
      return myCards(me);
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

    'GET /me/cards/:id/freeze': (ctx): FreezeOptions => {
      const me = helpers.requireMember(ctx);
      const card = helpers.myCard(me, ctx.params.id);
      const today = helpers.today();
      const rules = helpers.rules.freezeRules;
      const history = freezeHistory(db, me);
      const quota = freezeQuotaLeft(history, today, rules);
      return {
        blockedBy: freezeBlockedBy({ card, history, today, rules }),
        minDays: rules.minDays,
        maxDays: rules.maxDays,
        monthLeft: quota.month,
        yearLeft: quota.year,
      };
    },

    'POST /me/cards/:id/freeze': ctx => {
      const me = helpers.requireMember(ctx);
      const card = helpers.myCard(me, ctx.params.id);
      const { days } = ctx.body as { days: number };
      const r = freezePeriodCard({ card, cards: myCards(me), days, history: freezeHistory(db, me), today: helpers.today(), rules: helpers.rules.freezeRules });
      helpers.replaceCard(r.card);
      helpers.record(r.card, 0, 'freeze', undefined, { note: `冻结 ${days} 天，到 ${r.card.frozenUntil}` });
      saveFollowers(r.followers, helpers, '前一张期限卡冻结，开始日往后挪');
      return r.card;
    },

    'POST /me/cards/:id/unfreeze': ctx => {
      const me = helpers.requireMember(ctx);
      const card = helpers.myCard(me, ctx.params.id);
      const r = unfreezePeriodCard({ card, cards: myCards(me), on: helpers.today() });
      helpers.replaceCard(r.card);
      helpers.record(r.card, 0, 'unfreeze', undefined, { note: `提前解冻，到期日顺延 ${r.days} 天` });
      saveFollowers(r.followers, helpers, '前一张期限卡解冻，开始日跟着调整');
      return r.card;
    },
  };
}
