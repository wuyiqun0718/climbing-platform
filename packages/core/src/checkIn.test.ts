import { describe, expect, it } from 'vitest';
import { checkInPlan, checkInWith, isReentry, type CheckInArgs, type PastCheckIn } from './checkIn';
import { defaultRules } from './gym';
import { entryOptions, RuleError } from './rules';
import type { CountCard, PeriodCard, ReferralVoucher } from './types';

const today = '2026-10-21';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const voucher: ReferralVoucher = { id: 'v1', kind: 'referral', memberId: 'jie', fromMemberId: 'lu', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31' };

const entered = (cardId: string, over: Partial<PastCheckIn> = {}): PastCheckIn => ({ memberId: 'jie', storeId: 'bingang', on: today, cardId, voided: false, ...over });
const args = (over: Partial<CheckInArgs> = {}): CheckInArgs => ({
  memberId: 'jie',
  storeId: 'bingang',
  cards: [tenTimes],
  past: [],
  ctx: { today, rules: defaultRules, hasCheckedIn: () => false },
  ...over,
});
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };

describe('入场：能用的卡', () => {
  it('冻结、作废、已退款的卡不列', () => {
    for (const status of ['frozen', 'void', 'refunded'] as const) expect(entryOptions([{ ...tenTimes, status }], args().ctx)).toEqual([]);
    expect(checkInPlan(args({ cards: [{ ...year, status: 'frozen' }, tenTimes] })).options.map(o => o.card.id)).toEqual(['c1']);
  });

  it('课包和别人的卡不列', () => {
    const pt = { id: 'pt', kind: 'pt' as const, memberId: 'jie', productId: 'x', name: '私教', total: 5, remaining: 5, expiresOn: '2027-01-01' };
    expect(checkInPlan(args({ cards: [pt, { ...tenTimes, id: 'c9', memberId: 'lu' }] })).options).toEqual([]);
  });
});

describe('入场：同一天再次入场', () => {
  it('第一次扣 1 次，同一天第二次不扣', () => {
    const first = checkInWith<CountCard>({ ...args(), cardId: 'c1', waiverSigned: true });
    expect(first).toMatchObject({ deducted: 1, reentry: false, card: { remaining: 5 } });
    const second = checkInWith<CountCard>({ ...args({ cards: [first.card], past: [entered('c1')] }), cardId: 'c1', waiverSigned: true });
    expect(second).toMatchObject({ deducted: 0, reentry: true, card: { remaining: 5 } });
  });

  it('换一张卡再进也不扣；撤销的、昨天的、别人的不算再次入场', () => {
    expect(checkInPlan(args({ past: [entered('p1')] })).options[0]).toMatchObject({ deducts: 0 });
    for (const p of [entered('c1', { voided: true }), entered('c1', { on: '2026-10-20' }), entered('c1', { memberId: 'lu' })]) {
      expect(checkInPlan(args({ past: [p] }))).toMatchObject({ reentry: false, options: [{ deducts: 1 }] });
    }
  });

  it('在别的店入过场也算（卡三店通用）', () => {
    expect(isReentry(args({ past: [entered('c1', { storeId: 'huiju' })] }))).toBe(true);
  });

  it('今天刚扣完最后一次、体验券已经用掉，再进还能用那张卡，排在最前', () => {
    const used = { ...tenTimes, remaining: 0 };
    const usedVoucher = { ...voucher, usedOn: today };
    const plan = checkInPlan(args({ cards: [year, used, usedVoucher], past: [entered('v1')] }));
    expect(plan.options.map(o => [o.card.id, o.deducts])).toEqual([['v1', 0], ['p1', 0]]);
    expect(checkInWith({ ...args({ cards: [used], past: [entered('c1')] }), cardId: 'c1', waiverSigned: true })).toMatchObject({ deducted: 0, card: { remaining: 0 } });
  });

  it('岩馆规则不免扣次时，再次入场照扣，用完的卡不能再用', () => {
    const ctx = { today, rules: { ...defaultRules, sameDayReentryFree: false }, hasCheckedIn: () => false };
    expect(checkInPlan(args({ ctx, past: [entered('c1')] }))).toMatchObject({ reentry: true, options: [{ deducts: 1 }] });
    expect(code(() => checkInWith({ ...args({ ctx, cards: [{ ...tenTimes, remaining: 0 }], past: [entered('c1')] }), cardId: 'c1', waiverSigned: true }))).toBe('card-not-usable');
  });
});

describe('入场：用卡', () => {
  it('体验券用掉记日期，邀请人没入场不能用；没有的卡、冻结的卡不能用', () => {
    expect(checkInWith<ReferralVoucher>({ ...args({ cards: [voucher], ctx: { ...args().ctx, hasCheckedIn: id => id === 'lu' } }), cardId: 'v1', waiverSigned: true }).card.usedOn).toBe(today);
    expect(code(() => checkInWith({ ...args({ cards: [voucher] }), cardId: 'v1', waiverSigned: true }))).toBe('inviter-not-checked-in');
    expect(code(() => checkInWith({ ...args(), cardId: 'nope', waiverSigned: true }))).toBe('card-not-usable');
    expect(code(() => checkInWith({ ...args({ cards: [{ ...tenTimes, status: 'frozen' }] }), cardId: 'c1', waiverSigned: true }))).toBe('card-not-usable');
  });

  it('没签告知书先不拦（等馆方）', () => {
    expect(checkInWith({ ...args(), cardId: 'c1', waiverSigned: false }).deducted).toBe(1);
  });
});
