import { describe, expect, it } from 'vitest';
import { RuleError } from './rules';
import { claimBlockedBy, claimShare, isReferralNewcomer, isRepeatClaim, SHARE_STATUS_TEXT, shareDisplayStatus } from './share';
import { newShareToken } from './shareToken';
import type { Card, CountCard, GiftCard, ReferralVoucher, Share } from './types';

const today = '2026-10-12';
const T = newShareToken(n => crypto.getRandomValues(new Uint8Array(n)));
const gift: Share = { id: 's1', kind: 'count', token: T, fromMemberId: 'jie', fromCardId: 'c1', quantity: 2, createdOn: today, expiresOn: '2027-02-06', status: 'pending' };
const invite: Share = { id: 's2', kind: 'referral', token: T, fromMemberId: 'jie', createdOn: today, expiresOn: '2026-10-31', status: 'pending' };
const tenTimes: CountCard = { id: 'c9', kind: 'count', memberId: 'lu', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };
const claim = (share: Share, claimerId = 'lu', claimerCards: Card[] = []) => claimShare({ share, claimerId, claimerCards, cardId: 'v1', today });

describe('领取分享', () => {
  it('次卡变成好友送的次卡，老带新变成体验券；分享记下领取人', () => {
    expect(claim(gift)).toMatchObject({ share: { status: 'claimed', claimedBy: 'lu' }, card: { kind: 'gift', memberId: 'lu', total: 2, remaining: 2, shareId: 's1' } });
    expect(claim(invite).card).toMatchObject({ kind: 'referral', memberId: 'lu', expiresOn: '2026-10-31', fromMemberId: 'jie' });
  });

  it('自己发的、已领的、过期的、退回的都不能领', () => {
    expect(code(() => claim(gift, 'jie'))).toBe('own-share');
    expect(code(() => claim({ ...gift, status: 'claimed', claimedBy: 'xia' }))).toBe('already-claimed');
    expect(code(() => claim({ ...gift, status: 'used', claimedBy: 'xia' }))).toBe('already-claimed');
    expect(code(() => claim({ ...gift, status: 'returned' }))).toBe('share-returned');
    expect(code(() => claim({ ...invite, expiresOn: '2026-10-11' }))).toBe('share-expired');
  });

  it('同一个人领第二次算重复领（接口返回第一次的结果），别人不算', () => {
    const { share } = claim(gift);
    expect(isRepeatClaim(share, 'lu')).toBe(true);
    expect(isRepeatClaim(share, 'xia')).toBe(false);
    expect(isRepeatClaim(gift, 'lu')).toBe(false);
    expect(code(() => claim(share))).toBe('already-claimed');
  });

  it('老带新只给从没买过卡的新客；好友送的次卡可以谁都领', () => {
    const giftCard: Card = { id: 'g1', kind: 'gift', memberId: 'lu', fromMemberId: 'jie', shareId: 's0', name: '好友送的次卡', total: 1, remaining: 0, expiresOn: today };
    expect(isReferralNewcomer([giftCard], 'lu')).toBe(true);
    expect(isReferralNewcomer([tenTimes], 'xia')).toBe(true);
    for (const bought of [tenTimes, { ...tenTimes, status: 'refunded' as const }, { ...tenTimes, total: 1, remaining: 0 }]) {
      expect(code(() => claim(invite, 'lu', [bought]))).toBe('referral-not-newcomer');
    }
    const year: Card = { id: 'p1', kind: 'period', memberId: 'lu', productId: 'y1', name: '年卡', startsOn: '2025-01-01', expiresOn: '2025-12-31' };
    expect(code(() => claim(invite, 'lu', [year]))).toBe('referral-not-newcomer');
    expect(claim(gift, 'lu', [tenTimes, year]).card.kind).toBe('gift');
  });

  it('领过一张体验券的不能再领第二张', () => {
    const { card } = claim(invite);
    expect(code(() => claim({ ...invite, id: 's3', fromMemberId: 'xia' }, 'lu', [card]))).toBe('referral-not-newcomer');
  });

  it('没登录时只看分享本身', () => {
    expect(claimBlockedBy({ share: invite, claimerId: null, claimerCards: [], today })).toBeNull();
    expect(claimBlockedBy({ share: { ...invite, status: 'claimed' }, claimerId: null, claimerCards: [], today })).toBe('already-claimed');
  });
});

describe('分享状态', () => {
  it('待领取、已过期、已领取、已使用、已退回', () => {
    expect(shareDisplayStatus(gift, today)).toBe('pending');
    expect(shareDisplayStatus({ ...invite, expiresOn: '2026-10-11' }, today)).toBe('expired');
    const { share, card } = claim(gift);
    expect(shareDisplayStatus(share, today, card)).toBe('claimed');
    expect(shareDisplayStatus(share, today, { ...(card as GiftCard), remaining: 1 })).toBe('used');
    const v = claim(invite);
    expect(shareDisplayStatus(v.share, today, { ...(v.card as ReferralVoucher), usedOn: today })).toBe('used');
    expect(shareDisplayStatus({ ...gift, status: 'returned', expiresOn: '2026-10-01' }, today)).toBe('returned');
    expect(Object.values(SHARE_STATUS_TEXT)).toEqual(['待领取', '已领取', '已使用', '已退回', '已过期']);
  });
});
