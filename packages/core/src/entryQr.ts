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

/**
 * 码里写的内容（前台平板生成、小程序解析，两边按同一个格式）。两种码都是 `s=<门店>&t=<token>`：
 * - 小程序码：整串放进 scene（微信限制最多 32 个字符），页面是签到页；
 * - 普通链接二维码：`<岩馆的入场链接>?s=<门店>&t=<token>`，微信后台配置这个前缀跳转到签到页。
 * 门店 id 和 token 只用字母、数字、`-`、`_`，不用转义。
 */
export interface EntryQrPayload {
  storeId: string;
  token: string;
}

/** 小程序码 scene 的长度上限（微信限制） */
export const ENTRY_QR_SCENE_MAX = 32;

const SAFE = /^[A-Za-z0-9_-]+$/;

export function entryQrParams(p: EntryQrPayload): string {
  if (!SAFE.test(p.storeId) || !SAFE.test(p.token)) throw new Error('门店 id 和 token 只能用字母、数字、-、_');
  return `s=${p.storeId}&t=${p.token}`;
}

/** 小程序码的 scene；太长会被微信拒，提前报错 */
export function entryQrScene(p: EntryQrPayload): string {
  const scene = entryQrParams(p);
  if (scene.length > ENTRY_QR_SCENE_MAX) throw new Error(`scene 超过 ${ENTRY_QR_SCENE_MAX} 个字符：${scene}`);
  return scene;
}

/** 普通链接二维码的内容；linkBase 是岩馆配置里的入场链接（GymConfig.entryQrLink） */
export function entryQrLink(linkBase: string, p: EntryQrPayload): string {
  return `${linkBase}?${entryQrParams(p)}`;
}

/** 解析 `s=...&t=...`（顺序不限，多余的参数忽略）；不是这个格式返回 null */
export function parseEntryQrParams(params: string): EntryQrPayload | null {
  const map: Record<string, string> = {};
  for (const pair of params.split('&')) {
    const i = pair.indexOf('=');
    if (i > 0) map[pair.slice(0, i)] = pair.slice(i + 1);
  }
  const { s, t } = map;
  return s && t && SAFE.test(s) && SAFE.test(t) ? { storeId: s, token: t } : null;
}

/** 解析普通链接二维码：前缀要正好是本馆的入场链接，否则返回 null（别的馆、别的网址） */
export function parseEntryQrLink(linkBase: string, url: string): EntryQrPayload | null {
  const prefix = `${linkBase}?`;
  if (!url.startsWith(prefix)) return null;
  return parseEntryQrParams(url.slice(prefix.length).split('#')[0]);
}
