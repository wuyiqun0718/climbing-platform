import type { Share } from '@climb/core';

/** 领取页（任务 26）。分享路径里只带 token，不带分享 id */
export const CLAIM_PAGE = '/pages/share/claim';

export const claimPath = (token: string) => `${CLAIM_PAGE}?t=${encodeURIComponent(token)}`;

/** 发到微信里的小程序卡片：标题、路径、封面图（跟原型的分享卡片一致） */
export function shareMessage(share: Pick<Share, 'kind' | 'token' | 'quantity'>, fromName: string) {
  const who = fromName || '朋友';
  return {
    title: share.kind === 'count' ? `${who} 送你 ${share.quantity} 次攀岩入场` : `${who} 邀请你免费来爬一次`,
    path: claimPath(share.token),
    imageUrl: '/static/gym/mark.png',
  };
}
