import type { Card, CheckIn, EntryOption, InsurancePolicy, LedgerEntry, Order, Product, RuleErrorCode, Share, WaiverSignature, WaiverVersion } from '@climb/core';
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

/** `GET /me/cards/:id/freeze`：这张卡现在能不能自助冻结、能冻几天、本月和今年还剩几次（null 为不限） */
export interface FreezeOptions {
  /** 不能冻结的原因；能冻结为 null */
  blockedBy: RuleErrorCode | null;
  minDays: number;
  maxDays: number;
  monthLeft: number | null;
  yearLeft: number | null;
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

/** 拉起微信支付要的参数，原样传给 `uni.requestPayment`（后端调微信下单接口后签名生成） */
export interface WxPayParams {
  timeStamp: string;
  nonceStr: string;
  /** `prepay_id=...` */
  package: string;
  signType: 'RSA';
  paySign: string;
}

/** `POST /orders` 的返回：待支付的订单和支付参数 */
export interface CreateOrderResult {
  order: Order;
  payment: WxPayParams;
}

export interface Store {
  id: string;
  name: string;
}

/** 前台平板入场码里的内容：门店和一次性 token（码的格式见 @climb/core entryQr.ts，小程序里的解析见 apps/miniapp/src/pages/checkin/scan.ts） */
export interface EntryQrBody {
  storeId: string;
  qrToken: string;
}

/** `POST /check-ins/preview` 的返回：扫的是哪家店、这次能用哪些卡（可用的在前）、今天是不是再次入场 */
export interface CheckInPreview {
  store: Store;
  /** 今天已经入过场（不管哪家店），这次不扣次（岩馆规则允许时） */
  reentry: boolean;
  options: EntryOption[];
  /** 今天已经投的那张保单；为 null 时这次入场会新投一张 */
  todayPolicy: InsurancePolicy | null;
  /** 还没签当前版本的风险告知书时，带上这一版让会员看完同意（先 `POST /waivers` 再入场）；签过为 null */
  waiver: WaiverVersion | null;
}

/** `POST /check-ins` 的返回：入场记录，加上门店名、是不是再次入场、当天的保单（新投的或复用的） */
export interface CheckInResult extends CheckIn {
  storeName: string;
  reentry: boolean;
  policy: InsurancePolicy;
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
      /** 期限卡自助冻结：先查能不能冻、能冻几天 */
      freezeOptions: (cardId: string) => http<FreezeOptions>('GET', `/me/cards/${encodeURIComponent(cardId)}/freeze`),
      /** 从今天起冻结 days 天，返回冻结后的卡；到期日等解冻时按实际冻结天数顺延 */
      freezeCard: (cardId: string, body: { days: number }) => http<Card>('POST', `/me/cards/${encodeURIComponent(cardId)}/freeze`, body),
      /** 提前解冻，今天就能用；返回解冻后的卡 */
      unfreezeCard: (cardId: string) => http<Card>('POST', `/me/cards/${encodeURIComponent(cardId)}/unfreeze`),
      /** 自己的订单，最新的在前 */
      orders: () => http<Order[]>('GET', '/me/orders'),
    },
    orders: {
      /** 下单：后端建待支付订单。卡要等微信支付回调（`POST /pay/wechat/notify`，微信调后端）验证过才发 */
      create: (body: { productId: string }) => http<CreateOrderResult>('POST', '/orders', body),
      /** 支付完以后查结果；还是待支付时后端会去微信查一次单补上回调 */
      get: (id: string) => http<Order>('GET', `/orders/${encodeURIComponent(id)}`),
      /** 接着付之前没付的订单（订单记录里的「去付款」）：重新拿支付参数，后端用同一个 out_trade_no 再调一次微信下单 */
      pay: (id: string) => http<CreateOrderResult>('POST', `/orders/${encodeURIComponent(id)}/pay`),
    },
    waivers: {
      /** 同意某一版风险告知书。不是当前版本（中间换了版）返回 409 waiver-outdated；同一版签过再签返回原来那条 */
      sign: (body: { waiverVersionId: string }) => http<WaiverSignature>('POST', '/waivers', body),
    },
    checkIns: {
      /** 扫了前台的码：验码（不作废），列出能用的卡、要不要先签告知书。码用过或过期返回 409 qr-used / qr-expired */
      preview: (body: EntryQrBody) => http<CheckInPreview>('POST', '/check-ins/preview', body),
      /**
       * 确认入场：成功后码作废；当天第一次入场新投一张保单，再次入场复用。没签当前版本的告知书返回 409 waiver-required。
       * idempotencyKey 由页面在进签到页时生成一次，网络重试、连点都带同一个，后端只入场一次、返回同一条记录。
       */
      create: (body: EntryQrBody & { cardId: string; idempotencyKey: string }) => http<CheckInResult>('POST', '/check-ins', body),
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
