import type { DateKey } from '@climb/utils';
import type { GymRules } from './gym';
import { isShareToken } from './shareToken';
import type { Card, CountCard, EntryCard, GiftCard, PeriodCard, ReferralVoucher, Share } from './types';

export type RuleErrorCode =
  | 'card-not-usable'
  | 'card-not-shareable'
  | 'card-inactive'
  | 'inviter-not-checked-in'
  | 'invalid-quantity'
  | 'not-enough-remaining'
  | 'card-expired'
  | 'own-share'
  | 'already-claimed'
  | 'share-expired'
  | 'referral-quota-used'
  | 'no-period-card'
  | 'referral-card-frozen'
  | 'product-off-sale'
  | 'order-closed'
  | 'order-not-pending'
  | 'order-amount-mismatch'
  | 'freeze-not-self-service'
  | 'freeze-card-not-active'
  | 'freeze-days-out-of-range'
  | 'freeze-month-quota-used'
  | 'freeze-year-quota-used'
  | 'card-not-frozen'
  | 'waiver-required'
  | 'waiver-outdated'
  | 'qr-expired'
  | 'qr-used';

export class RuleError extends Error {
  constructor(public code: RuleErrorCode, message: string) {
    super(message);
    this.name = 'RuleError';
  }
}

/** 卡的状态是不是正常（没冻结、作废、退款）；没填状态的算正常 */
export const isCardNormal = (c: Card) => (c.status ?? 'normal') === 'normal';

/** 期限卡今天能用：状态正常，且今天在有效期内 */
export const isPeriodActive = (c: PeriodCard, today: DateKey) => isCardNormal(c) && c.startsOn <= today && c.expiresOn >= today;

/**
 * 有效卡：状态正常、没过期、没用完（次卡、课包还有剩余，体验券没用过）。续费买的、还没开始的期限卡也算。
 * 和后台（mvp/dashboard）的同名函数一致。
 */
export function isCardValid(card: Card, today: DateKey): boolean {
  if (!isCardNormal(card) || card.expiresOn < today) return false;
  if (card.kind === 'period') return true;
  if (card.kind === 'referral') return !card.usedOn;
  return card.remaining > 0;
}

export interface EntryContext {
  today: DateKey;
  rules: GymRules;
  /** 某个会员今天是否已经入场（用来判断老带新邀请人） */
  hasCheckedIn: (memberId: string, on: DateKey) => boolean;
}

export interface EntryOption {
  card: EntryCard;
  usable: boolean;
  /** 这次入场会扣几次 */
  deducts: number;
  blockedBy?: 'inviter-not-checked-in';
}

/** 扫码入场时，列出卡包里能用来入场的卡。可用的排前面，期限卡优先。 */
export function entryOptions(cards: Card[], ctx: EntryContext): EntryOption[] {
  const { today } = ctx;
  const opts: EntryOption[] = [];
  for (const card of cards) {
    if (!isCardNormal(card)) continue;
    if (card.kind === 'period' && isPeriodActive(card, today)) opts.push({ card, usable: true, deducts: 0 });
    if ((card.kind === 'count' || card.kind === 'gift') && card.remaining > 0 && card.expiresOn >= today) {
      opts.push({ card, usable: true, deducts: 1 });
    }
    if (card.kind === 'referral' && !card.usedOn && card.expiresOn >= today) {
      const ok = !ctx.rules.referralRequiresInviterSameDay || ctx.hasCheckedIn(card.fromMemberId, today);
      opts.push(ok ? { card, usable: true, deducts: 0 } : { card, usable: false, deducts: 0, blockedBy: 'inviter-not-checked-in' });
    }
  }
  const rank = (o: EntryOption) => (o.usable ? 0 : 10) + (o.card.kind === 'period' ? 0 : 1);
  return opts.sort((a, b) => rank(a) - rank(b));
}

/**
 * 用某张卡入场，返回更新后的卡和扣掉的次数。
 * reentry：这个会员今天已经入过场；规则允许时同日再次进出不扣次。
 */
export function applyEntry<C extends EntryCard>(card: C, ctx: EntryContext, reentry = false): { card: C; deducted: number } {
  if (!isCardNormal(card)) throw new RuleError('card-inactive', '这张卡冻结中或已经停用，不能用来入场');
  const opt = entryOptions([card], ctx)[0];
  if (!opt) throw new RuleError('card-not-usable', '这张卡现在不能用来入场');
  if (!opt.usable) throw new RuleError('inviter-not-checked-in', '邀请人今天还没入场，体验券暂时不能用');
  if (reentry && ctx.rules.sameDayReentryFree) return { card, deducted: 0 };
  if (card.kind === 'referral') return { card: { ...card, usedOn: ctx.today }, deducted: 0 };
  if (card.kind === 'count' || card.kind === 'gift') return { card: { ...card, remaining: card.remaining - 1 }, deducted: 1 };
  return { card, deducted: 0 };
}

/** 分享 token 必须是 newShareToken 生成的；转赠和老带新共用 */
export function checkToken(token: string) {
  if (!isShareToken(token)) throw new Error('分享 token 要用 newShareToken 生成');
  return token;
}

/** 这张卡能不能拿来转赠（转赠页列卡、点「送给朋友」前用）；能为 null，不能给原因 */
export function shareBlockedBy(card: Card, today: DateKey): RuleErrorCode | null {
  // 只有自己买的次卡能拆：好友送的次卡不能再转送，期限卡、体验券、课包都不行
  if (card.kind !== 'count') return 'card-not-shareable';
  if (!isCardNormal(card)) return 'card-inactive';
  if (card.expiresOn < today) return 'card-expired';
  if (card.remaining < 1) return 'not-enough-remaining';
  return null;
}

const SHARE_BLOCKED_TEXT: Partial<Record<RuleErrorCode, string>> = {
  'card-not-shareable': '只有自己买的次卡可以分给朋友',
  'card-inactive': '这张卡冻结中或已经停用，不能转赠',
  'card-expired': '这张次卡已经过期',
};

/**
 * 从次卡里拆出几次送给朋友。送出的次数立即从原卡扣除（调用方同一个事务里记 share_out 流水）。
 * 分享的有效期跟原卡一致；token 用 newShareToken 生成。
 */
export function shareFromCountCard(args: { id: string; token: string; card: Card; quantity: number; today: DateKey }): { card: CountCard; share: Share } {
  const { card, quantity, today } = args;
  const blocked = shareBlockedBy(card, today);
  if (blocked && blocked !== 'not-enough-remaining') throw new RuleError(blocked, SHARE_BLOCKED_TEXT[blocked]!);
  const count = card as CountCard;
  if (!Number.isInteger(quantity) || quantity < 1) throw new RuleError('invalid-quantity', '至少送 1 次');
  if (quantity > count.remaining) throw new RuleError('not-enough-remaining', `这张卡只剩 ${count.remaining} 次`);
  return {
    card: { ...count, remaining: count.remaining - quantity },
    share: {
      id: args.id, kind: 'count', token: checkToken(args.token), fromMemberId: count.memberId, fromCardId: count.id,
      quantity, createdOn: today, expiresOn: count.expiresOn, status: 'pending',
    },
  };
}

/** 朋友点开链接领取：次卡变成 GiftCard，老带新变成 ReferralVoucher */
export function claimShare(args: { share: Share; claimerId: string; cardId: string; today: DateKey }): { share: Share; card: GiftCard | ReferralVoucher } {
  const { share, claimerId, cardId, today } = args;
  if (share.fromMemberId === claimerId) throw new RuleError('own-share', '这是你自己发出的，发给朋友让 TA 来领');
  if (share.status !== 'pending') throw new RuleError('already-claimed', '已经被领取了');
  if (share.expiresOn < today) throw new RuleError('share-expired', '这个链接已经过期');
  const claimed: Share = { ...share, status: 'claimed', claimedBy: claimerId };
  const base = { id: cardId, memberId: claimerId, fromMemberId: share.fromMemberId, shareId: share.id, expiresOn: share.expiresOn };
  const card: GiftCard | ReferralVoucher = share.kind === 'count'
    ? { ...base, kind: 'gift', name: '好友送的次卡', total: share.quantity!, remaining: share.quantity! }
    : { ...base, kind: 'referral', name: '老带新体验券' };
  return { share: claimed, card };
}
