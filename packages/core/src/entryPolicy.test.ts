import { describe, expect, it } from 'vitest';
import { entryPolicy } from './entryPolicy';
import type { InsurancePolicy } from './insurance';

const today = '2026-10-21';
const policy = (over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({ id: 'ip1', memberId: 'jie', storeId: 'bingang', on: today, checkInId: 'ci1', status: 'pending', ...over });

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
