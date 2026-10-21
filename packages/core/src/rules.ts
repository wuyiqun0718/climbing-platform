import { addDays, endOfMonth, monthOf, type DateKey } from '@climb/utils';
import type { GymRules } from './gym';
import type { Card, CountCard, EntryCard, GiftCard, PeriodCard, ReferralVoucher, Share } from './types';

export type RuleErrorCode =
  | 'card-not-usable'
  | 'inviter-not-checked-in'
  | 'invalid-quantity'
  | 'not-enough-remaining'
  | 'card-expired'
  | 'own-share'
  | 'already-claimed'
  | 'share-expired'
  | 'referral-quota-used'
  | 'no-period-card'
  | 'waiver-required'
  | 'already-voided'
  | 'reason-required'
  | 'freeze-not-self-service'
  | 'freeze-card-not-active'
  | 'freeze-days-out-of-range'
  | 'freeze-month-quota-used'
  | 'freeze-year-quota-used'
  | 'card-not-frozen'
  | 'freeze-days-invalid'
  | 'card-not-adjustable'
  | 'adjust-invalid'
  | 'adjust-nothing-changed'
  | 'follower-started';

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

/** 扫码入场时，列出卡包里能用来入场的卡。可用的排前面，期限卡优先。冻结、作废、已退款的卡不列。 */
export function entryOptions(cards: Card[], ctx: EntryContext): EntryOption[] {
  const { today } = ctx;
  const opts: EntryOption[] = [];
  for (const card of cards) {
    if ((card.status ?? 'normal') !== 'normal') continue;
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
  const opt = entryOptions([card], ctx)[0];
  if (!opt) throw new RuleError('card-not-usable', '这张卡现在不能用来入场');
  if (!opt.usable) throw new RuleError('inviter-not-checked-in', '邀请人今天还没入场，体验券暂时不能用');
  if (reentry && ctx.rules.sameDayReentryFree) return { card, deducted: 0 };
  if (card.kind === 'referral') return { card: { ...card, usedOn: ctx.today }, deducted: 0 };
  if (card.kind === 'count' || card.kind === 'gift') return { card: { ...card, remaining: card.remaining - 1 }, deducted: 1 };
  return { card, deducted: 0 };
}

/**
 * 快到期、该提醒续费的期限卡：今天到 rules.expiryReminderDays 天后之间到期（含两头）。
 * 同一会员已经有一张更晚到期的期限卡（续过了）就不算。按到期日排序。
 * 等馆方：次卡快到期或快用完要不要也提醒，先只算期限卡（跟原型一样）。
 */
export function expiringPeriodCards(cards: Card[], today: DateKey, rules: GymRules): PeriodCard[] {
  const until = addDays(today, rules.expiryReminderDays);
  const periods = cards.filter((c): c is PeriodCard => c.kind === 'period');
  return periods
    .filter(c => c.expiresOn >= today && c.expiresOn <= until)
    .filter(c => !periods.some(o => o.memberId === c.memberId && o.expiresOn > c.expiresOn))
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id));
}

/**
 * 有效卡：状态正常、没过期、没用完（次卡、课包还有剩余，体验券没用过）。续费买的、还没开始的期限卡也算。
 * 后台会员列表的「有效卡数」和看板的「有效会员」都按这个算。
 */
export function isCardValid(card: Card, today: DateKey): boolean {
  if ((card.status ?? 'normal') !== 'normal' || card.expiresOn < today) return false;
  if (card.kind === 'period') return true;
  if (card.kind === 'referral') return !card.usedOn;
  return card.remaining > 0;
}

/** 本月还能不能发老带新邀请 */
export function referralQuotaLeft(cards: Card[], sent: Share[], memberId: string, today: DateKey, rules: GymRules): number {
  const hasPeriod = cards.some(c => c.kind === 'period' && c.memberId === memberId && isPeriodActive(c, today));
  if (!hasPeriod) return 0;
  const used = sent.filter(s => s.kind === 'referral' && s.fromMemberId === memberId && monthOf(s.createdOn) === monthOf(today)).length;
  return Math.max(0, rules.referralsPerMonth - used);
}

/** 发老带新邀请。体验券当月底前有效。 */
export function createReferral(args: { id: string; cards: Card[]; sent: Share[]; memberId: string; today: DateKey; rules: GymRules }): Share {
  const { cards, sent, memberId, today, rules } = args;
  const hasPeriod = cards.some(c => c.kind === 'period' && c.memberId === memberId && isPeriodActive(c, today));
  if (!hasPeriod) throw new RuleError('no-period-card', '只有期限卡会员可以发老带新邀请');
  if (referralQuotaLeft(cards, sent, memberId, today, rules) <= 0) throw new RuleError('referral-quota-used', '本月的老带新名额已经用完');
  return { id: args.id, kind: 'referral', fromMemberId: memberId, createdOn: today, expiresOn: endOfMonth(today), status: 'pending' };
}

/** 从次卡里拆出几次送给朋友。送出的次数立即从原卡扣除。 */
export function shareFromCountCard(args: { id: string; card: CountCard; quantity: number; today: DateKey }): { card: CountCard; share: Share } {
  const { card, quantity, today } = args;
  if (!Number.isInteger(quantity) || quantity < 1) throw new RuleError('invalid-quantity', '至少送 1 次');
  if (card.expiresOn < today) throw new RuleError('card-expired', '这张次卡已经过期');
  if (quantity > card.remaining) throw new RuleError('not-enough-remaining', `这张卡只剩 ${card.remaining} 次`);
  return {
    card: { ...card, remaining: card.remaining - quantity },
    share: { id: args.id, kind: 'count', fromMemberId: card.memberId, quantity, createdOn: today, expiresOn: card.expiresOn, status: 'pending' },
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
