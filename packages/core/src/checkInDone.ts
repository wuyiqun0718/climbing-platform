import { isReentry, type CheckInArgs } from './checkIn';
import { POLICY_STATUS_TEXT, type PolicyStatus } from './insurance';
import { entryOptions } from './rules';
import type { EntryCard, ReferralVoucher } from './types';

/**
 * 入场成功页（小程序 pages/checkin/done）：标题、扣了几次、保单状态怎么说；
 * 老带新的领取人被拦下（邀请人今天还没入场）时，等邀请人入场的状态。
 * 扣不扣次、保单投没投在 checkIn.ts、insurance.ts 里定，这里只把结果翻成会员看的话。
 */

export interface CheckInDoneView {
  title: string;
  /** 扣次那一行 */
  deductText: string;
  /** 当日保险那一行：状态 + 说明 */
  policyText: string;
  policyNote: string;
}

const POLICY_NOTE: Record<PolicyStatus, string> = {
  pending: '保单正在出，一般几分钟，出好了在「我的 → 保险与告知书」里能看到。',
  insured: '今天在三家店攀爬都在保障范围内。',
  failed: '这次没投上，我们会自动重试；不放心可以找前台看一下。',
  refund_pending: '这次入场撤销了，保单在退。',
  refunded: '这次入场撤销了，保单已经退了。',
};

export function checkInDoneView(r: { reentry: boolean; deducted: number; cardKind: EntryCard['kind']; policyStatus: PolicyStatus }): CheckInDoneView {
  let deductText: string;
  if (r.deducted > 0) deductText = `扣了 ${r.deducted} 次`;
  else if (r.reentry) deductText = '今天第二次进，不扣次';
  else if (r.cardKind === 'period') deductText = '期限卡，不扣次';
  else if (r.cardKind === 'referral') deductText = '用的老带新体验券，不扣次';
  else deductText = '没扣次';

  const reused = r.reentry && (r.policyStatus === 'pending' || r.policyStatus === 'insured');
  return {
    title: r.reentry ? '今天已入场，不再扣次' : '入场成功',
    deductText,
    policyText: POLICY_STATUS_TEXT[r.policyStatus],
    policyNote: reused ? `用的是今天第一次入场时投的那张，${POLICY_NOTE[r.policyStatus]}` : POLICY_NOTE[r.policyStatus],
  };
}

/** 领取人在等邀请人入场：哪张体验券、谁的邀请、邀请人今天入场了没有（入场了就可以再扫码进） */
export interface ReferralWait {
  cardId: string;
  cardName: string;
  inviterId: string;
  inviterCheckedIn: boolean;
}

/**
 * 这个会员现在是不是在等邀请人入场。只看今天还能用的体验券（状态正常、没过期、没用过）；
 * 会员今天已经入过场、岩馆不要求邀请人同日入场、或者没有这样的体验券时返回 null（不用等）。
 * 有好几张时，邀请人已经入场的那张优先。
 */
export function referralWait(a: Pick<CheckInArgs, 'memberId' | 'storeId' | 'cards' | 'past' | 'ctx'>): ReferralWait | null {
  const { ctx } = a;
  if (!ctx.rules.referralRequiresInviterSameDay || isReentry(a)) return null;
  const vouchers = a.cards.filter((c): c is ReferralVoucher => c.memberId === a.memberId && c.kind === 'referral');
  const options = entryOptions(vouchers, ctx);
  const pick = options.find(o => o.usable) ?? options.find(o => o.blockedBy === 'inviter-not-checked-in');
  if (!pick) return null;
  const card = pick.card as ReferralVoucher;
  return { cardId: card.id, cardName: card.name, inviterId: card.fromMemberId, inviterCheckedIn: pick.usable };
}
