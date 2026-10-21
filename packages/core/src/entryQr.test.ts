import { describe, expect, it } from 'vitest';
import {
  checkEntryQr, ENTRY_QR_TTL_SECONDS, entryQrLink, entryQrParams, entryQrScene, newEntryQr, parseEntryQrLink, parseEntryQrParams, useEntryQr,
} from './entryQr';
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

describe('码的内容', () => {
  const base = 'https://qr.example.com/benchmark/checkin';
  const p = { storeId: 'huanqiugang', token: 'qr-12-abc_DEF' };

  it('scene 和链接都能原样解析回来', () => {
    expect(parseEntryQrParams(entryQrScene(p))).toEqual(p);
    expect(parseEntryQrLink(base, entryQrLink(base, p))).toEqual(p);
  });

  it('参数顺序不限，多余的参数和 # 后面忽略', () => {
    expect(parseEntryQrParams('t=abc&x=1&s=huiju')).toEqual({ storeId: 'huiju', token: 'abc' });
    expect(parseEntryQrLink(base, `${base}?s=huiju&t=abc#top`)).toEqual({ storeId: 'huiju', token: 'abc' });
  });

  it('缺门店或 token、带奇怪字符的不认', () => {
    expect(parseEntryQrParams('s=huiju')).toBeNull();
    expect(parseEntryQrParams('t=abc&s=')).toBeNull();
    expect(parseEntryQrParams('s=hui ju&t=abc')).toBeNull();
    expect(parseEntryQrParams('hello')).toBeNull();
  });

  it('别的网址、别的馆的链接不认', () => {
    expect(parseEntryQrLink(base, 'https://example.com/?s=huiju&t=abc')).toBeNull();
    expect(parseEntryQrLink(base, `${base}x?s=huiju&t=abc`)).toBeNull();
    expect(parseEntryQrLink(base, 'https://qr.example.com/other/checkin?s=huiju&t=abc')).toBeNull();
  });

  it('scene 超过 32 个字符、门店或 token 有不安全字符时生成就报错', () => {
    expect(() => entryQrScene({ storeId: 'huanqiugang', token: 'x'.repeat(20) })).toThrow();
    expect(() => entryQrParams({ storeId: 'huiju', token: 'a&b' })).toThrow();
  });
});
