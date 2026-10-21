import type { DeskQrKind } from '@climb/core';
import type { DateKey } from '@climb/utils';
import { createHttp, type ClientOptions } from './client';

/**
 * 前台平板接口（任务 37）。平板不用员工登录，用绑定设备时拿到的设备 token（ClientOptions.getToken 返回它，放在 Authorization: Bearer 里）。
 * 设备怎么绑定见 @climb/api admin.ts 的 POST /admin/desk-devices。
 *
 * GET /desk/qr：这台设备所在门店现在该显示的入场码。规则见 @climb/core 的 deskQr.ts 和 entryQr.ts（跟小程序分支一致）：
 * - 没到换码时间（签发后 30 秒）、也没被用掉的，返回同一个码；到点了或用掉了就签发新的。token 180 秒内有效、用过一次就作废。
 * - kind 是 link（content 是普通二维码里的网址）或 scene（content 是小程序码的 scene）。
 * - imageUrl：后端生成好的码图片（普通二维码按 content 生成，小程序码调微信 getUnlimited），data: URL 或有时效的链接；
 *   mock 不生成图片，为 null，平板页先显示 content（前端不另外引二维码库）。
 * - 平板按 serverTime 算跟本机的时差，倒计时到 refreshAt；拉不到（断网）就不再显示旧码。
 * 设备 token 不对或解绑了 401。
 */
export interface DeskQr {
  storeId: string;
  storeName: string;
  kind: DeskQrKind;
  content: string;
  /** 码的图片；mock 为 null */
  imageUrl: string | null;
  token: string;
  /** 这个码签发、该换、过期的时间（ISO） */
  issuedAt: string;
  refreshAt: string;
  expiresAt: string;
  /** 服务器现在的时间（ISO），平板用它算倒计时 */
  serverTime: string;
  today: DateKey;
}

export function createDeskApi(opts: ClientOptions) {
  const http = createHttp(opts);
  return {
    qr: () => http<DeskQr>('GET', '/desk/qr'),
  };
}

export type DeskApi = ReturnType<typeof createDeskApi>;
