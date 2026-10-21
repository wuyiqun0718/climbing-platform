import { describe, expect, it } from 'vitest';
import { entryPolicy, insuranceForEntry, newPolicy, type InsurancePolicy, type PolicyStatus } from './insurance';

const today = '2026-10-21';
const policy = (over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({ id: 'ip1', memberId: 'jie', storeId: 'bingang', on: today, checkInId: 'ci1', status: 'pending', ...over });

describe('入场保险', () => {
  it('当天第一次入场要投；新保单是投保中', () => {
    expect(insuranceForEntry([], 'jie', today)).toEqual({ needed: true, policy: null });
    expect(newPolicy({ id: 'ip1', memberId: 'jie', storeId: 'bingang', on: today, checkInId: 'ci1' }).status).toBe('pending');
  });

  it('同一天再次入场复用当天的保单，在别的店也一样；投保失败的也复用（在原保单上重试）', () => {
    for (const status of ['pending', 'insured', 'failed'] as PolicyStatus[]) {
      const p = policy({ status, storeId: 'huiju' });
      expect(insuranceForEntry([p], 'jie', today)).toEqual({ needed: false, policy: p });
    }
  });

  it('昨天的、别人的不算；撤销入场后待退保、已退保的不算，再入场新投', () => {
    for (const p of [policy({ on: '2026-10-20' }), policy({ memberId: 'lu' }), policy({ status: 'refund_pending' }), policy({ status: 'refunded' })]) {
      expect(insuranceForEntry([p], 'jie', today).needed).toBe(true);
    }
  });
});

describe('入场记录上的保单', () => {
  it('按入场记录上的 policyId 找，不按日期猜；没有 policyId 或找不到的为 null', () => {
    const old = policy({ id: 'ip1', status: 'refund_pending' });
    const fresh = policy({ id: 'ip2', checkInId: 'ci3' });
    expect(entryPolicy([old, fresh], { policyId: 'ip1' })).toBe(old);
    expect(entryPolicy([old, fresh], { policyId: 'ip2' })).toBe(fresh);
    expect(entryPolicy([old, fresh], { policyId: null })).toBeNull();
    expect(entryPolicy([old, fresh], {})).toBeNull();
    expect(entryPolicy([old], { policyId: 'nope' })).toBeNull();
  });
});
