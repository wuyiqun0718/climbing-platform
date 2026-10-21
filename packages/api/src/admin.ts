import { MEMBER_SOURCES, type Card, type CardAdjustInput, type FreezeOverridable, type PeriodCard, type RuleErrorCode, type EntryCard, type EntryOption, type FreezeRules, type PolicyStatus, type DeskPayChannel, type OrderStatus, type RefundBasis, type RefundMethod, type RefundStatus, type LedgerEntry, type MemberSource, type PayChannel, type Product, type ProductInput, type ProductPatch, type RevenueBucket, type RevenueCategory, type RevenueChannel, type Share, type ShareRecordState, type StaffInput, type StaffPatch, type StaffRole, type AuditAction, type AuditLogEntry } from '@climb/core';
import type { Cents, DateKey } from '@climb/utils';
import { createHttp, type ClientOptions } from './client';

/**
 * 后台接口（后端还没开始写，路径是约定稿，见 docs/mvp-plan.md 第 6 节）。
 * 后台按 docs/tasks-dashboard.md 逐个加接口，后端照这里的类型实现。
 */

/** 角色、文字和员工账号的规则见 @climb/core 的 staff.ts */
export type { StaffRole };

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

/**
 * 员工账号（任务 22），规则都在 @climb/core 的 staff.ts。都要 staff.manage（只有老板），不是 403。
 * - GET /admin/staff：全部员工，停用的也列出来；在用的在前，再按角色（馆长、店长、前台）、建号先后。不返回密码。
 * - POST /admin/staff：新建（手机号、名字、角色、可操作门店、初始密码），校验用 core 的 newStaffErrors，不对的 400（data.field 是第一个错的字段）。
 * - PATCH /admin/staff/:id：只传要改的；password 是重置密码，active 是停用、启用。没有这个人 404；校验用 core 的 staffPatchErrors；
 *   停用自己、改自己的角色、改完没有在用的馆长 422（data.code 是 core 的 staffChangeBlockedBy）。
 * 可操作门店：allStores = true 存成 storeIds = []（全部门店）；否则至少一家存在的店。
 * 停用后登录 403（staff-inactive）；停用、重置密码后这个员工已经登录的 token 立即失效（401）。改自己的密码也一样，要重新登录。
 * 后端只存密码哈希（bcrypt / argon2）。每次改动写一条操作日志（audit_logs，任务 23 查）：新建、改资料（改前改后只记改了的字段）、重置密码（不记密码）。
 */
export interface StaffRow extends Staff {
  active: boolean;
  /** 建号时间（ISO 8601 带时区） */
  createdAt: string;
}

export type CreateStaffBody = StaffInput;
export type UpdateStaffBody = StaffPatch;

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
  method: RefundMethod;
}

/**
 * 卡种与价格（任务 19），规则都在 @climb/core 的 product.ts（名称、标价、卖点上限等等馆方的占位也在那里）。
 * - GET /admin/products：全部卡种（含下架的），按 core 的 sortProducts 排。登录的员工都能看（前台开卡要选）。
 * - POST /admin/products：新建，要 product.edit 和 product.price 两个权限（谁能改价等馆方，见 permissions.ts），不是 403；
 *   校验用 core 的 newProductErrors，不对的 400（data.field 是第一个错的字段）。返回建好的卡种。
 * - PATCH /admin/products/:id：只传要改的（名称、标价、卖点、上下架、排序），要 product.edit，改了标价还要 product.price，不是 403；
 *   没有这个卡种 404；品类和规格（天数、次数、有效月数）建好不能改，传了不一样的 400；校验用 core 的 productPatchErrors。返回改后的卡种。
 * 改价、改名只影响以后的订单：已有订单存的是下单时的快照（商品名、品类、标价），卡在下单时开好，都不跟着变。
 * 下架后小程序 GET /products 不再返回、不能下单，前台开卡 422（product-off-sale）；已经买了的卡照常用。操作日志等任务 23。
 */
export type CreateProductBody = ProductInput;
export type UpdateProductBody = ProductPatch;

/**
 * 操作日志 GET /admin/audit-logs?store=&action=&page=（任务 23），只读：没有改、删的接口（mock 对别的方法返回 405）。
 * 字段和动作见 @climb/core 的 audit.ts：谁（staffId、staffName）、什么时候（at）、对什么（targetType、targetId）、原因、改前改后（只记改了的字段，不记密码）。
 * 写日志的操作：线下收款开卡、前台登记入场、撤销入场、调整次数和有效期、冻结解冻、退款、新建和修改卡种（改价、上下架）、员工变更、改冻结规则。
 * 要能看操作日志页（permissions.ts 的 audit，等馆方）。门店：带 store 只看这家店的（必须是能看的店，否则 403；没有这家店 404）；
 * 不带是全部（含全馆的），只有 canSeeAllAuditLogs 的员工能这样查，不然 403。action 不对 400（data.field = action）。
 * 最新的在前，每页 AUDIT_PAGE_SIZE 条，页码规则同会员列表。
 */
export const AUDIT_PAGE_SIZE = 50;

export interface AuditLogRow extends AuditLogEntry {
  /** 操作员工的名字（停用了的也照常显示） */
  staffName: string;
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
  /** 按退成功的算（@climb/core 的 orderStatus） */
  status: OrderStatus;
  /** 这个订单开的卡；没有卡（单次票、活动、示例订单）为 null */
  cardId: string | null;
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
  /** 这次入场的保单（core 的 entryPolicy：按入场记录上的 policyId，同日再次入场沿用当天那张）；没有保单记录的（上线前、导入的）为 null */
  insurance: EntryInsurance | null;
  /** 撤销的才有：撤销时间（ISO 8601 带时区）、撤销人、原因；没撤销为 null */
  voidInfo: { at: string; byName: string; reason: string } | null;
}

/** 入场记录上的保单和它现在的状态（投保中、已投保、待退保……，文字见 core 的 POLICY_STATUS_TEXT） */
export interface EntryInsurance {
  policyId: string;
  status: PolicyStatus;
}

/**
 * 入场记录 GET /admin/check-ins?date=&store=（任务 20）：某一天、某家店（不带 store 是全部门店）的入场，扫码和前台登记的都有，撤销的也列出来。
 * - date 是 YYYY-MM-DD，不带是今天；格式不对 400（data.field = date）。
 * - 门店口径同财务页：没有这家店 404；只管部分门店的员工必须带自己的店，看别的店或全部门店 403。按入场的门店算（卡三店通用）。
 * - 按入场先后倒序（后入场的在前）。一天几百条以内，先不分页。
 * 撤销用 POST /admin/check-ins/:id/void（任务 16，前台也能），撤完重新拉这个列表。
 */
export interface CheckInList {
  storeId: string | null;
  date: DateKey;
  items: CheckInListRow[];
}

export interface CheckInListRow extends MemberEntryRow {
  memberId: string;
  memberName: string;
}

/**
 * 分享记录 GET /admin/shares?store=&kind=（任务 21）：次卡转赠和老带新邀请，最近发的在前（同一天后发的在前）。
 * - 状态由数据推导，规则和文字见 @climb/core 的 shareRecord.ts（跟小程序「已发记录」同名同义）：过期看 expiresOn，用没用看领取人那张卡。
 * - 门店按发起人的归属门店算（同看板老带新漏斗），口径同财务页：没有这家店 404；只管部分门店的员工必须带自己的店，否则 403。
 * - kind 不带是两种都要；不是 count / referral 的 400（data.field = kind）。先不分页。
 * 不返回分享 token（拿到就能领）。
 */
export interface ShareList {
  storeId: string | null;
  items: ShareRow[];
}

export interface ShareRow {
  id: string;
  kind: Share['kind'];
  /** 发起人的归属门店 */
  storeId: string;
  fromMemberId: string;
  fromMemberName: string;
  /** 没人领为 null */
  claimerId: string | null;
  claimerName: string | null;
  /** 次卡转赠送了几次；老带新为 null */
  quantity: number | null;
  createdOn: DateKey;
  /** 领取截止，也是领到的卡、体验券的到期日（含） */
  expiresOn: DateKey;
  state: ShareRecordState;
  /** used 的才有：朋友第一次用它入场的日期（撤销的不算） */
  usedOn: DateKey | null;
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

/**
 * 退款（任务 18），规则都在 @climb/core 的 refund.ts（用过一部分的怎么折算、退款方式等等馆方的占位也在那里）。
 * 都要 manager 以上（权限 order.refund，等馆方），不是 403；订单的门店必须是员工能操作的店，否则 403；没有这个订单 404。
 *
 * GET /admin/orders/:id/refund：退款前看还能退多少、建议退多少（core 的 suggestedRefund）、怎么退。不改数据。
 */
export interface RefundPreview {
  order: MemberOrderRow;
  memberName: string;
  /** 这个订单开的卡（退款前的样子），没有为 null */
  card: Card | null;
  /** 不能退的原因（没付款、美团的、退完了，core 的 refundBlockedBy），能退为 null */
  blockedBy: RuleErrorCode | null;
  /** 不能退的为 null */
  method: RefundMethod | null;
  /** 实付减已退（处理中的也算） */
  refundableCents: Cents;
  /** 建议退款金额，前台可以改 */
  suggestedCents: Cents;
  basis: RefundBasis;
  /** 以前的退款，按时间正序 */
  refunds: RefundRow[];
}

/**
 * POST /admin/orders/:id/refund：退 amountCents（大于 0、不超过实付减已退，超了 422 refund-exceeds），reason 必填（空的 400，data.field = reason）。
 * 不能退的 422（data.code 是 core 的 RuleErrorCode）。requestId 由弹窗每次打开时生成，同一个 requestId 重复提交只退一次，返回第一次的结果。
 * 成功后：记一张退款单；微信订单原路退（先 processing，等微信回调变 succeeded / failed；mock 当场回调成功），线下订单只记录（当场 succeeded）；
 * 订单开的卡改成已退款（status = refunded，不能再入场），次卡、课包剩下的次数清零，记一笔 refund 流水（备注是原因）；
 * 期限卡后面接着的、还没开始的期限卡往前挪，各记一笔 adjust。退成功的才算进财务页的退款和订单的已退。操作日志等任务 23。
 */
export interface RefundBody {
  requestId: string;
  amountCents: Cents;
  reason: string;
}

export interface RefundRow {
  id: string;
  orderId: string;
  amountCents: Cents;
  method: RefundMethod;
  status: RefundStatus;
  /** 退成功的日期，没成功的为 null */
  refundedOn: DateKey | null;
  reason: string;
  /** 发起时间（ISO 8601 带时区）和操作人；示例数据里的没有为空字符串 */
  at: string;
  byName: string;
}

export interface RefundResult {
  refund: RefundRow;
  order: MemberOrderRow;
  /** 退款后的卡，没有为 null */
  card: Card | null;
  /** 跟着往前挪的期限卡，没有为空数组 */
  followers: PeriodCard[];
}

export const ORDER_STATUS_TEXT: Record<OrderStatus, string> = {
  unpaid: '没付款',
  paid: '已付款',
  partially_refunded: '部分退款',
  refunded: '已退款',
};

export const REFUND_METHOD_TEXT: Record<RefundMethod, string> = {
  wechat_original: '微信原路退回',
  offline: '线下退',
};

export const REFUND_STATUS_TEXT: Record<RefundStatus, string> = {
  processing: '退款中',
  succeeded: '已退',
  failed: '退款失败',
};

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
    staff: {
      list: () => http<StaffRow[]>('GET', '/admin/staff'),
      create: (body: CreateStaffBody) => http<StaffRow>('POST', '/admin/staff', body),
      update: (id: string, body: UpdateStaffBody) => http<StaffRow>('PATCH', `/admin/staff/${encodeURIComponent(id)}`, body),
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
    /** 卡种列表（含下架的），按 core 的 sortProducts 排。开卡弹窗只列在售的 */
    products: {
      list: () => http<Product[]>('GET', '/admin/products'),
      create: (body: CreateProductBody) => http<Product>('POST', '/admin/products', body),
      update: (id: string, body: UpdateProductBody) => http<Product>('PATCH', `/admin/products/${encodeURIComponent(id)}`, body),
    },
    orders: {
      create: (body: CreateDeskOrderBody) => http<DeskOrderResult>('POST', '/admin/orders', body),
      refundPreview: (id: string) => http<RefundPreview>('GET', `/admin/orders/${encodeURIComponent(id)}/refund`),
      refund: (id: string, body: RefundBody) => http<RefundResult>('POST', `/admin/orders/${encodeURIComponent(id)}/refund`, body),
    },
    checkIns: {
      list: (q: { date?: DateKey; store?: string } = {}) => {
        const qs = new URLSearchParams();
        if (q.date) qs.set('date', q.date);
        if (q.store) qs.set('store', q.store);
        const s = qs.toString();
        return http<CheckInList>('GET', s ? `/admin/check-ins?${s}` : '/admin/check-ins');
      },
      preview: (body: CheckInPreviewBody) => http<CheckInPreview>('POST', '/admin/check-ins/preview', body),
      create: (body: CreateDeskCheckInBody) => http<DeskCheckInResult>('POST', '/admin/check-ins', body),
      void: (id: string, body: VoidCheckInBody) => http<VoidCheckInResult>('POST', `/admin/check-ins/${encodeURIComponent(id)}/void`, body),
    },
    shares: (q: { store?: string; kind?: Share['kind'] } = {}) => {
      const qs = new URLSearchParams();
      if (q.store) qs.set('store', q.store);
      if (q.kind) qs.set('kind', q.kind);
      const s = qs.toString();
      return http<ShareList>('GET', s ? `/admin/shares?${s}` : '/admin/shares');
    },
    auditLogs: (q: { store?: string; action?: AuditAction; page?: number } = {}) => {
      const qs = new URLSearchParams();
      if (q.store) qs.set('store', q.store);
      if (q.action) qs.set('action', q.action);
      if (q.page && q.page > 1) qs.set('page', String(q.page));
      const s = qs.toString();
      return http<PageOf<AuditLogRow>>('GET', s ? `/admin/audit-logs?${s}` : '/admin/audit-logs');
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
