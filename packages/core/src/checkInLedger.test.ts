import { describe, expect, it } from 'vitest';
import { checkInWith, type CheckInArgs } from './checkIn';
import { checkInLedgerEntry } from './checkInLedger';
import { defaultRules } from './gym';
import type { CountCard, PeriodCard } from './types';

const today = '2026-10-21';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const args = (over: Partial<CheckInArgs> = {}): CheckInArgs => ({
  memberId: 'jie', storeId: 'bingang', cards: [tenTimes], past: [], ctx: { today, rules: defaultRules, hasCheckedIn: () => false }, ...over,
});

describe('前台登记入场的流水', () => {
  it('扣了次才记流水，变化后剩余 = 卡上的；业务日期取记录时间的日期', () => {
    const op = { operatorType: 'staff' as const, operatorId: 's1' };
    const { card, deducted } = checkInWith<CountCard>({ ...args(), cardId: 'c1', via: 'desk', waiverSigned: true });
    expect(checkInLedgerEntry({ id: 'l1', card, deducted, at: `${today}T10:00:00+08:00`, checkInId: 'ci1', operator: op })).toMatchObject({
      delta: -1, remainingAfter: 5, expiresOnAfter: '2027-02-06', reason: 'check_in', refType: 'check_in', refId: 'ci1', on: today, operatorType: 'staff',
    });
    expect(checkInLedgerEntry({ id: 'l2', card: year, deducted: 0, at: '', checkInId: 'ci2', operator: op })).toBeNull();
  });

  it('前台登记没签告知书先不拦（等馆方）；扫码要先签（已定，跟小程序一致）', () => {
    expect(checkInWith({ ...args(), cardId: 'c1', via: 'desk', waiverSigned: false }).deducted).toBe(1);
    expect(() => checkInWith({ ...args(), cardId: 'c1', via: 'scan', waiverSigned: false })).toThrow();
  });
});
