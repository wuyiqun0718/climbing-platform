import { describe, expect, it } from 'vitest';
import { entryLedgerDelta, ledgerEntry } from './ledger';
import type { CountCard, PeriodCard, ReferralVoucher } from './types';

const on = '2026-10-21';
const at = '2026-10-21T10:00:00.000Z';
const c10: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 5, expiresOn: '2027-02-06' };
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const voucher: ReferralVoucher = { id: 'r1', kind: 'referral', memberId: 'lu', fromMemberId: 'jie', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31' };

describe('流水', () => {
  it('记下变化后的剩余次数、有效期和关联记录', () => {
    expect(ledgerEntry({ id: 'l1', card: c10, delta: -1, reason: 'check_in', on, at, ref: { type: 'check_in', id: 'ci-1' } })).toEqual({
      id: 'l1', cardId: 'c1', delta: -1, remainingAfter: 5, expiresOnAfter: '2027-02-06', reason: 'check_in', refType: 'check_in', refId: 'ci-1', on, at,
    });
  });

  it('期限卡没有剩余次数', () => {
    expect(ledgerEntry({ id: 'l2', card: year, delta: 0, reason: 'purchase', on, at })).not.toHaveProperty('remainingAfter');
  });

  it('体验券用掉后剩 0', () => {
    expect(ledgerEntry({ id: 'l3', card: { ...voucher, usedOn: on }, delta: -1, reason: 'check_in', on, at }).remainingAfter).toBe(0);
  });

  it('入场扣次、用掉体验券才记；期限卡和同日再次入场不记', () => {
    expect(entryLedgerDelta(c10, { ...c10, remaining: 4 }, 1)).toBe(-1);
    expect(entryLedgerDelta(c10, c10, 0)).toBeNull();
    expect(entryLedgerDelta(year, year, 0)).toBeNull();
    expect(entryLedgerDelta(voucher, { ...voucher, usedOn: on }, 0)).toBe(-1);
    expect(entryLedgerDelta({ ...voucher, usedOn: on }, { ...voucher, usedOn: on }, 0)).toBeNull();
  });
});
