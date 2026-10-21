import type { ClaimResult, MyReferrals, ShareView } from '@climb/api';
import {
  claimBlockedBy, claimShare, createReferral, isRepeatClaim, isShareToken, referralRecords, referralStatus, newShareToken, shareDisplayStatus, shareFromCountCard, type Card, type LedgerEntry, type Share,
} from '@climb/core';
import type { DateKey } from '@climb/utils';
import type { MockDb } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

/**
 * mock 用的随机数。后端用 node:crypto 的 randomBytes；H5 和 node 里有 crypto.getRandomValues，
 * 小程序真机的 mock 没有，退回 Math.random（只在开发时用，不能拿到正式环境）。
 */
const randomBytes = (n: number) => {
  const bytes = new Uint8Array(n);
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(bytes);
  return bytes.map(() => Math.floor(Math.random() * 256));
};

/** 次卡转赠和老带新：发起、按 token 查看、领取。规则全在 @climb/core */
export function createShareRoutes(
  db: MockDb,
  h: {
    today: () => DateKey;
    rules: Parameters<typeof createReferral>[0]['rules'];
    nextId: (prefix: string) => string;
    requireMember: (ctx: MockContext) => string;
    myCard: (memberId: string, cardId: string) => Card;
    replaceCard: (card: Card) => void;
    record: (card: Card, delta: number, reason: LedgerEntry['reason'], ref?: { type: 'share'; id: string }) => void;
  },
): MockRoutes {
  /** token 撞了就重新生成（128 位随机数实际不会撞，后端靠唯一索引兜底） */
  const newToken = () => {
    let token = newShareToken(randomBytes);
    while (db.shares.some(s => s.token === token)) token = newShareToken(randomBytes);
    return token;
  };

  const byToken = (token: string) => {
    const share = isShareToken(token) ? db.shares.find(s => s.token === token) : undefined;
    if (!share) throw new MockHttpError(404, 'share-not-found', '这个分享不存在');
    return share;
  };

  const claimedCard = (s: Share) => db.cards.find(c => (c.kind === 'gift' || c.kind === 'referral') && c.shareId === s.id);
  const cardsOf = (memberId: string) => db.cards.filter(c => c.memberId === memberId);

  const view = (s: Share, viewer: string | null): ShareView => {
    const claimedByMe = !!viewer && s.claimedBy === viewer;
    return {
      token: s.token,
      kind: s.kind,
      quantity: s.quantity,
      createdOn: s.createdOn,
      expiresOn: s.expiresOn,
      status: s.status,
      fromName: db.members.find(m => m.id === s.fromMemberId)?.name ?? '',
      mine: s.fromMemberId === viewer,
      display: shareDisplayStatus(s, h.today(), claimedCard(s)),
      claimedByMe,
      blockedBy: claimedByMe ? null : claimBlockedBy({ share: s, claimerId: viewer, claimerCards: viewer ? cardsOf(viewer) : [], today: h.today() }),
    };
  };

  return {
    'POST /shares/count': ctx => {
      const me = h.requireMember(ctx);
      const { cardId, quantity } = ctx.body as { cardId: string; quantity: number };
      const { card, share } = shareFromCountCard({ id: h.nextId('share'), token: newToken(), card: h.myCard(me, cardId), quantity, today: h.today() });
      // 扣次、记流水、存分享：后端在同一个事务里做
      h.replaceCard(card);
      db.shares.push(share);
      h.record(card, -share.quantity!, 'share_out', { type: 'share', id: share.id });
      return share;
    },

    'POST /shares/referral': ctx => {
      const me = h.requireMember(ctx);
      const share = createReferral({ id: h.nextId('share'), token: newToken(), cards: db.cards, sent: db.shares, memberId: me, today: h.today(), rules: h.rules });
      db.shares.push(share);
      return share;
    },

    'GET /me/referrals': (ctx): MyReferrals => {
      const me = h.requireMember(ctx);
      const args = { cards: db.cards, sent: db.shares, memberId: me, today: h.today() };
      const nameOf = (id?: string) => (id ? db.members.find(m => m.id === id)?.name ?? '' : null);
      return {
        status: referralStatus({ ...args, rules: h.rules }),
        records: referralRecords(args).map(r => ({
          token: r.share.token, createdOn: r.share.createdOn, expiresOn: r.share.expiresOn,
          state: r.state, claimerName: nameOf(r.claimerId), usedOn: r.usedOn ?? null,
        })),
      };
    },

    'GET /shares/:token': ctx => view(byToken(ctx.params.token), ctx.memberId),

    'POST /shares/:token/claim': (ctx): ClaimResult => {
      const me = h.requireMember(ctx);
      const share = byToken(ctx.params.token);
      // 重复领：返回第一次领到的卡。后端在同一个事务里锁住分享再判断，并发的第二个请求会走到这里或被 already-claimed 拦下
      const first = isRepeatClaim(share, me) ? claimedCard(share) : undefined;
      if (first) return { share: view(share, me), card: first, again: true };
      const result = claimShare({ share, claimerId: me, claimerCards: cardsOf(me), cardId: h.nextId('card'), today: h.today() });
      db.shares = db.shares.map(s => (s.id === share.id ? result.share : s));
      db.cards.push(result.card);
      // 好友送的次卡记 +N，跟原卡的 share_out -N 对得上；体验券算 1 次
      h.record(result.card, result.card.kind === 'gift' ? result.card.total : 1, 'claim', { type: 'share', id: share.id });
      return { share: view(result.share, me), card: result.card, again: false };
    },
  };
}
