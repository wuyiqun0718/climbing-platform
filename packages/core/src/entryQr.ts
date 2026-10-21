import { RuleError } from './rules';

/**
 * 前台平板上的动态入场码（docs/mvp-plan.md 5.3，第 9 节已定）：码里是门店和一次性 token，后端签发。
 * 扫码后先预览（不作废），确认入场成功才作废；过期或用过的码不能再入场。平板每 30 秒换一个码，用掉了马上换。
 *
 * ENTRY_QR_TTL_SECONDS：签发后多久过期。比换码间隔长，留出会员扫码后登录、选卡、签告知书的时间。
 * 不是馆方定的，是技术上的取舍，先按 3 分钟，后端接上以后按实际情况调。
 */
export const ENTRY_QR_TTL_SECONDS = 180;

/** 一个入场码（对应后端签发的记录） */
export interface EntryQr {
  token: string;
  storeId: string;
  /** 过期时间（ISO） */
  expiresAt: string;
  /** 用过才有：哪位会员、什么时候 */
  usedAt?: string;
  usedBy?: string;
}

export function newEntryQr(args: { token: string; storeId: string; now: Date }): EntryQr {
  return { token: args.token, storeId: args.storeId, expiresAt: new Date(args.now.getTime() + ENTRY_QR_TTL_SECONDS * 1000).toISOString() };
}

/** 这个码现在还能不能用来入场：用过的、过期的抛 RuleError */
export function checkEntryQr(qr: EntryQr, now: Date): void {
  if (qr.usedAt) throw new RuleError('qr-used', '这个码已经用过了，扫平板上新的码');
  if (now.getTime() > Date.parse(qr.expiresAt)) throw new RuleError('qr-expired', '这个码过期了，扫平板上新的码');
}

/** 入场成功后作废这个码 */
export function useEntryQr(qr: EntryQr, memberId: string, now: Date): EntryQr {
  checkEntryQr(qr, now);
  return { ...qr, usedAt: now.toISOString(), usedBy: memberId };
}
