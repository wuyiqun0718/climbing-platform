import { describe, expect, it } from 'vitest';
import { isShareToken, newShareToken, SHARE_TOKEN_BYTES } from './shareToken';

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const base64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('分享 token', () => {
  it('128 位随机数编成 22 个 base64url 字符，能放进路径不用转义', () => {
    const t = newShareToken(rand);
    expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(isShareToken(t)).toBe(true);
    expect(SHARE_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(128);
  });

  it('编码和 base64url 一致', () => {
    const bytes = rand(SHARE_TOKEN_BYTES);
    expect(newShareToken(() => bytes)).toBe(base64url(bytes));
    expect(newShareToken(() => new Uint8Array(16))).toBe('AAAAAAAAAAAAAAAAAAAAAA');
  });

  it('每次都不一样', () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newShareToken(rand)));
    expect(tokens.size).toBe(1000);
  });

  it('随机数字节数不够就报错，不悄悄生成短 token', () => {
    expect(() => newShareToken(() => new Uint8Array(8))).toThrow();
  });

  it('格式不对的不算 token', () => {
    for (const t of ['', 'share-1', 'a'.repeat(21), 'a'.repeat(23), `${'a'.repeat(21)}/`, 12, null]) expect(isShareToken(t)).toBe(false);
  });
});
