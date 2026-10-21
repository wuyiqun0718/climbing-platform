import { endOfMonth, monthOf, type DateKey } from '@climb/utils';
import type { GymRules } from './gym';
import { checkToken, isPeriodActive, RuleError, type RuleErrorCode } from './rules';
import { shareDisplayStatus, type ShareDisplayStatus } from './share';
import type { Card, PeriodCard, ReferralVoucher, Share } from './types';

export type ReferralBlockedBy = Extract<RuleErrorCode, 'no-period-card' | 'referral-card-frozen' | 'referral-quota-used'>;

/** 老带新页顶上的名额：本月能发几个、发了几个、还剩几个；不能发时给原因 */
export interface ReferralStatus {
  perMonth: number;
  used: number;
  left: number;
  blockedBy: ReferralBlockedBy | null;
}

const BLOCKED_TEXT: Record<ReferralBlockedBy, string> = {
  'no-period-card': '只有期限卡会员可以发老带新邀请',
  'referral-card-frozen': '期限卡冻结中，解冻后才能发老带新邀请',
  'referral-quota-used': '本月的老带新名额已经用完',
};

/**
 * 能不能发老带新：今天要有一张正在用、状态正常的期限卡（冻结中的不行，还没开始的续费卡也不行），
 * 本自然月发出的邀请（不管领没领）没超过 GymRules.referralsPerMonth。
 */
export function referralStatus(args: { cards: Card[]; sent: Share[]; memberId: string; today: DateKey; rules: GymRules }): ReferralStatus {
  const { cards, sent, memberId, today, rules } = args;
  const periods = cards.filter((c): c is PeriodCard => c.kind === 'period' && c.memberId === memberId);
  const used = sent.filter(s => s.kind === 'referral' && s.fromMemberId === memberId && monthOf(s.createdOn) === monthOf(today)).length;
  const perMonth = rules.referralsPerMonth;
  const left = Math.max(0, perMonth - used);
  let blockedBy: ReferralBlockedBy | null = null;
  if (!periods.some(c => isPeriodActive(c, today))) {
    const frozen = periods.some(c => c.status === 'frozen' && c.startsOn <= today && c.expiresOn >= today);
    blockedBy = frozen ? 'referral-card-frozen' : 'no-period-card';
  } else if (left <= 0) {
    blockedBy = 'referral-quota-used';
  }
  return { perMonth, used, left: blockedBy ? 0 : left, blockedBy };
}

/** 本月还能发几个老带新邀请；不能发为 0 */
export function referralQuotaLeft(cards: Card[], sent: Share[], memberId: string, today: DateKey, rules: GymRules): number {
  return referralStatus({ cards, sent, memberId, today, rules }).left;
}

/** 发老带新邀请。体验券当月底前有效。token 用 newShareToken 生成 */
export function createReferral(args: { id: string; token: string; cards: Card[]; sent: Share[]; memberId: string; today: DateKey; rules: GymRules }): Share {
  const { blockedBy } = referralStatus(args);
  if (blockedBy) throw new RuleError(blockedBy, BLOCKED_TEXT[blockedBy]);
  const { memberId, today } = args;
  return { id: args.id, kind: 'referral', token: checkToken(args.token), fromMemberId: memberId, createdOn: today, expiresOn: endOfMonth(today), status: 'pending' };
}

/** 已发记录的状态：待领取、已过期、已领取（还没来）、已使用；文字用 SHARE_STATUS_TEXT */
export type ReferralRecordState = ShareDisplayStatus;

export interface ReferralRecord {
  share: Share;
  state: ReferralRecordState;
  claimerId?: string;
  /** 朋友用体验券入场的那天 */
  usedOn?: DateKey;
}

/** 我发过的老带新邀请，最近的在前。用没用过看领取人那张体验券（shareDisplayStatus） */
export function referralRecords(args: { sent: Share[]; cards: Card[]; memberId: string; today: DateKey }): ReferralRecord[] {
  const { sent, cards, memberId, today } = args;
  return sent
    .filter(s => s.kind === 'referral' && s.fromMemberId === memberId)
    .sort((a, b) => (a.createdOn < b.createdOn ? 1 : a.createdOn > b.createdOn ? -1 : 0))
    .map(share => {
      const voucher = cards.find((c): c is ReferralVoucher => c.kind === 'referral' && c.shareId === share.id);
      const state = shareDisplayStatus(share, today, voucher);
      if (state === 'pending' || state === 'expired') return { share, state };
      return { share, state, claimerId: share.claimedBy, ...(voucher?.usedOn ? { usedOn: voucher.usedOn } : {}) };
    });
}
