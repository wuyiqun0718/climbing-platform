import { describe, expect, it } from 'vitest';
import { checkEntryQr, ENTRY_QR_TTL_SECONDS, newEntryQr, useEntryQr } from './entryQr';
import { RuleError } from './rules';

const issued = new Date('2026-10-21T02:00:00.000Z');
const later = (s: number) => new Date(issued.getTime() + s * 1000);
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };

describe('入场码', () => {
  it('有效期内能用，过了就过期', () => {
    const qr = newEntryQr({ token: 't1', storeId: 'binggang', now: issued });
    expect(code(() => checkEntryQr(qr, later(ENTRY_QR_TTL_SECONDS)))).toBeNull();
    expect(code(() => checkEntryQr(qr, later(ENTRY_QR_TTL_SECONDS + 1)))).toBe('qr-expired');
  });

  it('用过一次就作废，同一个人也不能再用', () => {
    const used = useEntryQr(newEntryQr({ token: 't1', storeId: 'binggang', now: issued }), 'jie', later(10));
    expect(used).toMatchObject({ usedBy: 'jie', usedAt: later(10).toISOString() });
    expect(code(() => checkEntryQr(used, later(11)))).toBe('qr-used');
    expect(code(() => useEntryQr(used, 'jie', later(11)))).toBe('qr-used');
  });

  it('过期的码不能作废成用过', () => {
    expect(code(() => useEntryQr(newEntryQr({ token: 't1', storeId: 'binggang', now: issued }), 'jie', later(ENTRY_QR_TTL_SECONDS + 60)))).toBe('qr-expired');
  });
});
