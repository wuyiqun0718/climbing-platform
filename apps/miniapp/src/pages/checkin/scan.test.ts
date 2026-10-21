import { entryQrLink, entryQrScene } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { checkinUrl, fromPageQuery, fromScanCode } from './scan';

const base = 'https://qr.example.com/benchmark/checkin';
const code = { storeId: 'binggang', token: 'qr-3-a1b2c3' };
const want = { ok: true, qr: { storeId: 'binggang', qrToken: 'qr-3-a1b2c3' } };
const notOurs = { ok: false, reason: 'not-ours' };

describe('微信扫一扫打开签到页', () => {
  it('普通链接二维码：q 是编码过的整个链接（H5 下是解码过的）', () => {
    const link = entryQrLink(base, code);
    expect(fromPageQuery(base, { q: encodeURIComponent(link), scancode_time: '1792000000' })).toEqual(want);
    expect(fromPageQuery(base, { q: link })).toEqual(want);
  });

  it('小程序码：scene 是编码过的 s=…&t=…', () => {
    expect(fromPageQuery(base, { scene: encodeURIComponent(entryQrScene(code)) })).toEqual(want);
    expect(fromPageQuery(base, { scene: entryQrScene(code) })).toEqual(want);
  });

  it('小程序里扫码跳过来、登录完回来：直接带 s、t', () => {
    expect(fromPageQuery(base, { s: 'binggang', t: 'qr-3-a1b2c3' })).toEqual(want);
    expect(checkinUrl(want.qr)).toBe('/pages/checkin/confirm?s=binggang&t=qr-3-a1b2c3');
  });

  it('坏码：别的馆的链接、缺 token、乱码', () => {
    expect(fromPageQuery(base, { q: encodeURIComponent('https://qr.example.com/other/checkin?s=binggang&t=x') })).toEqual(notOurs);
    expect(fromPageQuery(base, { scene: 's%3Dbinggang' })).toEqual(notOurs);
    expect(fromPageQuery(base, { s: 'binggang' })).toEqual(notOurs);
    expect(fromPageQuery(base, { q: '%E0%A4%A' })).toEqual(notOurs);
  });

  it('什么都没带', () => {
    expect(fromPageQuery(base, {})).toEqual({ ok: false, reason: 'none' });
  });
});

describe('小程序里扫码（uni.scanCode）', () => {
  it('普通链接二维码：result 是链接', () => {
    expect(fromScanCode(base, { result: entryQrLink(base, code) })).toEqual(want);
  });

  it('本小程序的小程序码：看 path 里的 scene', () => {
    expect(fromScanCode(base, { result: '*garbled*', path: `pages/checkin/confirm?scene=${encodeURIComponent(entryQrScene(code))}` })).toEqual(want);
  });

  it('和微信扫一扫解析出同一个码，进同一个签到页', () => {
    const viaScan = fromScanCode(base, { result: entryQrLink(base, code) });
    const viaWx = fromPageQuery(base, { q: encodeURIComponent(entryQrLink(base, code)) });
    expect(viaScan).toEqual(viaWx);
  });

  it('不是入场码：别的网址、付款码、本小程序别的页面的码', () => {
    expect(fromScanCode(base, { result: 'https://example.com/' })).toEqual(notOurs);
    expect(fromScanCode(base, { result: '281234567890123456' })).toEqual(notOurs);
    expect(fromScanCode(base, { result: '', path: 'pages/share/claim?scene=abc' })).toEqual(notOurs);
    expect(fromScanCode(base, { result: '', path: 'pages/checkin/confirm' })).toEqual(notOurs);
    expect(fromScanCode(base, {})).toEqual(notOurs);
  });
});
