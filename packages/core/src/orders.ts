import { addDays, addMonths, type Cents, type DateKey } from '@climb/utils';
import type { GymRules } from './gym';
import { isCardNormal, RuleError } from './rules';
import type { Card, PeriodCard, Product } from './types';

/** 和后端 orders.status 一致 */
export type OrderStatus = 'pending' | 'paid' | 'closed' | 'refunded' | 'partially_refunded';

/** 收款渠道：小程序里是 wechat，其余是前台线下收款 */
export type OrderChannel = 'wechat' | 'desk_cash' | 'desk_pos' | 'desk_transfer' | 'legacy';

/** 下单时的商品快照：以后改价、改天数不影响历史订单和发的卡 */
export type ProductSnapshot = Pick<Product, 'id' | 'category' | 'name' | 'priceCents' | 'days' | 'quantity' | 'validMonths'>;

export interface Order {
  id: string;
  memberId: string;
  /** 前台开单时记门店；小程序下单没有 */
  storeId?: string;
  product: ProductSnapshot;
  amountCents: Cents;
  channel: OrderChannel;
  status: OrderStatus;
  /** 下单时间（ISO） */
  createdAt: string;
  /** 过了这个时间还没付就关单（ISO） */
  expiresAt: string;
  paidAt?: string;
  wxTransactionId?: string;
  /** 付款后发的卡 */
  cardId?: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: '待支付',
  paid: '已支付',
  closed: '已关闭',
  refunded: '已退款',
  partially_refunded: '部分退款',
};

export const ORDER_CHANNEL_LABELS: Record<OrderChannel, string> = {
  wechat: '小程序',
  desk_cash: '前台现金',
  desk_pos: '前台刷卡',
  desk_transfer: '前台转账',
  legacy: '原系统',
};

export function snapshotOf(p: Product): ProductSnapshot {
  const { id, category, name, priceCents, days, quantity, validMonths } = p;
  return JSON.parse(JSON.stringify({ id, category, name, priceCents, days, quantity, validMonths }));
}

/** 建一个待支付的订单；只能买在售的商品，金额取当前价格 */
export function createOrder(args: { id: string; product: Product; memberId: string; channel: OrderChannel; now: Date; rules: GymRules; storeId?: string }): Order {
  const { product, now } = args;
  if (!product.onSale) throw new RuleError('product-off-sale', '这个已经不卖了');
  const order: Order = {
    id: args.id,
    memberId: args.memberId,
    product: snapshotOf(product),
    amountCents: product.priceCents,
    channel: args.channel,
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + args.rules.orderPayMinutes * 60_000).toISOString(),
  };
  if (args.storeId) order.storeId = args.storeId;
  return order;
}

/** 过了付款时限还是待支付的订单算关闭；后端由定时任务关单，mock 在查订单时顺手关 */
export function closeIfExpired(order: Order, now: Date): Order {
  return order.status === 'pending' && now.getTime() >= Date.parse(order.expiresAt) ? { ...order, status: 'closed' } : order;
}

/** 待支付、还没过付款时限的订单可以接着付（订单记录里的「去付款」） */
export const isPayable = (order: Order, now: Date) => closeIfExpired(order, now).status === 'pending';

/** 接着付之前没付的订单前检查；返回关单后的最新状态 */
export function assertPayable(order: Order, now: Date): Order {
  const current = closeIfExpired(order, now);
  if (current.status === 'closed') throw new RuleError('order-closed', '订单已经关闭了');
  if (current.status !== 'pending') throw new RuleError('order-not-pending', '这个订单已经付过了');
  return current;
}

/**
 * 收到并验证过的支付结果（微信回调或查单）。回调会重复到达：只有待支付的订单变成已支付，
 * 这时 issue 为 true，调用方发卡；已经付过的原样返回、issue 为 false，保证只发一次。
 * 还没被关单的待支付订单哪怕过了时限也认（钱已经扣了）；已关闭的订单不认，要人工退款。
 */
export function payOrder(order: Order, args: { at: string; transactionId: string; amountCents: Cents }): { order: Order; issue: boolean } {
  if (order.status === 'closed') throw new RuleError('order-closed', '订单已经关闭了');
  if (order.status !== 'pending') return { order, issue: false };
  if (args.amountCents !== order.amountCents) throw new RuleError('order-amount-mismatch', '支付金额和订单金额对不上');
  return { order: { ...order, status: 'paid', paidAt: args.at, wxTransactionId: args.transactionId }, issue: true };
}

/** 期限卡从哪天开始：今天；手上还有状态正常、没到期（含还没开始）的期限卡，就接在最晚那张到期日的次日。和后台一致 */
export function periodStartsOn(cards: readonly Card[], memberId: string, today: DateKey): DateKey {
  const latest = cards
    .filter((c): c is PeriodCard => c.kind === 'period' && c.memberId === memberId && c.expiresOn >= today && isCardNormal(c))
    .reduce<DateKey | null>((max, c) => (max === null || c.expiresOn > max ? c.expiresOn : max), null);
  return latest ? addDays(latest, 1) : today;
}

/**
 * 按商品快照发卡：
 * - 期限卡：从 periodStartsOn 起 days 天（含开始那天）
 * - 次卡、课包：今天起 validMonths 个月，到期日 = addMonths(今天, validMonths) - 1 天；没写有效期的（单次票）当天有效
 * cards 是这个会员现有的卡（算期限卡接续用）
 */
export function cardFromProduct(args: { id: string; product: ProductSnapshot; memberId: string; cards: readonly Card[]; today: DateKey }): Card {
  const { id, product: p, memberId, today } = args;
  const base = { id, memberId, productId: p.id, name: p.name };
  if (p.category === 'period') {
    if (!p.days) throw new Error(`期限卡 ${p.id} 没有天数`);
    const startsOn = periodStartsOn(args.cards, memberId, today);
    return { ...base, kind: 'period', startsOn, expiresOn: addDays(startsOn, p.days - 1) };
  }
  const total = p.quantity ?? 1;
  const expiresOn = p.validMonths ? addDays(addMonths(today, p.validMonths), -1) : today;
  return { ...base, kind: p.category, total, remaining: total, expiresOn };
}
