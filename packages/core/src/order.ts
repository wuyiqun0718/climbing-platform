import { addDays, addMonths, type Cents, type DateKey } from '@climb/utils';
import type { LedgerEntry } from './ledger';
import type { PayChannel, RevenueCategory } from './finance';
import type { Card, PeriodCard, Product, ProductCategory } from './types';

/**
 * 前台线下收款开卡的规则：能收哪些方式、实收金额怎么校验、开出来的卡从哪天算到哪天。
 * 后台开卡弹窗、mock 和后端都按这里。
 *
 * 等馆方确认的，先用下面的占位，确认后只改这个文件：
 * 1. 线下收款方式只有现金、POS、转账（DESK_PAY_CHANNELS）。
 * 2. 实收可以比标价低（打折、抹零），不能比标价高，也不能是 0（送卡走「调整」，不走订单）；改了价必须写原因，最多 DESK_PRICE_REASON_MAX 个字。
 * 3. 期限卡从开卡当天开始算；手上还有没到期（含还没开始）的期限卡时，接在最晚那张后面（跟原型一样），不从首次入场激活。
 * 4. 次卡、私教、团课课包的有效期从开卡当天算 validMonths 个月，含当天（到期日 = addMonths(今天, validMonths) 前一天，跟小程序一致）；
 *    没填 validMonths 的：多次的（quantity > 1）按 DEFAULT_VALID_MONTHS，单次票（quantity 1）只当天有效。
 * 5. 前台、店长、老板都能改价（只要写原因），见 dashboard 的 permissions.ts 的 order.create。
 */

export const DESK_PAY_CHANNELS = ['desk_cash', 'desk_pos', 'desk_transfer'] as const satisfies readonly PayChannel[];
export type DeskPayChannel = (typeof DESK_PAY_CHANNELS)[number];
export const DEFAULT_DESK_PAY_CHANNEL: DeskPayChannel = 'desk_pos';

export const DESK_PRICE_REASON_MAX = 100;
/** 没填 validMonths 的次卡、课包（quantity > 1）的有效月数；单次票不用这个，只当天有效 */
export const DEFAULT_VALID_MONTHS = 12;

/** 卡种品类对应的财务品类 */
export const PRODUCT_REVENUE_CATEGORY: Record<ProductCategory, RevenueCategory> = { period: 'period', count: 'count', pt: 'pt', class: 'class' };

/** 买了这种卡算不算「办卡」（看板新客办卡、归属门店用）：只算期限卡和次卡 */
export const countsAsCardPurchase = (category: ProductCategory) => category === 'period' || category === 'count';

export interface DeskOrderInput {
  channel: string;
  /** 实收，分 */
  amountCents: number;
  /** 改价原因；实收 = 标价时不用填 */
  priceReason: string;
}

export interface DeskOrderErrors {
  channel?: string;
  amountCents?: string;
  priceReason?: string;
}

/** 开卡表单的校验，按字段给错误；全对返回 null。product 是要卖的卡种（必须在售） */
export function deskOrderErrors(product: Pick<Product, 'priceCents' | 'onSale'>, input: DeskOrderInput): DeskOrderErrors | null {
  const errs: DeskOrderErrors = {};
  if (!(DESK_PAY_CHANNELS as readonly string[]).includes(input.channel)) errs.channel = '请选收款方式';
  const a = input.amountCents;
  if (!Number.isInteger(a) || a <= 0) errs.amountCents = '实收金额要大于 0，最多两位小数';
  else if (a > product.priceCents) errs.amountCents = '实收不能比标价高';
  const reason = input.priceReason.trim();
  if (Number.isInteger(a) && a !== product.priceCents && !reason) errs.priceReason = '改了价要写原因';
  else if (reason.length > DESK_PRICE_REASON_MAX) errs.priceReason = `原因最多 ${DESK_PRICE_REASON_MAX} 个字`;
  return Object.keys(errs).length ? errs : null;
}

/** 输入框里的元转成分：「599」「599.5」「599.50」→ 分；格式不对返回 NaN */
export function parseYuanInput(raw: string): Cents {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [y, f = ''] = s.split('.');
  return Number(y) * 100 + Number(f.padEnd(2, '0'));
}

/** 期限卡从哪天开始：今天；手上还有没到期的期限卡就接在最晚那张后面 */
export function periodStartsOn(cards: readonly Card[], memberId: string, today: DateKey): DateKey {
  const latest = cards
    .filter((c): c is PeriodCard => c.kind === 'period' && c.memberId === memberId && c.expiresOn >= today && (c.status ?? 'normal') === 'normal')
    .reduce<DateKey | null>((max, c) => (max === null || c.expiresOn > max ? c.expiresOn : max), null);
  return latest ? addDays(latest, 1) : today;
}

/** 按卡种开一张新卡。cards 是这个会员现有的卡（算期限卡接续用） */
export function issueCard(args: { id: string; product: Product; memberId: string; cards: readonly Card[]; today: DateKey }): Card {
  const { id, product: p, memberId, today } = args;
  const base = { id, memberId, productId: p.id, name: p.name };
  if (p.category === 'period') {
    const startsOn = periodStartsOn(args.cards, memberId, today);
    return { ...base, kind: 'period', startsOn, expiresOn: addDays(startsOn, (p.days ?? 1) - 1) };
  }
  const total = p.quantity ?? 1;
  const months = p.validMonths ?? (total > 1 ? DEFAULT_VALID_MONTHS : 0);
  const expiresOn = months ? addDays(addMonths(today, months), -1) : today;
  return { ...base, kind: p.category, total, remaining: total, expiresOn };
}

/** 开卡的那笔 purchase 流水 */
export function purchaseLedgerEntry(args: {
  id: string;
  card: Card;
  at: string;
  orderId: string;
  operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>;
  note?: string;
}): LedgerEntry {
  const { card } = args;
  const counted = card.kind !== 'period' && card.kind !== 'referral';
  return {
    id: args.id,
    cardId: card.id,
    at: args.at,
    delta: counted ? card.total : 0,
    remainingAfter: counted ? card.remaining : null,
    expiresOnAfter: card.expiresOn,
    reason: 'purchase',
    ref: { type: 'order', id: args.orderId },
    ...args.operator,
    note: args.note ?? '',
  };
}
