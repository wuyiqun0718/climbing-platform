import { describe, expect, it } from 'vitest';
import { checkInWith, type CheckInArgs, type PastCheckIn } from './checkIn';
import { checkInDoneView, referralWait } from './checkInDone';
import { defaultRules } from './gym';
import type { CountCard, PeriodCard, ReferralVoucher } from './types';

const today = '2026-10-21';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const voucher: ReferralVoucher = { id: 'v1', kind: 'referral', memberId: 'jie', fromMemberId: 'lu', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31' };

const args = (over: Partial<CheckInArgs> = {}, inviterIn = false): CheckInArgs => ({
  memberId: 'jie', storeId: 'bingang', cards: [voucher], past: [],
  ctx: { today, rules: defaultRules, hasCheckedIn: id => inviterIn && id === 'lu' },
  ...over,
});
const enteredToday: PastCheckIn = { memberId: 'jie', storeId: 'huiju', on: today, cardId: 'c1', voided: false };

describe('入场成功页', () => {
  it('第一次入场：次卡显示扣了几次，保单投保中', () => {
    expect(checkInDoneView({ reentry: false, deducted: 1, cardKind: 'count', policyStatus: 'pending' }))
      .toMatchObject({ title: '入场成功', deductText: '扣了 1 次', policyText: '投保中' });
  });

  it('同日再次入场：标题「今天已入场，不再扣次」，保单说明是复用当天那张', () => {
    const { reentry, deducted } = checkInWith({ ...args({ cards: [tenTimes], past: [enteredToday] }), cardId: 'c1', via: 'scan', waiverSigned: true });
    const v = checkInDoneView({ reentry, deducted, cardKind: 'count', policyStatus: 'insured' });
    expect(v).toMatchObject({ title: '今天已入场，不再扣次', deductText: '今天第二次进，不扣次', policyText: '已投保' });
    expect(v.policyNote).toMatch(/^用的是今天第一次入场时投的那张/);
  });

  it('期限卡、体验券不扣次各有说法；投保失败告诉会员会重试', () => {
    expect(checkInDoneView({ reentry: false, deducted: 0, cardKind: 'period', policyStatus: 'insured' }).deductText).toBe('期限卡，不扣次');
    expect(checkInDoneView({ reentry: false, deducted: 0, cardKind: 'referral', policyStatus: 'pending' }).deductText).toBe('用的老带新体验券，不扣次');
    const failed = checkInDoneView({ reentry: true, deducted: 0, cardKind: 'count', policyStatus: 'failed' });
    expect(failed).toMatchObject({ policyText: '投保失败' });
    expect(failed.policyNote).toMatch(/自动重试/);
  });
});

describe('等邀请人入场', () => {
  it('邀请人没入场：在等；入场后可以用', () => {
    expect(referralWait(args())).toEqual({ cardId: 'v1', cardName: '老带新体验券', inviterId: 'lu', inviterCheckedIn: false });
    expect(referralWait(args({}, true))).toMatchObject({ cardId: 'v1', inviterCheckedIn: true });
  });

  it('不用等：今天已经入过场、体验券用过或过期、没有体验券、岩馆不要求邀请人同日入场', () => {
    expect(referralWait(args({ past: [enteredToday] }))).toBeNull();
    expect(referralWait(args({ past: [{ ...enteredToday, voided: true }] }))).not.toBeNull();
    expect(referralWait(args({ cards: [{ ...voucher, usedOn: '2026-10-20' }] }))).toBeNull();
    expect(referralWait(args({ cards: [{ ...voucher, expiresOn: '2026-10-20' }] }))).toBeNull();
    expect(referralWait(args({ cards: [{ ...voucher, status: 'void' }] }))).toBeNull();
    expect(referralWait(args({ cards: [year] }))).toBeNull();
    expect(referralWait(args({ ctx: { ...args().ctx, rules: { ...defaultRules, referralRequiresInviterSameDay: false } } }))).toBeNull();
  });

  it('好几张体验券时，邀请人已经入场的那张优先；别人的券不算', () => {
    const other: ReferralVoucher = { ...voucher, id: 'v2', fromMemberId: 'zhou', shareId: 's2' };
    const ctx = { today, rules: defaultRules, hasCheckedIn: (id: string) => id === 'zhou' };
    expect(referralWait(args({ cards: [voucher, other], ctx }))).toMatchObject({ cardId: 'v2', inviterId: 'zhou', inviterCheckedIn: true });
    expect(referralWait(args({ cards: [{ ...voucher, memberId: 'someone' }] }))).toBeNull();
  });
});
