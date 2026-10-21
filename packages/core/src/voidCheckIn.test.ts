import { describe, expect, it } from 'vitest';
import type { InsurancePolicy } from './insurance';
import { ledgerMismatch } from './ledgerCheck';
import type { LedgerEntry } from './types';
import { RuleError } from './rules';
import type { Card, CountCard, GiftCard, PeriodCard, ReferralVoucher } from './types';
import { checkInVoidLedgerEntry, voidCheckIn as voidWith, type VoidableCheckIn, type VoidCheckInArgs } from './voidCheckIn';

const today = '2026-10-21';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 5, expiresOn: '2027-02-06' };
const voucher: ReferralVoucher = { id: 'v1', kind: 'referral', memberId: 'jie', fromMemberId: 'lu', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31', usedOn: today };

const entry = (id: string, over: Partial<VoidableCheckIn> = {}): VoidableCheckIn => ({ id, memberId: 'jie', storeId: 'bingang', on: today, cardId: 'c1', deducted: 0, voided: false, ...over });
const policy = (over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({ id: 'ip1', memberId: 'jie', storeId: 'bingang', on: today, checkInId: 'ci1', status: 'pending', ...over });
// 卡默认是这个会员的三张卡
const voidCheckIn = <C extends Card>(a: Omit<VoidCheckInArgs<C, InsurancePolicy>, 'cards'> & { cards?: Card[] }) => voidWith<C, InsurancePolicy>({ cards: [tenTimes, year, voucher], ...a });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };

describe('撤销入场：次数', () => {
  it('扣了 1 次的退回 1 次，记一笔 check_in_void 流水，接得上', () => {
    const ci = entry('ci1', { deducted: 1 });
    const r = voidCheckIn({ checkIn: ci, card: tenTimes, past: [ci], policies: [], reason: '扫错了卡' });
    expect(r).toMatchObject({ restored: 1, card: { remaining: 6 }, voucherRestored: false });
    const ledger: LedgerEntry[] = [
      { id: 'l1', cardId: 'c1', at: `${today}T10:00:00+08:00`, on: today, delta: 5, remainingAfter: 5, expiresOnAfter: tenTimes.expiresOn, reason: 'purchase', operatorType: 'member', operatorId: 'jie', note: '' },
    ];
    const e = checkInVoidLedgerEntry({ id: 'l2', card: r.card!, restored: r.restored, at: `${today}T12:00:00+08:00`, checkInId: 'ci1', operator: { operatorType: 'staff', operatorId: 's1' }, note: '扫错了卡' });
    expect(e).toMatchObject({ delta: 1, remainingAfter: 6, reason: 'check_in_void', refType: 'check_in', refId: 'ci1', note: '扫错了卡' });
    expect(ledgerMismatch(r.card!, [...ledger, e!])).toBeNull();
  });

  it('同一天再次入场扣 0 的，撤销不退次，不记流水', () => {
    const first = entry('ci1', { deducted: 1 });
    const again = entry('ci2');
    const r = voidCheckIn({ checkIn: again, card: tenTimes, past: [first, again], policies: [], reason: '登记重了' });
    expect(r).toMatchObject({ restored: 0, card: { remaining: 5 } });
    expect(checkInVoidLedgerEntry({ id: 'l2', card: r.card!, restored: 0, at: '', checkInId: 'ci2', operator: { operatorType: 'staff', operatorId: 's1' }, note: '' })).toBeNull();
  });

  it('撤销扣了次的那次，同一天还有用同一张卡免扣再进的：不退，扣次转给最早那次，记一笔 0 的流水', () => {
    const first = entry('ci1', { deducted: 1 });
    const r = voidCheckIn({ checkIn: first, card: tenTimes, past: [first, entry('ci2', { voided: true }), entry('ci3'), entry('ci4')], policies: [], reason: '扫错了' });
    expect(r).toMatchObject({ restored: 0, card: { remaining: 5 }, moved: { checkIn: { id: 'ci3', deducted: 1 }, card: null } });
    const e = checkInVoidLedgerEntry({ id: 'l2', card: r.card!, restored: 0, movedTo: 'ci3', at: '', checkInId: 'ci1', operator: { operatorType: 'staff', operatorId: 's1' }, note: '扫错了' });
    expect(e).toMatchObject({ delta: 0, remainingAfter: 5, reason: 'check_in_void', note: '扫错了（扣次转到同一天的入场 ci3）' });
  });

  it('免扣再进用的是另一张次卡：这张退回，那张扣掉；那张不够扣、冻结的跳过，都不行才退回', () => {
    const gift: GiftCard = { id: 'g1', kind: 'gift', memberId: 'jie', fromMemberId: 'lu', shareId: 's2', name: '朋友送的次卡', total: 2, remaining: 2, expiresOn: '2027-01-01' };
    const first = entry('ci1', { deducted: 1 });
    const viaGift = entry('ci2', { cardId: 'g1' });
    const r = voidCheckIn({ checkIn: first, card: tenTimes, cards: [tenTimes, gift], past: [first, viaGift], policies: [], reason: 'x' });
    expect(r).toMatchObject({ restored: 1, card: { remaining: 6 }, moved: { checkIn: { id: 'ci2', deducted: 1 }, card: { id: 'g1', remaining: 1 } } });
    for (const g of [{ ...gift, remaining: 0 }, { ...gift, status: 'frozen' as const }]) {
      const n = voidCheckIn({ checkIn: first, card: tenTimes, cards: [tenTimes, g], past: [first, viaGift], policies: [], reason: 'x' });
      expect(n).toMatchObject({ restored: 1, moved: null });
    }
  });

  it('同一天别的入场扣 0 不是因为再次入场（期限卡、体验券、没卡）：照常退回', () => {
    const first = entry('ci1', { deducted: 1 });
    const others = [entry('ci2', { cardId: 'p1' }), entry('ci3', { cardId: 'v1' }), entry('ci4', { cardId: null })];
    expect(voidCheckIn({ checkIn: first, card: tenTimes, past: [first, ...others], policies: [], reason: 'x' })).toMatchObject({ restored: 1, moved: null, card: { remaining: 6 } });
  });

  it('期限卡、没卡的入场不动卡', () => {
    const p = voidCheckIn({ checkIn: entry('ci1', { cardId: 'p1' }), card: year, past: [], policies: [], reason: 'x' });
    expect(p).toEqual({ card: year, restored: 0, moved: null, voucherRestored: false, policy: null });
    expect(voidCheckIn({ checkIn: entry('ci1', { cardId: null }), card: null, past: [], policies: [], reason: 'x' }).card).toBeNull();
  });
});

describe('撤销入场：体验券', () => {
  it('用掉体验券的那次撤销后，体验券恢复成没用过', () => {
    const ci = entry('ci1', { cardId: 'v1' });
    const r = voidCheckIn({ checkIn: ci, card: voucher, past: [ci], policies: [], reason: '邀请人没来' });
    expect(r.voucherRestored).toBe(true);
    expect(r.card).not.toHaveProperty('usedOn');
    expect(r.restored).toBe(0);
  });

  it('同一天还有别的没撤销的入场（不管用哪张卡），券还算用过；别的都撤销了才恢复', () => {
    const ci = entry('ci1', { cardId: 'v1' });
    for (const other of [entry('ci2', { cardId: 'v1' }), entry('ci2', { cardId: 'p1' })]) {
      const r = voidCheckIn({ checkIn: ci, card: voucher, past: [ci, other], policies: [], reason: 'x' });
      expect(r).toMatchObject({ voucherRestored: false, card: { usedOn: today } });
    }
    const other = voidCheckIn({ checkIn: ci, card: voucher, past: [ci, entry('ci2', { cardId: 'v1', voided: true })], policies: [], reason: 'x' });
    expect(other.voucherRestored).toBe(true);
  });

  it('券是别的日子用掉的不动', () => {
    const ci = entry('ci1', { cardId: 'v1', on: '2026-10-20' });
    expect(voidCheckIn({ checkIn: ci, card: voucher, past: [ci], policies: [], reason: 'x' }).voucherRestored).toBe(false);
  });
});

describe('撤销入场：保险', () => {
  it('当天只有这一次入场：保单待退保', () => {
    const ci = entry('ci1', { deducted: 1 });
    for (const status of ['pending', 'insured', 'failed'] as const) {
      const r = voidCheckIn({ checkIn: ci, card: tenTimes, past: [ci], policies: [policy({ status })], reason: 'x' });
      expect(r.policy).toEqual(policy({ status: 'refund_pending' }));
    }
  });

  it('撤销投保的那次，同一天还有别的没撤销的入场：保单继续有效，改挂到那次（门店跟着改）', () => {
    const first = entry('ci1', { deducted: 1 });
    const later = entry('ci3', { storeId: 'huiju' });
    const r = voidCheckIn({ checkIn: first, card: tenTimes, past: [first, entry('ci2', { voided: true }), later], policies: [policy({ status: 'insured' })], reason: 'x' });
    expect(r.policy).toEqual(policy({ status: 'insured', checkInId: 'ci3', storeId: 'huiju' }));
  });

  it('撤销复用保单的再次入场，保单不动；已经待退保的不再改', () => {
    const first = entry('ci1', { deducted: 1 });
    const again = entry('ci2');
    expect(voidCheckIn({ checkIn: again, card: tenTimes, past: [first, again], policies: [policy()], reason: 'x' }).policy).toBeNull();
    expect(voidCheckIn({ checkIn: first, card: tenTimes, past: [first], policies: [policy({ status: 'refund_pending' })], reason: 'x' }).policy).toBeNull();
  });
});

describe('撤销入场：校验', () => {
  it('没写原因、已经撤销过的拦下', () => {
    const ci = entry('ci1', { deducted: 1 });
    expect(code(() => voidCheckIn({ checkIn: ci, card: tenTimes, past: [], policies: [], reason: '  ' }))).toBe('reason-required');
    expect(code(() => voidCheckIn({ checkIn: { ...ci, voided: true }, card: tenTimes, past: [], policies: [], reason: 'x' }))).toBe('already-voided');
  });

  it('传错卡直接报错', () => {
    expect(() => voidCheckIn({ checkIn: entry('ci1'), card: year, past: [], policies: [], reason: 'x' })).toThrow();
  });
});
