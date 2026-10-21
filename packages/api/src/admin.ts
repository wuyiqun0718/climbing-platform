import { MEMBER_SOURCES, type Card, type CardAdjustInput, type FreezeOverridable, type PeriodCard, type RuleErrorCode, type EntryCard, type EntryOption, type FreezeRules, type PolicyStatus, type DeskPayChannel, type LedgerEntry, type MemberSource, type PayChannel, type Product, type RevenueBucket, type RevenueCategory, type RevenueChannel } from '@climb/core';
import type { Cents, DateKey } from '@climb/utils';
import { createHttp, type ClientOptions } from './client';

/**
 * 后台接口（后端还没开始写，路径是约定稿，见 docs/mvp-plan.md 第 6 节）。
 * 后台按 docs/tasks-dashboard.md 逐个加接口，后端照这里的类型实现。
 */

export type StaffRole = 'owner' | 'manager' | 'desk';

export interface Store {
  id: string;
  name: string;
}

export interface Staff {
  id: string;
  name: string;
  phone: string;
  role: StaffRole;
  /** 能操作哪些店，空数组表示全部 */
  storeIds: string[];
}

export interface LoginResult {
  token: string;
  staff: Staff;
}

export interface DashboardSummary {
  /** 门店 ID；不传表示全部门店 */
  storeId: string | null;
  today: DateKey;
  monthRevenueCents: Cents;
  todayEntries: number;
  /** 上周同一天、截至同一时刻的入场人次 */
  lastWeekSameTimeEntries: number;
  /** 今日约课人次（团课 + 私教） */
  todayBookings: number;
  /**
   * 有效会员：手上有至少一张能用的卡（没过期、没用完、没冻结作废退款）的人。
   * 按门店看时算「归属这家店」的会员（等馆方：按办卡门店还是最近入场门店，先按办卡门店），
   * 一人只归一家店，所以全部门店 = 各店相加。
   */
  activeMembers: number;
  /** 本月新客按来源，五种来源都返回（没有的为 0），顺序同 MEMBER_SOURCES */
  newcomers: NewcomerRow[];
  /** 本月老带新：发出 → 领取 → 到店 → 办卡，每一步都是上一步的子集 */
  referral: ReferralFunnel;
  /** 快到期的期限卡（规则见 @climb/core 的 expiringPeriodCards），按到期日排 */
  expiring: ExpiringCardRow[];
  /** 门店对比，只在看全部门店时返回（只有能看全部门店的员工能拿到），按门店列表顺序；按单店看时为 null */
  stores: StoreCompareRow[] | null;
}

/** 看板「7 天内到期」的一行。按门店看时算会员的归属门店（同 activeMembers，等馆方） */
export interface ExpiringCardRow {
  cardId: string;
  cardName: string;
  memberId: string;
  memberName: string;
  /** 会员的归属门店 */
  storeId: string;
  expiresOn: DateKey;
}

/** 门店对比的一行，口径跟同名的单店数字一致 */
export interface StoreCompareRow {
  storeId: string;
  monthRevenueCents: Cents;
  todayEntries: number;
  activeMembers: number;
  /** 本月新客（各来源合计）和其中办卡的人数 */
  newcomers: number;
  newcomersBought: number;
}

/** 会员来源（members.source），定义在 @climb/core 的 member.ts */
export { MEMBER_SOURCES, type MemberSource };
export const MEMBER_SOURCE_TEXT: Record<MemberSource, string> = {
  walkin: '自己来的',
  referral: '老带新',
  gift: '好友送的次卡',
  platform: '美团、点评',
  legacy_import: '青橙导入',
};

/**
 * 新客：本月 1 日到今天第一次到店（first_visit_on）的会员，按第一次到店的门店算。
 * 办卡：其中到今天为止买过期限卡或次卡的人（单次票、好友送的次卡、体验券不算）。
 * 等馆方：「新客」按第一次到店还是第一次办卡；办卡含不含单次票。
 */
export interface NewcomerRow {
  source: MemberSource;
  visitors: number;
  bought: number;
}

/**
 * 老带新漏斗，按本月发出的邀请算（上个月发、这个月用的不算）。
 * 按门店看时算邀请人的归属门店（同 activeMembers，等馆方）。
 * - sent：发出的邀请；claimed：其中被领取的；visited：其中体验券已经用过（领取人到店）的；
 * - bought：其中领取人到今天为止买过期限卡或次卡的。
 */
export interface ReferralFunnel {
  sent: number;
  claimed: number;
  visited: number;
  bought: number;
}

/**
 * 财务页：按日期范围（含两头）、门店看营收和退款。口径见 @climb/core 的 summarizeRevenue
 * （营收按收款日、退款按退款成功日单列、青橙导入的不算，等馆方确认）。
 * 合计 = byChannel 之和 = byCategory 之和。只有 owner / manager 能看，只管部分门店的必须指定门店。
 */
export interface FinanceSummary {
  storeId: string | null;
  from: DateKey;
  to: DateKey;
  grossCents: Cents;
  refundCents: Cents;
  netCents: Cents;
  byChannel: RevenueBucket<RevenueChannel>[];
  byCategory: RevenueBucket<RevenueCategory>[];
  /** 区间内退款成功的退款单，按退款日期倒序 */
  refunds: FinanceRefundRow[];
}

export interface FinanceRefundRow {
  refundId: string;
  orderId: string;
  memberId: string;
  memberName: string;
  storeId: string;
  channel: RevenueChannel;
  category: RevenueCategory;
  /** 订单快照里的商品名 */
  productName: string;
  /** 原订单实付 */
  orderAmountCents: Cents;
  amountCents: Cents;
  refundedOn: DateKey;
  reason: string;
}

/** 后台列表的一页。page 从 1 开始；超出范围时后端夹到最后一页，以返回的 page 为准 */
export interface PageOf<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 会员列表每页条数 */
export const MEMBERS_PAGE_SIZE = 20;

/**
 * 会员列表 GET /admin/members?q=&page=
 * - q 去掉首尾空格后：全是数字按手机号包含查（前台常问后四位），否则按名字包含查；空的列出全部。
 * - 排序：最近入场的在前，没入场过的排最后；再按首次到店倒序。
 * - 哪些员工能看到哪些店的会员见 dashboard 的 permissions.ts（等馆方，先都能看全部）。
 */
export interface MemberListRow {
  id: string;
  name: string;
  /** 脱敏到中间四位，完整号码只在会员详情里给 */
  phoneMasked: string;
  source: MemberSource;
  /** 还没到过店（比如领了体验券没来）为 null */
  firstVisitOn: DateKey | null;
  /** 有效卡数，口径见 @climb/core 的 isCardValid */
  validCards: number;
  lastEntryOn: DateKey | null;
}

/** 会员详情里最近订单、最近入场各给几条（更早的去订单、入场记录页看） */
export const MEMBER_RECENT_LIMIT = 10;

/**
 * 会员详情 GET /admin/members/:id。没有这个人 404；能看哪些店的会员同会员列表。
 * 卡的展示文字和状态用 @climb/core 的 cardText / cardState，跟小程序一致。
 */
export interface MemberDetail {
  id: string;
  name: string;
  /** 完整手机号 */
  phone: string;
  source: MemberSource;
  /** 归属门店（按办卡门店，等馆方） */
  homeStoreId: string;
  firstVisitOn: DateKey | null;
  firstVisitStoreId: string | null;
  /** 风险告知书：没签过为 null（第一次入场时在小程序里签） */
  waiver: { signedOn: DateKey; version: string } | null;
  /** 所有的卡，包括过期、用完、冻结、作废、退款的；有效的在前，再按到期日倒序 */
  cards: Card[];
  /** 最近的订单，按下单（付款）日期倒序，最多 MEMBER_RECENT_LIMIT 条 */
  recentOrders: MemberOrderRow[];
  /** 最近的入场，按日期倒序，最多 MEMBER_RECENT_LIMIT 条，撤销的也列出来 */
  recentEntries: MemberEntryRow[];
}

/**
 * 新建会员（建档）POST /admin/members。校验和判重用 @climb/core 的 newMemberErrors / findMemberByPhone：
 * - phone 后端先 normalizePhone 再存；name 去掉首尾空格，选填；source 只能是 DESK_MEMBER_SOURCES 里的。
 * - storeId 是建档的门店，还没办卡时先当归属门店（归属按办卡门店，等馆方）；必须是员工能操作的店，否则 403。
 * - 填得不对 400（data.field 指出哪一项）；手机号已经有档案 409，data 是 MemberExistsError，页面据此跳到那个人。
 * 建好返回会员详情（还没来过店，firstVisitOn 为 null）。
 */
export interface CreateMemberBody {
  phone: string;
  name: string;
  source: MemberSource;
  storeId: string;
}

export interface MemberExistsError {
  code: 'member-exists';
  message: string;
  memberId: string;
  memberName: string;
}

export interface MemberOrderRow {
  id: string;
  storeId: string;
  /** 订单快照里的商品名 */
  productName: string;
  category: RevenueCategory;
  channel: PayChannel;
  amountCents: Cents;
  /** 没付款的为 null */
  paidOn: DateKey | null;
  /** 已经退成功的金额，没退过为 0 */
  refundedCents: Cents;
}

export type EntryMethod = 'scan' | 'desk';
export const ENTRY_METHOD_TEXT: Record<EntryMethod, string> = { scan: '扫码', desk: '前台登记' };

export interface MemberEntryRow {
  id: string;
  storeId: string;
  on: DateKey;
  /** 用的卡；没卡（买单次票、美团券直接入场）为 null */
  cardId: string | null;
  cardName: string;
  /** 扣了几次（期限卡、同日再次入场为 0） */
  deducted: number;
  method: EntryMethod;
  voided: boolean;
  /** 撤销的才有：撤销时间（ISO 8601 带时区）、撤销人、原因；没撤销为 null */
  voidInfo: { at: string; byName: string; reason: string } | null;
}

/**
 * 卡流水 GET /admin/cards/:id/ledger。没有这张卡 404；能看哪些会员的卡同会员详情。
 * entries 按发生时间正序，同一时刻按写入顺序；最后一笔的变化后剩余、到期日 = 卡上的（对账见 @climb/core 的 ledgerMismatch）。
 * 原因、变化量、变化后的文字用 @climb/core 的 LEDGER_REASON_TEXT / ledgerDeltaText / ledgerAfterText，跟小程序使用记录一致。
 */
export interface CardLedger {
  card: Card;
  memberName: string;
  entries: CardLedgerRow[];
}

export interface CardLedgerRow extends LedgerEntry {
  /** 操作人：员工名字、会员名字；system 为「系统」 */
  operatorName: string;
}

/**
 * 线下收款开卡 POST /admin/orders。校验和开卡规则用 @climb/core 的 deskOrderErrors / issueCard（等馆方的规则都集中在 core 的 order.ts）：
 * - channel 只能是 DESK_PAY_CHANNELS（现金、POS、转账）；amountCents 是实收，默认标价，跟标价不同必须带 priceReason。
 * - 卡种必须在售，否则 422（code: product-off-sale）；会员、卡种、门店没有 404；没权限或门店不是员工能操作的 403；填得不对 400（data.field 指出哪一项）。
 * - requestId 由弹窗每次打开时生成，同一个 requestId 重复提交只开一次卡，返回第一次的结果。
 * 成功后：订单记为已付（paidOn = 今天，商品名、品类、标价存快照），发卡，记一笔 purchase 流水（操作人是员工，改价原因写在备注）；
 * 会员第一次办期限卡或次卡时记下办卡日，归属门店改成这家店（归属按办卡门店，等馆方）。
 */
export interface CreateDeskOrderBody {
  requestId: string;
  memberId: string;
  productId: string;
  storeId: string;
  channel: DeskPayChannel;
  amountCents: Cents;
  priceReason: string;
}

export interface DeskOrderResult {
  order: MemberOrderRow;
  card: Card;
}

/**
 * 手动登记入场（会员手机没电时前台代登记）。规则都在 @climb/core 的 checkIn.ts（checkInPlan / checkInWith），等馆方的占位也集中在那里。
 * - POST /admin/check-ins/preview：列出这次能用的卡和各扣几次，不改数据。
 * - POST /admin/check-ins：用选的卡入场。requestId 由弹窗每次打开时生成，同一个 requestId 重复提交只入场一次，返回第一次的结果。
 * 同一天再次入场（撤销的不算）不扣次；没签告知书先不拦，返回 waiverSigned = false，页面提示前台让会员在小程序里补签。
 * 卡三店通用，门店是这次入场的门店，必须是员工能操作的店，否则 403；会员、门店、卡没有 404；卡现在不能用 422（data.code 是 @climb/core 的 RuleErrorCode）。
 * 成功后：写入场记录（method = desk），次卡扣次并记一笔 check_in 流水（操作人是员工），体验券记下用掉的日期；
 * 会员还没来过店的记下第一次到店（日期、门店）。
 * 保险按 @climb/core 的 insuranceForEntry：当天第一次入场新投一张（status = pending，带会员、门店、日期、checkInId），同一天再次入场复用当天那张。
 * 投保记录页见任务 33，撤销后退保见任务 16。
 */
export interface CheckInPreviewBody {
  memberId: string;
  storeId: string;
}

export interface CheckInPreview {
  memberId: string;
  memberName: string;
  storeId: string;
  /** 今天已经入过场，这次不扣次 */
  reentry: boolean;
  waiverSigned: boolean;
  insurance: CheckInInsurance;
  /** 能用的在前，规则见 @climb/core 的 checkInPlan；没有能用的卡为空数组（先去收款开卡，比如买单次票） */
  options: EntryOption[];
}

export interface CreateDeskCheckInBody extends CheckInPreviewBody {
  requestId: string;
  cardId: string;
}

export interface DeskCheckInResult {
  checkIn: MemberEntryRow;
  /** 入场后的卡 */
  card: EntryCard;
  deducted: number;
  reentry: boolean;
  waiverSigned: boolean;
  /** 这次入场的保单：新投的或复用的，policyId、status 一定有 */
  insurance: CheckInInsurance;
}

/**
 * 撤销入场 POST /admin/check-ins/:id/void。规则都在 @climb/core 的 voidCheckIn.ts。
 * 前台、店长、老板都能撤（权限 checkIn.void），扫码和前台登记的都能撤；入场的门店必须是员工能操作的店，否则 403；没有这条入场 404；
 * reason 必填，空的 400（data.field = reason）。
 * 成功后：入场记录标记撤销（时间、撤销人、原因）；次卡只退这次实际扣的次数（同日再次入场扣 0 的不退），退了就记一笔 check_in_void 流水（备注是原因）；
 * 同一天还有免扣再进的入场时，扣次转给最早那次（那条的 deducted 改掉，返回在 moved 里；同一张卡不退，记一笔 0 的流水；另一张卡就这张退、那张扣）；
 * 用掉的体验券在同一天没有别的入场时恢复成没用过；保单按 core 的规则改挂到同一天别的入场或标记待退保；会员的最近入场按没撤销的重新算。
 * 同一条入场重复撤销返回第一次的结果，不再退次。
 * 操作日志等任务 23 做了再写。
 */
export interface VoidCheckInBody {
  reason: string;
}

export interface VoidCheckInResult {
  checkIn: MemberEntryRow;
  /** 撤销后的卡；没卡的入场为 null */
  card: Card | null;
  /** 这张卡退回了几次；扣次转给同一张卡的另一次入场时为 0 */
  restored: number;
  /** 扣次转给了同一天的哪次入场（改后的那条）；转到另一张卡时带上扣过的那张卡。没转为 null */
  moved: { checkIn: MemberEntryRow; card: Card | null } | null;
  voucherRestored: boolean;
  /** 这次撤销改过的保单：改挂到别的入场后的、或者待退保的；保单不受影响为 null */
  insurance: { policyId: string; status: PolicyStatus; checkInId: string } | null;
}

/** 入场的保险：needed 为 true 是这次新投一张（预览里还没投，policyId、status 为 null）；false 是复用今天已有的那张 */
export interface CheckInInsurance {
  needed: boolean;
  policyId: string | null;
  status: PolicyStatus | null;
}

/**
 * 冻结规则 GET/PUT /admin/settings/freeze-rules。字段和默认值见 @climb/core 的 FreezeRules / defaultFreezeRules，
 * 小程序自助冻结和后台帮会员冻结都按这一份判断（core 的 freeze.ts）。
 * GET 登录的员工都能看（前台办冻结时要知道规则）；PUT 只有老板（权限 settings.freezeRules），不是 403。
 * PUT 要传全部字段，次数传 null 为不限；校验用 core 的 freezeRulesErrors，不对的 400（data.field 是第一个错的字段）。
 * 改了只影响以后的冻结，正在冻结的卡按冻结时定的天数走。返回保存后的规则。
 */
export type FreezeRulesBody = FreezeRules;

/**
 * 后台改卡（任务 17），规则都在 @climb/core 的 cardAdjust.ts 和 freeze.ts（冻结、解冻跟小程序同一份）。
 * 都要 manager 以上（权限 card.adjust / card.freeze），不是 403；没有这张卡 404；会员能不能看同会员详情；
 * 规则不让的 422（data.code 是 @climb/core 的 RuleErrorCode）；必填的原因没填 400（data.field 指出哪一项）。
 * 每次操作记一笔流水（操作人是员工）：调整记 adjust、冻结记 freeze、解冻记 unfreeze，备注写原因；
 * 后面接着的期限卡跟着挪了日期的，各记一笔 adjust。
 * 冻满了没解冻的卡每次请求前自动解冻（core 的 settleFreeze，操作人 system）。
 *
 * POST /admin/cards/:id/adjust：调次数、改到期日，reason 必填（core 的 adjustCard）。
 */
export type CardAdjustBody = CardAdjustInput;

export interface CardChangeResult<C extends Card = Card> {
  card: C;
  /** 跟着挪了日期的期限卡（续费买的、还没开始的），没有为空数组 */
  followers: PeriodCard[];
}

/**
 * GET /admin/cards/:id/freeze：后台帮冻前看规则和这个会员还剩几次（core 的 deskFreezeCheck，不看天数）。
 * blockedBy 不为 null 的破例也冻不了；needsOverride 不为空的要写原因破例（权限 card.freezeOverride）。
 */
export interface DeskFreezeOptions {
  blockedBy: RuleErrorCode | null;
  needsOverride: FreezeOverridable[];
  rules: FreezeRules;
  /** 本月、本年还能冻几次（会员自助和后台代办的都算），null 为不限 */
  monthLeft: number | null;
  yearLeft: number | null;
}

/**
 * POST /admin/cards/:id/freeze：从今天起冻 days 天（core 的 deskFreezePeriodCard）。
 * 超了冻结规则的要带 overrideReason，没带 422（data.code 是超的那条）；没破例权限的带了也 403。
 * note 选填，记在流水备注；会员不能自助冻结（memberSelfService 关了）不影响后台办。这次冻结计入会员的每月、每年次数。
 */
export interface DeskFreezeBody {
  days: number;
  note?: string;
  overrideReason?: string;
}

export interface DeskFreezeResult extends CardChangeResult<PeriodCard> {
  /** 破例了哪几条，没破例为空数组 */
  overridden: FreezeOverridable[];
}

/**
 * POST /admin/cards/:id/unfreeze：今天解冻（会员自助冻的也能提前解），今天就能入场；
 * 到期日按实际冻结天数顺延（core 的 unfreezePeriodCard）。没冻结的 422（card-not-frozen）。
 */
export interface DeskUnfreezeBody {
  note?: string;
}

export interface DeskUnfreezeResult extends CardChangeResult<PeriodCard> {
  /** 到期日顺延了几天 */
  days: number;
}

export const PAY_CHANNEL_TEXT: Record<PayChannel, string> = {
  wechat: '微信支付',
  desk_cash: '现金',
  desk_pos: 'POS',
  desk_transfer: '转账',
  meituan: '美团、点评',
  legacy: '青橙导入',
};

export const CHANNEL_TEXT: Record<RevenueChannel, string> = PAY_CHANNEL_TEXT;

export const REVENUE_CATEGORY_TEXT: Record<RevenueCategory, string> = {
  period: '期限卡',
  count: '次卡',
  single: '单次票',
  pt: '私教',
  class: '团课',
  event: '活动',
};

export function createAdminApi(opts: ClientOptions) {
  const http = createHttp(opts);
  return {
    auth: {
      login: (body: { phone: string; password: string }) => http<LoginResult>('POST', '/admin/auth/login', body),
      me: () => http<Staff>('GET', '/admin/auth/me'),
    },
    stores: {
      list: () => http<Store[]>('GET', '/admin/stores'),
    },
    dashboard: (q: { store?: string } = {}) =>
      http<DashboardSummary>('GET', q.store ? `/admin/dashboard?store=${encodeURIComponent(q.store)}` : '/admin/dashboard'),
    finance: (q: { from: DateKey; to: DateKey; store?: string }) => {
      const store = q.store ? `&store=${encodeURIComponent(q.store)}` : '';
      return http<FinanceSummary>('GET', `/admin/finance?from=${encodeURIComponent(q.from)}&to=${encodeURIComponent(q.to)}${store}`);
    },
    members: {
      list: (q: { q?: string; page?: number } = {}) => {
        const qs = new URLSearchParams();
        if (q.q?.trim()) qs.set('q', q.q.trim());
        if (q.page && q.page > 1) qs.set('page', String(q.page));
        const s = qs.toString();
        return http<PageOf<MemberListRow>>('GET', s ? `/admin/members?${s}` : '/admin/members');
      },
      get: (id: string) => http<MemberDetail>('GET', `/admin/members/${encodeURIComponent(id)}`),
      create: (body: CreateMemberBody) => http<MemberDetail>('POST', '/admin/members', body),
    },
    /** 卡种列表（含下架的），按品类、排序。开卡弹窗只列在售的；新建、改价、上下架见任务 19 */
    products: {
      list: () => http<Product[]>('GET', '/admin/products'),
    },
    orders: {
      create: (body: CreateDeskOrderBody) => http<DeskOrderResult>('POST', '/admin/orders', body),
    },
    checkIns: {
      preview: (body: CheckInPreviewBody) => http<CheckInPreview>('POST', '/admin/check-ins/preview', body),
      create: (body: CreateDeskCheckInBody) => http<DeskCheckInResult>('POST', '/admin/check-ins', body),
      void: (id: string, body: VoidCheckInBody) => http<VoidCheckInResult>('POST', `/admin/check-ins/${encodeURIComponent(id)}/void`, body),
    },
    settings: {
      freezeRules: () => http<FreezeRules>('GET', '/admin/settings/freeze-rules'),
      saveFreezeRules: (body: FreezeRulesBody) => http<FreezeRules>('PUT', '/admin/settings/freeze-rules', body),
    },
    cards: {
      ledger: (id: string) => http<CardLedger>('GET', `/admin/cards/${encodeURIComponent(id)}/ledger`),
      adjust: (id: string, body: CardAdjustBody) => http<CardChangeResult>('POST', `/admin/cards/${encodeURIComponent(id)}/adjust`, body),
      freezeOptions: (id: string) => http<DeskFreezeOptions>('GET', `/admin/cards/${encodeURIComponent(id)}/freeze`),
      freeze: (id: string, body: DeskFreezeBody) => http<DeskFreezeResult>('POST', `/admin/cards/${encodeURIComponent(id)}/freeze`, body),
      unfreeze: (id: string, body: DeskUnfreezeBody = {}) => http<DeskUnfreezeResult>('POST', `/admin/cards/${encodeURIComponent(id)}/unfreeze`, body),
    },
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
