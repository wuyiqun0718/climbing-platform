import { addDays, daysBetween, type Cents, type DateKey } from '@climb/utils';
import type { PayChannel } from './finance';
import { followersAfter, periodEndOn } from './freeze';
import type { LedgerEntry } from './ledger';
import { RuleError, type RuleErrorCode } from './rules';
import type { Card, PeriodCard } from './types';

/**
 * 退款（任务 18）：能不能退、最多退多少、建议退多少、怎么退、退完卡和订单变成什么样。
 * 后台退款弹窗、mock 和后端都按这里。
 *
 * 等馆方确认的，先用下面的占位，确认后只改这个文件：
 * 1. 用过一部分的卡怎么折算（suggestedRefund，只是建议金额，前台可以改）：
 *    次卡、课包按「剩余次数 / 总次数」，送给朋友的次数算用掉了；
 *    期限卡按「剩余天数 / 总天数」，冻结的天数不算已用、也不算进总天数，今天算剩余（冻结中的从冻结那天起算剩余）；
 *    没有卡的订单（单次票、活动）和作废、已退款的卡不折算，建议金额 = 还能退的 / 0；按比例算出来不到 1 分的零头舍掉。
 * 2. 退款金额：大于 0、不超过实付减已退（处理中的也算已退）；不管改没改建议金额都要写原因。
 * 3. 退款方式按原订单的渠道（REFUND_METHOD_BY_CHANNEL）：微信支付原路退回；现金、POS、转账、青橙导入的线下退（后台只记录）；
 *    美团的不在这里退（去美团后台退）。
 * 4. 一个订单可以分几次退（比如补退），合计不超过实付；第一次退就把卡改成已退款、不能再入场，次卡、课包剩下的次数清零。
 * 5. 退的是期限卡时，后面接着的期限卡（续费买的、还没开始的）往前挪，接在空出来的那天：
 *    这张卡还没开始的从它的开始日，已经开始的从今天（冻结中的也是今天）。
 * 谁能退款见 dashboard 的 permissions.ts 的 order.refund（先放店长以上）。
 */

export type RefundMethod = 'wechat_original' | 'offline';

/** 退款单的状态：线下退的当场成功；微信原路退先处理中，等微信回调成功或失败 */
export type RefundStatus = 'processing' | 'succeeded' | 'failed';

/** 订单状态：已退 = 退成功的合计等于实付，部分退 = 退成功了一部分 */
export type OrderStatus = 'unpaid' | 'paid' | 'partially_refunded' | 'refunded';

/** 原订单渠道 → 退款方式；null 是不能在后台退的 */
export const REFUND_METHOD_BY_CHANNEL: Record<PayChannel, RefundMethod | null> = {
  wechat: 'wechat_original',
  desk_cash: 'offline',
  desk_pos: 'offline',
  desk_transfer: 'offline',
  legacy: 'offline',
  meituan: null,
};

/** 退款要用到的订单字段 */
export interface RefundOrder {
  channel: PayChannel;
  amountCents: Cents;
  paidOn: DateKey | null;
}

/** 这个订单以前的退款 */
export interface RefundLike {
  amountCents: Cents;
  status: RefundStatus;
}

/** 还能退多少：实付减已退（处理中的也算），没付款的为 0 */
export function refundableCents(order: RefundOrder, refunds: readonly RefundLike[]): Cents {
  if (!order.paidOn) return 0;
  const taken = refunds.filter(r => r.status !== 'failed').reduce((n, r) => n + r.amountCents, 0);
  return Math.max(0, order.amountCents - taken);
}

/** 订单状态，只看退成功的 */
export function orderStatus(order: Pick<RefundOrder, 'amountCents' | 'paidOn'>, refunds: readonly RefundLike[]): OrderStatus {
  if (!order.paidOn) return 'unpaid';
  const done = refunds.filter(r => r.status === 'succeeded').reduce((n, r) => n + r.amountCents, 0);
  if (done <= 0) return 'paid';
  return done >= order.amountCents ? 'refunded' : 'partially_refunded';
}

/** 这个订单现在能不能退（不看金额）；能退返回 null */
export function refundBlockedBy(order: RefundOrder, refunds: readonly RefundLike[]): RuleErrorCode | null {
  if (!order.paidOn) return 'order-not-paid';
  if (!REFUND_METHOD_BY_CHANNEL[order.channel]) return 'refund-channel-unsupported';
  if (refundableCents(order, refunds) <= 0) return 'order-fully-refunded';
  return null;
}

const REFUND_BLOCKED_TEXT: Partial<Record<RuleErrorCode, string>> = {
  'order-not-paid': '这个订单还没付款',
  'refund-channel-unsupported': '美团的订单去美团后台退',
  'order-fully-refunded': '这个订单已经退完了',
};

/**
 * 期限卡已经冻结过、已经解冻了的天数（不含正在冻结的这次）：解冻时到期日顺延了几天就是冻了几天。
 * entries 是这张卡的流水，按写入顺序。
 */
export function pastFrozenDays(entries: readonly LedgerEntry[], cardId: string): number {
  let prev: DateKey | null = null;
  let days = 0;
  for (const e of entries) {
    if (e.cardId !== cardId) continue;
    if (e.reason === 'unfreeze' && prev) days += Math.max(0, daysBetween(prev, e.expiresOnAfter));
    prev = e.expiresOnAfter;
  }
  return days;
}

/** 折算的依据：次卡、课包看次数，期限卡看天数；none 是不折算（没有卡、作废或已经退过） */
export type RefundBasis =
  | { kind: 'count'; remaining: number; total: number }
  | { kind: 'period'; remainingDays: number; totalDays: number; frozenDays: number }
  | { kind: 'none' };

/** 期限卡剩几天、一共几天（冻结的天数两边都不算） */
function periodBasis(card: PeriodCard, frozenDays: number, today: DateKey): Extract<RefundBasis, { kind: 'period' }> {
  const totalDays = Math.max(0, daysBetween(card.startsOn, card.expiresOn) + 1 - frozenDays);
  const from = card.status === 'frozen' && card.frozenFrom ? card.frozenFrom : today;
  const start = from > card.startsOn ? from : card.startsOn;
  const remainingDays = Math.min(totalDays, Math.max(0, daysBetween(start, card.expiresOn) + 1));
  return { kind: 'period', remainingDays, totalDays, frozenDays };
}

/**
 * 建议退多少（占位公式，见文件开头第 1 条）。card 是这个订单开的卡，没有为 null；
 * frozenDays 是这张卡已经冻结过的天数（pastFrozenDays）。不会超过还能退的。
 */
export function suggestedRefund(args: {
  order: RefundOrder; refunds: readonly RefundLike[]; card: Card | null; frozenDays: number; today: DateKey;
}): { cents: Cents; basis: RefundBasis } {
  const { order, card } = args;
  const max = refundableCents(order, args.refunds);
  const status = card?.status ?? 'normal';
  if (!card) return { cents: max, basis: { kind: 'none' } };
  if (status === 'void' || status === 'refunded' || card.kind === 'referral') return { cents: 0, basis: { kind: 'none' } };
  const basis: RefundBasis = card.kind === 'period'
    ? periodBasis(card, args.frozenDays, args.today)
    : { kind: 'count', remaining: card.remaining, total: card.total };
  const [left, all] = basis.kind === 'period' ? [basis.remainingDays, basis.totalDays] : [basis.remaining, basis.total];
  const cents = all > 0 ? Math.floor((order.amountCents * left) / all) : 0;
  return { cents: Math.min(max, cents), basis };
}

/** 折算依据的文字：剩 6/10 次；剩 40/90 天（冻结的 7 天不算） */
export function refundBasisText(basis: RefundBasis): string {
  if (basis.kind === 'count') return `剩 ${basis.remaining}/${basis.total} 次`;
  if (basis.kind === 'period') return `剩 ${basis.remainingDays}/${basis.totalDays} 天${basis.frozenDays ? `（冻结的 ${basis.frozenDays} 天不算）` : ''}`;
  return '';
}

/**
 * 退款。cards 是这个会员所有的卡（期限卡退了以后挪后面的卡用）。
 * 返回退款方式和初始状态、退款后的卡（没有卡为 null）和次数变化、跟着往前挪的期限卡。
 * 不能退的、金额超了的抛 RuleError；金额不是正整数分 refund-amount-invalid；原因没写 reason-required。
 */
export function planRefund(args: {
  order: RefundOrder; refunds: readonly RefundLike[]; card: Card | null; cards: readonly Card[]; amountCents: number; reason: string; today: DateKey;
}): { method: RefundMethod; status: RefundStatus; card: Card | null; delta: number; followers: PeriodCard[] } {
  const { order, card, amountCents: a, today } = args;
  const blocked = refundBlockedBy(order, args.refunds);
  if (blocked) throw new RuleError(blocked, REFUND_BLOCKED_TEXT[blocked]!);
  if (!Number.isInteger(a) || a <= 0) throw new RuleError('refund-amount-invalid', '退款金额要大于 0，最多两位小数');
  const max = refundableCents(order, args.refunds);
  if (a > max) throw new RuleError('refund-exceeds', `最多还能退 ${(max / 100).toFixed(2)} 元`);
  if (!args.reason.trim()) throw new RuleError('reason-required', '写一下退款的原因');
  const method = REFUND_METHOD_BY_CHANNEL[order.channel]!;
  const status: RefundStatus = method === 'offline' ? 'succeeded' : 'processing';

  const cur = card?.status ?? 'normal';
  if (!card || cur === 'void' || cur === 'refunded') return { method, status, card, delta: 0, followers: [] };
  if (card.kind === 'period') {
    const { frozenFrom: _f, frozenUntil: _u, ...rest } = card;
    const refunded: PeriodCard = { ...rest, status: 'refunded' };
    return { method, status, card: refunded, delta: 0, followers: followersPulledIn(card, args.cards, today) };
  }
  if (card.kind === 'referral') return { method, status, card: { ...card, status: 'refunded' }, delta: 0, followers: [] };
  return { method, status, card: { ...card, status: 'refunded', remaining: 0 }, delta: -card.remaining, followers: [] };
}

/** 期限卡退了，后面接着的、还没开始的期限卡往前挪到空出来的那天（见文件开头第 5 条）；已经用完的卡不动后面的 */
function followersPulledIn(card: PeriodCard, cards: readonly Card[], today: DateKey): PeriodCard[] {
  if (periodEndOn(card) < today) return [];
  const slot = card.startsOn > today ? card.startsOn : today;
  // 当成在空出来的前一天到期的正常卡，后面的卡就接到 slot 开始
  const { frozenFrom: _f, frozenUntil: _u, ...rest } = card;
  const moved = followersAfter({ ...rest, status: 'normal', expiresOn: addDays(slot, -1) }, cards);
  const before = new Map(cards.map(c => [c.id, c]));
  const ok = moved.every(f => {
    const o = before.get(f.id) as PeriodCard;
    return f.startsOn < o.startsOn && o.startsOn > today;
  });
  return ok ? moved : [];
}

/** 退款的那笔 refund 流水（次数清零的记变化量，期限卡记 0） */
export function refundLedgerEntry(args: {
  id: string; card: Card; delta: number; at: string; orderId: string; operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>; note: string;
}): LedgerEntry {
  const { card } = args;
  return {
    id: args.id,
    cardId: card.id,
    at: args.at,
    delta: args.delta,
    remainingAfter: 'remaining' in card ? card.remaining : null,
    expiresOnAfter: card.expiresOn,
    reason: 'refund',
    ref: { type: 'order', id: args.orderId },
    ...args.operator,
    note: args.note,
  };
}
