import type { DateKey } from '@climb/utils';
import { RuleError, type RuleErrorCode } from './rules';
import type { Card, GiftCard, ReferralVoucher, Share, ShareStatus } from './types';

/**
 * 老带新只给新客的口径（占位，等馆方定）：
 * - 买过的卡都算「买过卡」：期限卡、次卡（含单次票）、私教、团课，不管现在什么状态，从青橙导入的、前台开的也算；
 *   好友送的次卡、体验券不算。
 * - 领过一次老带新体验券的，不能再领第二张。
 */
export const REFERRAL_NEWCOMER_RULES = {
  boughtKinds: ['period', 'count', 'pt', 'class'] as Card['kind'][],
  voucherOncePerPerson: true,
};

/** 分享记录上显示的状态：库里的 status，加上没人领、过了有效期的「已过期」 */
export type ShareDisplayStatus = ShareStatus | 'expired';

/** 分享状态文字；小程序和后台（mvp/dashboard 任务 21 分享记录）共用 */
export const SHARE_STATUS_TEXT: Record<ShareDisplayStatus, string> = {
  pending: '待领取',
  claimed: '已领取',
  used: '已使用',
  returned: '已退回',
  expired: '已过期',
};

/**
 * 分享现在算什么状态。claimedCard 是领取人领到的那张卡（按 shareId 找）：
 * 体验券用过、好友送的次卡用过至少 1 次，算「已使用」（库里的 status 不会自己变成 used）。
 */
export function shareDisplayStatus(share: Share, today: DateKey, claimedCard?: Card): ShareDisplayStatus {
  if (share.status === 'pending') return share.expiresOn < today ? 'expired' : 'pending';
  if (share.status === 'claimed' && claimedCard) {
    if (claimedCard.kind === 'referral' && claimedCard.usedOn) return 'used';
    if (claimedCard.kind === 'gift' && claimedCard.remaining < claimedCard.total) return 'used';
  }
  return share.status;
}

/** 从没买过卡（口径见 REFERRAL_NEWCOMER_RULES）。claimerCards 是这个会员所有的卡，含作废、退款的 */
export function isReferralNewcomer(claimerCards: Card[], claimerId: string): boolean {
  const mine = claimerCards.filter(c => c.memberId === claimerId);
  if (mine.some(c => REFERRAL_NEWCOMER_RULES.boughtKinds.includes(c.kind))) return false;
  if (REFERRAL_NEWCOMER_RULES.voucherOncePerPerson && mine.some(c => c.kind === 'referral')) return false;
  return true;
}

/** 同一个人再领一次自己已经领到的分享：网络重试、连点。接口直接返回第一次领到的卡，不再新建 */
export const isRepeatClaim = (share: Share, claimerId: string) => share.status !== 'pending' && share.claimedBy === claimerId;

const CLAIM_BLOCKED_TEXT: Partial<Record<RuleErrorCode, string>> = {
  'own-share': '这是你自己发出的，发给朋友让 TA 来领',
  'already-claimed': '已经被领取了',
  'share-returned': '这个分享过期没人领，次数已经退回去了',
  'share-expired': '这个链接已经过期',
  'referral-not-newcomer': '老带新体验券只给第一次来的新朋友',
};

/**
 * 这个分享能不能领；能为 null。claimerId 为 null（没登录）时只看分享本身。
 * 自己领过的（isRepeatClaim）这里也算 already-claimed，接口先判断重复领再调这个。
 */
export function claimBlockedBy(args: { share: Share; claimerId: string | null; claimerCards: Card[]; today: DateKey }): RuleErrorCode | null {
  const { share, claimerId, claimerCards, today } = args;
  if (claimerId && share.fromMemberId === claimerId) return 'own-share';
  if (share.status === 'returned') return 'share-returned';
  if (share.status !== 'pending') return 'already-claimed';
  if (share.expiresOn < today) return 'share-expired';
  if (claimerId && share.kind === 'referral' && !isReferralNewcomer(claimerCards, claimerId)) return 'referral-not-newcomer';
  return null;
}

/**
 * 朋友点开链接领取：次卡变成 GiftCard，老带新变成 ReferralVoucher。
 * 后端在一个事务里锁住这条分享（或 `update ... where status = 'pending'` 看影响行数）再写卡，并发领只有一个成功。
 */
export function claimShare(args: { share: Share; claimerId: string; claimerCards: Card[]; cardId: string; today: DateKey }): { share: Share; card: GiftCard | ReferralVoucher } {
  const { share, claimerId, cardId } = args;
  const blocked = claimBlockedBy(args);
  if (blocked) throw new RuleError(blocked, CLAIM_BLOCKED_TEXT[blocked]!);
  const claimed: Share = { ...share, status: 'claimed', claimedBy: claimerId };
  const base = { id: cardId, memberId: claimerId, fromMemberId: share.fromMemberId, shareId: share.id, expiresOn: share.expiresOn };
  const card: GiftCard | ReferralVoucher = share.kind === 'count'
    ? { ...base, kind: 'gift', name: '好友送的次卡', total: share.quantity!, remaining: share.quantity! }
    : { ...base, kind: 'referral', name: '老带新体验券' };
  return { share: claimed, card };
}
