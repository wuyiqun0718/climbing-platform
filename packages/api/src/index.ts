import type { Card, CheckIn, ClassBooking, ClassBookingStatus, ClassSession, PtBooking, PtBookingStatus, PtSlot, PtSlotMark, EntryCard, EntryOption, InsurancePolicy, LedgerEntry, Order, Product, ReferralRecordState, ReferralStatus, ReferralWait, RuleErrorCode, Share, ShareDisplayStatus, WaiverHistory, WaiverSignature, WaiverVersion } from '@climb/core';
import { createHttp, type ClientOptions } from './client';

export * from './client';

/** 会员端：`GET /me` 的返回 */
export interface Me {
  id: string;
  name: string;
  phone: string;
  /** 当前版本的风险告知书签过没有 */
  waiverSigned: boolean;
  /**
   * 这个人也是本馆在用的教练（员工账号的手机号跟会员验证过的手机号一样）：小程序里多出「我的排班」，能调 `/coach/*`。
   * 不是为 null
   */
  coach: { id: string; name: string } | null;
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

/** `POST /check-ins`、`GET /check-ins/:id` 的返回：入场记录，加上门店名、卡名、是不是再次入场、当天的保单（新投的或复用的） */
export interface CheckInResult extends CheckIn {
  storeName: string;
  cardName: string;
  cardKind: EntryCard['kind'];
  reentry: boolean;
  policy: InsurancePolicy;
}

/** `GET /check-ins/referral-wait`：老带新领取人在等邀请人入场（@climb/core referralWait），加上邀请人的名字；不用等为 null */
export interface ReferralWaitInfo extends ReferralWait {
  inviterName: string;
}

/** 保单下面的一次入场 */
export interface PolicyCheckInItem extends Pick<CheckIn, 'id' | 'on'> {
  storeName: string;
  cardName: string;
  /** 是不是投这张保单的那次入场（否则是同日再次入场沿用） */
  first: boolean;
}

/** 一张保单：投保那次入场的门店，加上它保的那几次入场（按 @climb/core policyHistory 归） */
export interface PolicyRecord extends InsurancePolicy {
  storeName: string;
  checkIns: PolicyCheckInItem[];
}

/** `GET /me/insurance`：我的 → 保险与告知书。保单最近的在前；告知书是当前版本、签没签、签过的各版（@climb/core waiverHistory） */
export interface MyInsurance {
  policies: PolicyRecord[];
  waiver: WaiverHistory;
}

/** 老带新的一条已发记录。还在等领取的带 token，可以再发一次给朋友 */
export interface ReferralRecordView extends Pick<Share, 'token' | 'createdOn' | 'expiresOn'> {
  state: ReferralRecordState;
  /** 领取人的名字；没人领为 null */
  claimerName: string | null;
  usedOn: string | null;
}

/** `GET /me/referrals`：老带新页。本月名额和不能发的原因（@climb/core referralStatus），加上发过的邀请（referralRecords） */
export interface MyReferrals {
  status: ReferralStatus;
  records: ReferralRecordView[];
}

/**
 * `GET /shares/:token`：朋友点开分享看到的内容。按 token 查，不返回分享 id、原卡、领取人。
 * 没登录也能看；mine 是当前登录的会员自己发的（没登录为 false）。
 */
export interface ShareView extends Pick<Share, 'token' | 'kind' | 'quantity' | 'createdOn' | 'expiresOn' | 'status'> {
  fromName: string;
  mine: boolean;
  /** 显示用的状态（@climb/core shareDisplayStatus），文字用 SHARE_STATUS_TEXT */
  display: ShareDisplayStatus;
  /** 当前登录的会员就是领取人 */
  claimedByMe: boolean;
  /** 当前的人能不能领（@climb/core claimBlockedBy）；没登录只看分享本身；自己领过的为 null，看 claimedByMe */
  blockedBy: RuleErrorCode | null;
}

/** `POST /shares/:token/claim` 的返回。again：同一个人重复领（重试、连点），返回第一次领到的卡，不会多一张 */
export interface ClaimResult {
  share: ShareView;
  card: Card;
  again: boolean;
}

/**
 * `GET /classes` 课表里的一节课：ClassSession（后台 `GET /admin/classes` 读写的是同一份结构），
 * 加上门店、教练名字和名额（@climb/core sessionSeats），还有当前会员在这节课上的预约。
 * 只返回正常（scheduled）和被岩馆取消（cancelled，带 cancelReason）的课。
 */
export interface ClassSessionView extends ClassSession {
  storeName: string;
  coachName: string | null;
  booked: number;
  waitlisted: number;
  /** 还剩几个名额 */
  left: number;
  /**
   * 我在这节课上占着的预约（已约或候补）；没登录或没约为 null。
   * position 是候补排第几；cancelBlockedBy 是现在能不能自己取消（@climb/core cancelBlockedBy），能为 null
   */
  myBooking: { id: string; status: Extract<ClassBookingStatus, 'booked' | 'waitlisted'>; position: number | null; cancelBlockedBy: RuleErrorCode | null } | null;
  /**
   * 我现在能不能约（@climb/core bookBlockedBy）；能为 null，这时 left 为 0 表示约了会排候补。
   * 没登录时只看课本身（取消了、开始了），课包和名额等登录后再看
   */
  bookBlockedBy: RuleErrorCode | null;
}

/** `GET /stores`：岩馆的门店 */
export interface Store {
  id: string;
  name: string;
}

/** 我的一条团课预约：预约本身，加上那节课、用的课包、候补排第几、能不能自己取消 */
export interface MyClassBooking extends ClassBooking {
  session: Pick<ClassSessionView, 'id' | 'name' | 'storeId' | 'storeName' | 'coachName' | 'on' | 'startTime' | 'minutes' | 'status' | 'cancelReason'>;
  cardName: string;
  /** 候补排第几（从 1 开始，@climb/core waitlistPosition）；不是候补为 null */
  position: number | null;
  /** 自助取消截止时间（ISO），开课前 classRules.cancelBeforeMinutes 分钟；候补开课前都能取消 */
  cancelDeadline: string;
  /** 现在能不能自己取消（@climb/core cancelBlockedBy）；能为 null */
  cancelBlockedBy: RuleErrorCode | null;
}

/** `POST /class-bookings/:id/cancel` 的返回：取消后的预约。退次、候补补位都在后端一起做好 */
export type CancelClassBookingResult = MyClassBooking;

/** `GET /coaches?store=`：能约私教的教练（后台教练资料，mvp/dashboard 任务 28） */
export interface Coach {
  id: string;
  name: string;
  tags: string[];
  bio: string;
  /** 在哪几家店接私教 */
  storeIds: string[];
}

/**
 * 会员看到的私教时段：只有能不能约，不告诉会员格子是被谁占的（别的会员、线下约的、教练不接课都显示「约不了」）。
 * 后台时间轴用 @climb/core 的 PtSlot（free / member / offline / off），那是另一个接口。
 */
export interface PtSlotView {
  /** 开始的整点，比如 14 是 14:00–15:00 */
  hour: number;
  /** 现在能约（@climb/core ptBookBlockedBy 只剩「没课包」或者没拦）；已过、被占、我这个时间约了别的教练都为 false */
  available: boolean;
  /** 我自己约的这一格 */
  mine: { bookingId: string; status: Extract<PtBookingStatus, 'pending' | 'booked'> } | null;
}

/** `GET /coaches/:id/slots`：一位教练 from 起 days 天的时段，每天按 GymRules.ptRules 的营业时间每小时一格 */
export interface CoachSlots {
  coach: Coach;
  days: { on: string; slots: PtSlotView[] }[];
  /** 当前会员有没有能用的私教课包：没有为 'pt-no-card'（页面引导去买）；没登录为 null */
  cardBlockedBy: RuleErrorCode | null;
}

/** 我的一节私教：预约本身，加上教练、门店、课包名，取消截止时间和现在能不能自己取消 */
export interface MyPtBooking extends PtBooking {
  coachName: string;
  storeName: string;
  cardName: string;
  /** 自助取消截止时间（ISO），上课前 ptRules.cancelBeforeMinutes 分钟 */
  cancelDeadline: string;
  /** 现在能不能自己取消（@climb/core ptCancelBlockedBy）；能为 null */
  cancelBlockedBy: RuleErrorCode | null;
}

/**
 * 教练端「我的排班」的一格：@climb/core 的 PtSlot（free / member / offline / off，跟后台时间轴一样），
 * 会员约的带上会员名字和预约状态（等确认还是约上了），自己标的带上标记内容。
 */
export interface CoachSlotView extends PtSlot {
  booking: { id: string; memberName: string; status: Extract<PtBookingStatus, 'pending' | 'booked' | 'attended' | 'absent'>; storeName: string } | null;
  mark: Pick<PtSlotMark, 'id' | 'kind' | 'note'> | null;
}

/** `GET /coach/schedule`：教练自己 from 起 days 天的格子；needConfirm 是 ptRules.needCoachConfirm，pendingCount 是等我确认的预约数 */
export interface CoachSchedule {
  coach: { id: string; name: string };
  needConfirm: boolean;
  pendingCount: number;
  days: { on: string; slots: CoachSlotView[] }[];
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
    stores: {
      /** 门店列表，课表按门店看、首页「今日团课」用；不用登录 */
      list: () => http<Store[]>('GET', '/stores'),
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
      /** 历次保单（每张挂着它保的入场）和签过的风险告知书 */
      insurance: () => http<MyInsurance>('GET', '/me/insurance'),
      /** 老带新：本月名额、不能发的原因、已发记录（最近的在前） */
      referrals: () => http<MyReferrals>('GET', '/me/referrals'),
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
      /** 自己的一条入场记录，入场成功页用（刷新页面也能再拉到） */
      get: (id: string) => http<CheckInResult>('GET', `/check-ins/${encodeURIComponent(id)}`),
      /** 老带新领取人：是不是在等邀请人入场、邀请人到了没有。邀请人入场后的提醒走订阅消息（任务 40），这里给页面刷新用 */
      referralWait: () => http<ReferralWaitInfo | null>('GET', '/check-ins/referral-wait'),
    },
    classes: {
      /**
       * 课表：from（默认今天）起 days 天（默认 7），按日期、开始时间排；store 不填为三家店都看。
       * 没登录也能看，myBooking 为 null
       */
      list: (q: { store?: string; from?: string; days?: number } = {}) => {
        const qs = Object.entries(q)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&');
        return http<ClassSessionView[]>('GET', qs ? `/classes?${qs}` : '/classes');
      },
      /**
       * 约课：有名额约上并扣团课课包（流水 class_book），满员按规则排候补（不扣次）。cardId 不填用最先到期的课包。
       * idempotencyKey 由页面点「预约」时生成一次，重试、连点都带同一个，只约一次、返回同一条。
       * 不能约返回 409（class-no-card / class-full / class-already-booked …，@climb/core bookBlockedBy）
       */
      book: (sessionId: string, body: { cardId?: string; idempotencyKey: string }) =>
        http<MyClassBooking>('POST', `/classes/${encodeURIComponent(sessionId)}/bookings`, body),
      /** 取消自己的预约：截止前取消退次（class_cancel），空出的名额由候补第一位补上（扣次记 class_book）；截止后返回 409 class-cancel-too-late */
      cancel: (bookingId: string) => http<CancelClassBookingResult>('POST', `/class-bookings/${encodeURIComponent(bookingId)}/cancel`),
      /** 我的预约：所有状态都返回，按开课时间排，最近要上的在前，上过的、取消的在后 */
      mine: () => http<MyClassBooking[]>('GET', '/me/class-bookings'),
    },
    pt: {
      /** 教练列表；store 填了只列在这家店接私教的教练。不用登录 */
      coaches: (q: { store?: string } = {}) => http<Coach[]>('GET', q.store ? `/coaches?store=${encodeURIComponent(q.store)}` : '/coaches'),
      /** 一位教练 from（默认今天）起 days 天（默认 7）的时段。没登录也能看，mine 为 null */
      slots: (coachId: string, q: { from?: string; days?: number } = {}) => {
        const qs = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
        return http<CoachSlots>('GET', `/coaches/${encodeURIComponent(coachId)}/slots${qs ? `?${qs}` : ''}`);
      },
      /**
       * 约私教：扣 1 节私教课时（流水 pt_book，关联预约）。要教练确认时状态是 pending。
       * idempotencyKey 由页面点「确认」时生成一次，重试、连点只约一次。
       * 这一格被占了返回 409 pt-slot-taken（两个人抢同一格只有一个成功），其他见 @climb/core ptBookBlockedBy；
       * 教练不在这家店接私教返回 400 coach-not-at-store
       */
      book: (body: { coachId: string; storeId: string; on: string; hour: number; cardId?: string; idempotencyKey: string }) =>
        http<MyPtBooking>('POST', '/pt-bookings', body),
      /** 取消自己的私教：截止前退课时（pt_cancel）；截止后返回 409 pt-cancel-too-late，要找前台 */
      cancel: (bookingId: string) => http<MyPtBooking>('POST', `/pt-bookings/${encodeURIComponent(bookingId)}/cancel`),
      /** 我的私教预约：还没上的在前（近的在前），上过的、取消的在后 */
      mine: () => http<MyPtBooking[]>('GET', '/me/pt-bookings'),
    },
    /**
     * 教练端（小程序里的「我的排班」）。只有 Me.coach 不为 null 的人能调，别人返回 403 not-coach；
     * 教练只能看、改自己的格子和自己的预约，别的教练的返回 404。
     */
    coach: {
      schedule: (q: { from?: string; days?: number } = {}) => {
        const qs = Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
        return http<CoachSchedule>('GET', `/coach/schedule${qs ? `?${qs}` : ''}`);
      },
      /** 占一格：线下约的学员或有事不接课（@climb/core markPtSlot）。会员约了的格子返回 409 pt-slot-taken；占了以后会员那边马上约不了 */
      mark: (body: { on: string; hour: number; kind: PtSlotMark['kind']; note?: string }) => http<PtSlotMark>('POST', '/coach/slots', body),
      /** 取消自己占的格子，格子空出来会员能约 */
      unmark: (markId: string) => http<null>('DELETE', `/coach/slots/${encodeURIComponent(markId)}`),
      /** 确认会员的预约（ptRules.needCoachConfirm 开着时，@climb/core confirmPtBooking） */
      confirm: (bookingId: string) => http<CoachSlotView['booking']>('POST', `/coach/pt-bookings/${encodeURIComponent(bookingId)}/confirm`),
      /** 取消或拒绝会员的预约：必须写原因（会员看得到），退课时记 pt_void（@climb/core coachCancelPtBooking） */
      cancel: (bookingId: string, body: { reason: string }) => http<null>('POST', `/coach/pt-bookings/${encodeURIComponent(bookingId)}/cancel`, body),
    },
    shares: {
      /**
       * 次卡转赠：从 cardId 拆出 quantity 次，原卡立刻扣次并记 share_out 流水。返回带 token 的分享，
       * 小程序在 onShareAppMessage 里把领取页路径带上 token 发出去（不用 id）。不能转赠的卡返回 409 + 原因（@climb/core shareBlockedBy）
       */
      createCount: (body: { cardId: string; quantity: number }) => http<Share>('POST', '/shares/count', body),
      /** 发老带新邀请。没有正在用的期限卡、期限卡冻结中、本月名额用完返回 409（no-period-card / referral-card-frozen / referral-quota-used） */
      createReferral: () => http<Share>('POST', '/shares/referral'),
      /** token 是分享路径里带的；查不到返回 404 share-not-found */
      get: (token: string) => http<ShareView>('GET', `/shares/${encodeURIComponent(token)}`),
      /**
       * 领取。自己发的、已被别人领、过期、退回、老带新领取人不是新客返回 409（@climb/core claimBlockedBy）。
       * 幂等：同一个人重复领返回第一次的结果（again 为 true）；并发领只有一个成功，后端靠事务和 status 条件更新兜底
       */
      claim: (token: string) => http<ClaimResult>('POST', `/shares/${encodeURIComponent(token)}/claim`),
    },
  };
}

export type Api = ReturnType<typeof createApi>;
