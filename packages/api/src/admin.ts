import type { RevenueBucket, RevenueCategory, RevenueChannel } from '@climb/core';
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

/** 会员来源（members.source） */
export type MemberSource = 'walkin' | 'referral' | 'gift' | 'platform' | 'legacy_import';
export const MEMBER_SOURCES: readonly MemberSource[] = ['walkin', 'referral', 'gift', 'platform', 'legacy_import'];
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

export const CHANNEL_TEXT: Record<RevenueChannel, string> = {
  wechat: '微信支付',
  desk_cash: '现金',
  desk_pos: 'POS',
  desk_transfer: '转账',
  meituan: '美团、点评',
};

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
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
