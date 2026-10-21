import { daysBetween, type Cents, type DateKey } from '@climb/utils';

/**
 * 财务统计口径。后台财务页和后端都按这里算，页面和 mock 里不另写。
 *
 * 等馆方（老板/财务）确认的口径，先用下面的占位，确认后只改这个文件：
 * 1. 营收按收款日（paidOn）算，不按卡的使用摊销；退款按退款成功那天（refundedOn）算，
 *    所以退款可能落在跟原订单不同的区间里。
 * 2. 退款单列：营收是退款前的金额，净收入 = 营收 − 退款；退款记回原订单的门店、渠道、品类。
 * 3. 青橙导入的历史订单（legacy）不算营收，见 REVENUE_CHANNELS。
 * 4. 美团按核销那天、按券的售价记营收（还是按美团结算给馆里的金额，等馆方）。
 * 5. 一次最多查 FINANCE_MAX_RANGE_DAYS 天。
 */

/** 收款渠道（orders.channel） */
export type PayChannel = 'wechat' | 'desk_cash' | 'desk_pos' | 'desk_transfer' | 'meituan' | 'legacy';

/** 算进营收的渠道，也是财务页上的顺序 */
export const REVENUE_CHANNELS = ['wechat', 'desk_cash', 'desk_pos', 'desk_transfer', 'meituan'] as const satisfies readonly PayChannel[];
export type RevenueChannel = (typeof REVENUE_CHANNELS)[number];

/** 财务上的品类：卡种品类再加上单次票和活动报名 */
export type RevenueCategory = 'period' | 'count' | 'single' | 'pt' | 'class' | 'event';
export const REVENUE_CATEGORIES: readonly RevenueCategory[] = ['period', 'count', 'single', 'pt', 'class', 'event'];

export const FINANCE_MAX_RANGE_DAYS = 366;

/** 统计要用到的订单字段（订单上存的是下单时的快照，改价、改品类不影响历史） */
export interface RevenueOrder {
  id: string;
  storeId: string;
  channel: PayChannel;
  category: RevenueCategory;
  amountCents: Cents;
  /** 收款日；没付款的为 null */
  paidOn: DateKey | null;
}

export interface RevenueRefund {
  id: string;
  orderId: string;
  amountCents: Cents;
  /** 退款成功的日期；没成功（处理中、失败）的为 null，不算 */
  refundedOn: DateKey | null;
}

export interface RevenueBucket<K extends string> {
  key: K;
  /** 区间内收款的订单数 */
  orders: number;
  grossCents: Cents;
  /** 区间内退款成功的笔数和金额 */
  refunds: number;
  refundCents: Cents;
}

export interface RevenueSummary {
  grossCents: Cents;
  refundCents: Cents;
  netCents: Cents;
  /** 每个渠道、品类都返回（没有的为 0），顺序同 REVENUE_CHANNELS / REVENUE_CATEGORIES */
  byChannel: RevenueBucket<RevenueChannel>[];
  byCategory: RevenueBucket<RevenueCategory>[];
  /** 区间内算进来的退款，按退款日期倒序 */
  refunds: RevenueRefund[];
}

/** 日期范围是否合法：from ≤ to，且不超过 FINANCE_MAX_RANGE_DAYS 天 */
export function financeRangeError(from: DateKey, to: DateKey): string | null {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) return '日期格式不对';
  if (from > to) return '开始日期不能晚于结束日期';
  if (daysBetween(from, to) + 1 > FINANCE_MAX_RANGE_DAYS) return `一次最多查 ${FINANCE_MAX_RANGE_DAYS} 天`;
  return null;
}

const isRevenueChannel = (c: PayChannel): c is RevenueChannel => (REVENUE_CHANNELS as readonly PayChannel[]).includes(c);

/**
 * 按日期范围（含两头）汇总营收和退款。门店过滤由调用方先做（传进来的就是要算的订单）；
 * 退款只看 orders 里有的订单，所以按门店过滤订单也就过滤了退款。
 */
export function summarizeRevenue(orders: RevenueOrder[], refunds: RevenueRefund[], from: DateKey, to: DateKey): RevenueSummary {
  const inRange = (d: DateKey | null): d is DateKey => d !== null && d >= from && d <= to;
  const counted = new Map(orders.filter(o => isRevenueChannel(o.channel)).map(o => [o.id, o]));
  const bucket = <K extends string>(key: K): RevenueBucket<K> => ({ key, orders: 0, grossCents: 0, refunds: 0, refundCents: 0 });
  const byChannel = new Map(REVENUE_CHANNELS.map(k => [k as RevenueChannel, bucket(k as RevenueChannel)]));
  const byCategory = new Map(REVENUE_CATEGORIES.map(k => [k, bucket(k)]));

  for (const o of counted.values()) {
    if (!inRange(o.paidOn)) continue;
    for (const b of [byChannel.get(o.channel as RevenueChannel)!, byCategory.get(o.category)!]) {
      b.orders += 1;
      b.grossCents += o.amountCents;
    }
  }
  const rs = refunds.filter(r => inRange(r.refundedOn) && counted.has(r.orderId));
  for (const r of rs) {
    const o = counted.get(r.orderId)!;
    for (const b of [byChannel.get(o.channel as RevenueChannel)!, byCategory.get(o.category)!]) {
      b.refunds += 1;
      b.refundCents += r.amountCents;
    }
  }

  const channels = [...byChannel.values()];
  const grossCents = channels.reduce((n, b) => n + b.grossCents, 0);
  const refundCents = channels.reduce((n, b) => n + b.refundCents, 0);
  return {
    grossCents,
    refundCents,
    netCents: grossCents - refundCents,
    byChannel: channels,
    byCategory: [...byCategory.values()],
    refunds: rs.sort((a, b) => b.refundedOn!.localeCompare(a.refundedOn!)),
  };
}
