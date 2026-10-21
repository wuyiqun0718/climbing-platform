import type { Card, CheckIn, LedgerEntry, Product, Share } from '@climb/core';
import { createHttp, type ClientOptions } from './client';

export * from './client';

/** 会员端：`GET /me` 的返回 */
export interface Me {
  id: string;
  name: string;
  phone: string;
  /** 当前版本的风险告知书签过没有 */
  waiverSigned: boolean;
}

/** `GET /me/cards/:id/ledger` 的一条：流水加上会员看得懂的上下文 */
export interface CardLedgerItem extends LedgerEntry {
  /** 入场的门店名 */
  storeName?: string;
}

/**
 * `POST /auth/wx-login` 的返回。
 * phoneBound 为 false 时 token 只能用来调 `POST /auth/phone`（第一次登录要验证手机号），别的接口返回 401。
 */
export interface WxLoginResult {
  token: string;
  phoneBound: boolean;
}

/** `POST /auth/phone` 的返回：换成正式的会员 token。legacyBound 表示对上了从青橙导入的老会员，老卡已经归到这个微信下 */
export interface PhoneBindResult {
  token: string;
  me: Me;
  legacyBound: boolean;
}

/**
 * 接口定义（后端还没开始写，路径是约定稿）。
 * 新增接口时在这里加方法，两个端都能直接用上。
 */
export function createApi(opts: ClientOptions) {
  const http = createHttp(opts);
  return {
    auth: {
      /** code 是 `uni.login` 拿到的 */
      wxLogin: (body: { code: string }) => http<WxLoginResult>('POST', '/auth/wx-login', body),
      /** code 是手机号快速验证（`button open-type="getPhoneNumber"`）给的，后端拿它换手机号 */
      phone: (body: { code: string }) => http<PhoneBindResult>('POST', '/auth/phone', body),
    },
    products: {
      list: () => http<Product[]>('GET', '/products'),
    },
    me: {
      get: () => http<Me>('GET', '/me'),
      cards: () => http<Card[]>('GET', '/me/cards'),
      /** 一张卡的使用记录，最新的在前 */
      cardLedger: (cardId: string) => http<CardLedgerItem[]>('GET', `/me/cards/${encodeURIComponent(cardId)}/ledger`),
    },
    checkIns: {
      /** 扫前台码入场：qrToken 是前台二维码里的内容 */
      create: (body: { qrToken: string; cardId: string }) => http<CheckIn>('POST', '/check-ins', body),
    },
    shares: {
      createCount: (body: { cardId: string; quantity: number }) => http<Share>('POST', '/shares/count', body),
      createReferral: () => http<Share>('POST', '/shares/referral'),
      get: (id: string) => http<Share>('GET', `/shares/${id}`),
      claim: (id: string) => http<{ share: Share; card: Card }>('POST', `/shares/${id}/claim`),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
