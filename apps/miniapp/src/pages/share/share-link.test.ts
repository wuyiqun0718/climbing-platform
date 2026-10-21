import { describe, expect, it } from 'vitest';
import { claimPath, shareMessage } from './share-link';

describe('分享卡片', () => {
  it('路径只带 token', () => {
    expect(claimPath('Ab-_0123456789abcdefgh')).toBe('/pages/share/claim?t=Ab-_0123456789abcdefgh');
  });

  it('次卡转赠和老带新的标题', () => {
    const token = 'x'.repeat(22);
    expect(shareMessage({ kind: 'count', token, quantity: 2 }, '阿杰')).toEqual({
      title: '阿杰 送你 2 次攀岩入场', path: `/pages/share/claim?t=${token}`, imageUrl: '/static/gym/mark.png',
    });
    expect(shareMessage({ kind: 'referral', token }, '').title).toBe('朋友 邀请你免费来爬一次');
  });
});
