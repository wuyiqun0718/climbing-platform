import { describe, expect, it } from 'vitest';
import { ENTRY_QR_TTL_SECONDS, newEntryQr, parseEntryQrLink, parseEntryQrParams, useEntryQr } from './entryQr';
import { DESK_QR_REFRESH_SECONDS, deskQrContent, deskQrRefreshAt, deskQrReusable, entryQrIssuedAt, newDeskToken, secondsUntil } from './deskQr';

const issued = new Date('2026-10-21T02:00:00.000Z');
const later = (s: number) => new Date(issued.getTime() + s * 1000);
const bytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);

describe('平板入场码', () => {
  it('token 只用 entryQr 允许的字符，默认 16 个', () => {
    const t = newDeskToken(bytes);
    expect(t).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(() => newDeskToken(() => new Uint8Array(3))).toThrow();
  });

  it('平板生成的两种码都能被小程序那边的解析函数解析出门店和 token', () => {
    const p = { storeId: 'huanqiu', token: newDeskToken(bytes) };
    const base = 'https://qr.example.com/benchmark/checkin';
    expect(parseEntryQrLink(base, deskQrContent('link', base, p))).toEqual(p);
    const scene = deskQrContent('scene', base, p);
    expect(scene.length).toBeLessThanOrEqual(32);
    expect(parseEntryQrParams(scene)).toEqual(p);
  });

  it('30 秒换码是显示刷新，token 的有效期仍是 180 秒', () => {
    const qr = newEntryQr({ token: 't', storeId: 'bingang', now: issued });
    expect(entryQrIssuedAt(qr)).toEqual(issued);
    expect(deskQrRefreshAt(qr)).toEqual(later(DESK_QR_REFRESH_SECONDS));
    expect(Date.parse(qr.expiresAt)).toBe(later(ENTRY_QR_TTL_SECONDS).getTime());
  });

  it('换码时间前、没用过的接着显示；到点了或用掉了就换', () => {
    const qr = newEntryQr({ token: 't', storeId: 'bingang', now: issued });
    expect(deskQrReusable(qr, later(29))).toBe(true);
    expect(deskQrReusable(qr, later(30))).toBe(false);
    expect(deskQrReusable(useEntryQr(qr, 'm1', later(5)), later(6))).toBe(false);
    expect(deskQrReusable(undefined, issued)).toBe(false);
  });

  it('倒计时按服务器时间，向上取整，不小于 0', () => {
    expect(secondsUntil(later(30), later(0.2))).toBe(30);
    expect(secondsUntil(later(30), later(29.5))).toBe(1);
    expect(secondsUntil(later(30), later(31))).toBe(0);
  });
});
