import { describe, expect, it } from 'vitest';
import type { InsurancePolicy } from './insurance';
import { policyCheckInText, policyHistory, waiverHistory, waiverStatusText, type PolicyCheckIn } from './insuranceHistory';
import type { WaiverSignature, WaiverVersion } from './waiver';

const policy = (id: string, on: string, checkInId: string, over: Partial<InsurancePolicy> = {}): InsurancePolicy => ({
  id, memberId: 'jie', storeId: 'binggang', on, checkInId, status: 'insured', ...over,
});
const ci = (id: string, on: string, policyId: string, memberId = 'jie'): PolicyCheckIn => ({ id, memberId, on, policyId });

describe('历次保单', () => {
  it('最近的在前；每张保单挂上它保的入场，同日再次入场沿用同一张', () => {
    const policies = [policy('p1', '2026-10-01', 'c1'), policy('p2', '2026-10-21', 'c2')];
    const checkIns = [ci('c1', '2026-10-01', 'p1'), ci('c2', '2026-10-21', 'p2'), ci('c3', '2026-10-21', 'p2')];
    const h = policyHistory(policies, checkIns, 'jie');
    expect(h.map(x => x.policy.id)).toEqual(['p2', 'p1']);
    expect(h[0].checkIns.map(c => [c.id, c.first])).toEqual([['c2', true], ['c3', false]]);
    expect(h[0].checkIns.map(policyCheckInText)).toEqual(['入场时投保', '再次入场，沿用这张']);
    expect(h[1].checkIns.map(c => c.id)).toEqual(['c1']);
  });

  it('撤销入场后同一天又投了一张：两张都列出来，后投的在前，入场按保单挂不按日期', () => {
    const policies = [policy('p1', '2026-10-21', 'c1', { status: 'refunded' }), policy('p2', '2026-10-21', 'c2')];
    const checkIns = [ci('c1', '2026-10-21', 'p1'), ci('c2', '2026-10-21', 'p2')];
    const h = policyHistory(policies, checkIns, 'jie');
    expect(h.map(x => [x.policy.id, x.checkIns.map(c => c.id)])).toEqual([['p2', ['c2']], ['p1', ['c1']]]);
  });

  it('只看自己的保单和入场', () => {
    const policies = [policy('p1', '2026-10-21', 'c1'), policy('p9', '2026-10-21', 'c9', { memberId: 'lu' })];
    const checkIns = [ci('c1', '2026-10-21', 'p1'), ci('c9', '2026-10-21', 'p9', 'lu')];
    expect(policyHistory(policies, checkIns, 'jie').map(x => x.policy.id)).toEqual(['p1']);
    expect(policyHistory([], checkIns, 'jie')).toEqual([]);
  });
});

describe('签过的告知书', () => {
  const v1: WaiverVersion = { id: 'w1', version: '2026-01', title: '攀岩运动风险告知书', points: ['a'], effectiveFrom: '2026-01-01' };
  const v2: WaiverVersion = { ...v1, id: 'w2', version: '2026-11', effectiveFrom: '2026-11-01' };
  const sign = (id: string, waiverVersionId: string, signedAt: string, memberId = 'jie'): WaiverSignature => ({ id, memberId, waiverVersionId, signedAt });

  it('签过当前这一版：显示签的日期', () => {
    const h = waiverHistory([v1], [sign('s1', 'w1', '2026-08-20T03:00:00.000Z'), sign('s9', 'w1', '2026-09-01T03:00:00.000Z', 'lu')], 'jie', '2026-10-21');
    expect(h).toMatchObject({ current: { id: 'w1' }, signedCurrent: true });
    expect(h.signed.map(s => [s.id, s.current])).toEqual([['s1', true]]);
    expect(waiverStatusText(h)).toBe('2026.08.20 已签');
  });

  it('换了新版：旧的签名还列着但不算当前，提示下次入场重签；签了新版后新的在前', () => {
    const old = sign('s1', 'w1', '2026-08-20T03:00:00.000Z');
    const h = waiverHistory([v1, v2], [old], 'jie', '2026-11-02');
    expect(h).toMatchObject({ current: { id: 'w2' }, signedCurrent: false });
    expect(h.signed.map(s => [s.id, s.current])).toEqual([['s1', false]]);
    expect(waiverStatusText(h)).toBe('告知书更新了，下次入场时重签');

    const after = waiverHistory([v1, v2], [old, sign('s2', 'w2', '2026-11-02T03:00:00.000Z')], 'jie', '2026-11-02');
    expect(after.signed.map(s => [s.id, s.version.version, s.current])).toEqual([['s2', '2026-11', true], ['s1', '2026-01', false]]);
    expect(after.signedCurrent).toBe(true);
  });

  it('没签过、馆里还没上告知书', () => {
    expect(waiverStatusText(waiverHistory([v1], [], 'jie', '2026-10-21'))).toBe('还没签，第一次入场时签');
    const none = waiverHistory([v2], [], 'jie', '2026-10-21');
    expect(none.current).toBeNull();
    expect(waiverStatusText(none)).toBe('馆里还没上告知书，不用签');
  });
});
