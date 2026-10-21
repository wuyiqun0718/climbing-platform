import { ENTRY_QR_TTL_SECONDS, entryQrLink, entryQrScene, type EntryQr, type EntryQrPayload } from './entryQr';

/**
 * 前台平板的动态入场码（任务 37）。码的内容、有效期、作废都按 entryQr.ts（跟小程序分支逐字一致），小程序用那边的 parseEntryQrLink / parseEntryQrParams 解析。
 *
 * 已定：
 * - 平板每 DESK_QR_REFRESH_SECONDS 秒换一个码（显示刷新）；token 有效期仍是 ENTRY_QR_TTL_SECONDS（留时间登录、选卡、签告知书），用过一次就作废，用掉了平板马上换。
 * - 设备绑定一家门店，码只给这家店签发。
 * - 两种码都留着：link 是普通链接二维码（GymConfig.entryQrLink + s、t），scene 是小程序码的 scene（最多 32 个字符），用哪种由 GET /desk/qr 返回。
 * - 倒计时按服务器时间算：接口带 serverTime，平板记下跟本机的时差。
 *
 * 等馆方 / 技术取舍的占位：DEFAULT_DESK_QR_KIND 先用普通链接二维码（小程序码要后端调微信接口生成图片）。
 */
export const DESK_QR_REFRESH_SECONDS = 30;

export type DeskQrKind = 'link' | 'scene';

export const DEFAULT_DESK_QR_KIND: DeskQrKind = 'link';

/** token 的字符：跟 entryQr.ts 的要求一致（字母、数字、-、_） */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * 入场码 token：bytes 字节密码学安全的随机数编码成字母数字（每字节取 6 位）。默认 16 字节 → 16 个字符（96 位），
 * 小程序码的 scene「s=<门店>&t=<token>」在门店 id 不超过 11 个字符时不超过 32。randomBytes 后端用 node:crypto，浏览器用 crypto.getRandomValues。
 */
export function newDeskToken(randomBytes: (n: number) => Uint8Array, bytes = 16): string {
  const b = randomBytes(bytes);
  if (b.length !== bytes) throw new Error(`token 要 ${bytes} 字节随机数`);
  return Array.from(b, x => ALPHABET[x & 63]).join('');
}

/** 码是什么时候签发的（entryQr 只存过期时间） */
export const entryQrIssuedAt = (qr: Pick<EntryQr, 'expiresAt'>) => new Date(Date.parse(qr.expiresAt) - ENTRY_QR_TTL_SECONDS * 1000);

/** 平板该换下一个码的时间：签发后 DESK_QR_REFRESH_SECONDS 秒 */
export const deskQrRefreshAt = (qr: Pick<EntryQr, 'expiresAt'>) => new Date(entryQrIssuedAt(qr).getTime() + DESK_QR_REFRESH_SECONDS * 1000);

/** 平板现在的码还能接着显示吗：没用过、没到换码时间（换码时间远早于过期） */
export function deskQrReusable(qr: EntryQr | undefined, now: Date): qr is EntryQr {
  return !!qr && !qr.usedAt && now.getTime() < deskQrRefreshAt(qr).getTime();
}

/** 码里写的内容：普通链接二维码的网址，或小程序码的 scene */
export function deskQrContent(kind: DeskQrKind, linkBase: string, p: EntryQrPayload): string {
  return kind === 'link' ? entryQrLink(linkBase, p) : entryQrScene(p);
}

/** 离 at 还有几秒（向上取整，不小于 0）；now 用服务器时间（本机时间加时差） */
export function secondsUntil(at: string | Date, now: Date): number {
  return Math.max(0, Math.ceil((new Date(at).getTime() - now.getTime()) / 1000));
}
