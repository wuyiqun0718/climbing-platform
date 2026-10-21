import { describe, expect, it } from 'vitest';
import { RuleError } from './rules';
import { currentWaiver, hasSignedWaiver, signWaiver, type WaiverSignature, type WaiverVersion } from './waiver';

const v = (id: string, effectiveFrom: string): WaiverVersion => ({ id, version: id, title: '攀岩运动风险告知书', points: ['……'], effectiveFrom });
const v1 = v('w1', '2026-01-01');
const v2 = v('w2', '2026-11-01');
const signed = (memberId: string, waiverVersionId: string): WaiverSignature => ({ id: `s-${memberId}-${waiverVersionId}`, memberId, waiverVersionId, signedAt: '2026-10-01T03:00:00.000Z' });

const code = (f: () => unknown) => {
  try {
    f();
  } catch (e) {
    if (e instanceof RuleError) return e.code;
    throw e;
  }
  return null;
};

describe('风险告知书', () => {
  it('当前版本：已生效的里面生效日最晚的；没生效的不算；同一天生效取后加的', () => {
    expect(currentWaiver([v1, v2], '2026-10-31')).toBe(v1);
    expect(currentWaiver([v2, v1], '2026-11-01')).toBe(v2);
    expect(currentWaiver([v2], '2026-10-31')).toBeNull();
    const fix = v('w1b', '2026-01-01');
    expect(currentWaiver([v1, fix], '2026-10-31')).toBe(fix);
  });

  it('签过当前版才算签过；换新版后旧签名不算，要重签；没有任何一版时不用签', () => {
    const sigs = [signed('a', 'w1')];
    expect(hasSignedWaiver(sigs, 'a', v1)).toBe(true);
    expect(hasSignedWaiver(sigs, 'b', v1)).toBe(false);
    expect(hasSignedWaiver(sigs, 'a', v2)).toBe(false);
    expect(hasSignedWaiver([...sigs, signed('a', 'w2')], 'a', v2)).toBe(true);
    expect(hasSignedWaiver([], 'a', null)).toBe(true);
  });

  it('只能签当前版本；同一版签两次不重复记', () => {
    const base = { id: 's1', memberId: 'a', current: v2, signatures: [signed('a', 'w1')], at: '2026-11-02T03:00:00.000Z' };
    expect(code(() => signWaiver({ ...base, waiverVersionId: 'w1' }))).toBe('waiver-outdated');
    expect(code(() => signWaiver({ ...base, current: null, waiverVersionId: 'w1' }))).toBe('waiver-outdated');

    const first = signWaiver({ ...base, waiverVersionId: 'w2' });
    expect(first).toEqual({ created: true, signature: { id: 's1', memberId: 'a', waiverVersionId: 'w2', signedAt: base.at } });
    const again = signWaiver({ ...base, id: 's2', signatures: [...base.signatures, first.signature], waiverVersionId: 'w2' });
    expect(again).toEqual({ created: false, signature: first.signature });
  });
});
