import type { DateKey } from '@climb/utils';
import type { GiftCard, ReferralVoucher, Share } from './types';

/**
 * 分享记录的状态（次卡转赠和老带新共用）：后台分享记录、小程序「已发记录」都按这里。
 * 状态值和文字跟小程序分支 mvp/miniapp 的 referral.ts（ReferralRecordState、referralRecords）、
 * pages/share/referral.vue 的 STATE_TEXT 同名同义；两边合并后统一成一份（小程序把文字挪进 core 时用这里的）。
 *
 * 全部由数据推导，不靠写死的字段：
 * - 还没人领（share.status = pending）：过了 expiresOn（含当天有效）是 expired，否则 pending。
 * - 领了：看领取人手里那张卡。体验券有 usedOn、好友送的次卡用掉过（remaining < total）是 used，否则 claimed。
 *   撤销入场把次数、体验券退回后会变回 claimed。share.status 是 used 的也算 used（小程序那边一样）。
 *
 * 等馆方（第 9 节「要问馆方」4）：次卡转赠过期没人领，次数退不退回原卡。现在只显示「过期了，没人领」，
 * 退回的流水（share_return）定了再接，状态不另加。
 */
export type ShareRecordState = 'pending' | 'expired' | 'claimed' | 'used';

export const SHARE_RECORD_STATES: readonly ShareRecordState[] = ['pending', 'expired', 'claimed', 'used'];

export const SHARE_RECORD_STATE_TEXT: Record<ShareRecordState, string> = {
  pending: '等朋友领取',
  expired: '过期了，没人领',
  claimed: '朋友领了，还没来',
  used: '朋友来过了',
};

export const SHARE_KIND_TEXT: Record<Share['kind'], string> = { count: '次卡转赠', referral: '老带新' };

/** 领取人因为这次分享拿到的卡：好友送的次卡或体验券；还没人领、或者卡找不到为 null */
export type ClaimedCard = Pick<GiftCard, 'kind' | 'total' | 'remaining'> | Pick<ReferralVoucher, 'kind' | 'usedOn'>;

export function shareRecordState(share: Pick<Share, 'status' | 'expiresOn'>, claimed: ClaimedCard | null, today: DateKey): ShareRecordState {
  if (share.status === 'pending') return share.expiresOn < today ? 'expired' : 'pending';
  if (share.status === 'used') return 'used';
  if (!claimed) return 'claimed';
  const used = claimed.kind === 'referral' ? !!claimed.usedOn : claimed.remaining < claimed.total;
  return used ? 'used' : 'claimed';
}
