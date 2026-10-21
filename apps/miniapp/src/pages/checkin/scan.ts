import type { EntryQrBody } from '@climb/api';
import { parseEntryQrLink, parseEntryQrParams, type EntryQrPayload } from '@climb/core';
import { pageUrl } from '../../lib/auth';

/** 签到页。微信扫一扫（两种码）和小程序里扫码都进这一页 */
export const CHECKIN_PAGE = 'pages/checkin/confirm';

/**
 * 解析结果。not-ours：扫到了东西，但不是本馆的入场码；none：页面参数里没有码（比如直接打开了签到页）
 */
export type ScanResult = { ok: true; qr: EntryQrBody } | { ok: false; reason: 'not-ours' | 'none' };

const toBody = (p: EntryQrPayload | null): ScanResult => (p ? { ok: true, qr: { storeId: p.storeId, qrToken: p.token } } : { ok: false, reason: 'not-ours' });

/** 微信小程序给的参数没解码（q、scene 都是编码过的），H5 解码过了；解码失败就按原样 */
function decode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/**
 * 签到页 onLoad 的参数 → 码。三种来源：
 * - `s`、`t`：小程序里扫码后跳过来、登录完回来，已经解析好了
 * - `q`：微信扫普通链接二维码打开，是整个链接（编码过）
 * - `scene`：微信扫小程序码打开（编码过）
 */
export function fromPageQuery(linkBase: string, query: Record<string, string | undefined>): ScanResult {
  if (query.s || query.t) return toBody(parseEntryQrParams(`s=${query.s ?? ''}&t=${query.t ?? ''}`));
  if (query.q) return toBody(parseEntryQrLink(linkBase, decode(query.q)));
  if (query.scene) return toBody(parseEntryQrParams(decode(query.scene)));
  return { ok: false, reason: 'none' };
}

/**
 * `uni.scanCode` 的结果 → 码。
 * 扫的是本小程序的小程序码时微信给 `path`（页面 + `?scene=...`）；普通二维码只有 `result`（码里的文字）。
 */
export function fromScanCode(linkBase: string, res: { result?: string; path?: string }): ScanResult {
  if (res.path) {
    const [route, qs = ''] = res.path.replace(/^\//, '').split('?');
    if (route !== CHECKIN_PAGE) return { ok: false, reason: 'not-ours' };
    const scene = qs.split('&').find(kv => kv.startsWith('scene='));
    return scene ? fromPageQuery(linkBase, { scene: scene.slice(6) }) : { ok: false, reason: 'not-ours' };
  }
  return toBody(parseEntryQrLink(linkBase, (res.result ?? '').trim()));
}

/** 跳去签到页的地址（码已经解析好） */
export const checkinUrl = (qr: EntryQrBody) => pageUrl({ route: CHECKIN_PAGE, query: { s: qr.storeId, t: qr.qrToken } });

export const NOT_OURS_MESSAGE = '这不是本馆的入场码，扫前台平板上的码';
