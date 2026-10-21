import { addDays, daysBetween, type DateKey } from '@climb/utils';
import { freezePeriodCard, freezeQuotaLeft, periodEndOn } from './freeze';
import { FREEZE_DAYS_LIMIT } from './freezeRules';
import type { FreezeRules } from './gym';
import { ledgerOnOf } from './ledgerCheck';
import { isPeriodActive, RuleError, type RuleErrorCode } from './rules';
import type { Card, PeriodCard, LedgerEntry } from './types';

/**
 * 期限卡的有效期改了（后台调整、退款）以后，后面接着的期限卡跟着挪。规则同 freeze.ts 里冻结、解冻用的 chainFollowers
 * （那个没导出，freeze.ts 跟小程序分支保持一致，所以这里照着写一份，两边要一起改）。
 */
export function followersAfter(card: PeriodCard, cards: readonly Card[]): PeriodCard[] {
  const followers = cards.filter((c): c is PeriodCard =>
    c.kind === 'period' && c.memberId === card.memberId && c.id !== card.id && c.startsOn > card.startsOn && (c.status ?? 'normal') === 'normal');
  if (!followers.length) return [];
  const first = followers.reduce((min, c) => (c.startsOn < min ? c.startsOn : min), followers[0]!.startsOn);
  const shift = daysBetween(first, addDays(periodEndOn(card), 1));
  if (shift === 0) return [];
  return followers.map(c => ({ ...c, startsOn: addDays(c.startsOn, shift), expiresOn: addDays(c.expiresOn, shift) }));
}

/**
 * 后台改卡（任务 17）：调次数、改到期日，帮会员冻结、解冻期限卡。
 * 冻结、解冻本身的规则在 freeze.ts（跟小程序同一份），这里只加后台多出来的：不看会员能不能自助、店长以上写原因可以破例。
 * 解冻直接用 freeze.ts 的 unfreezePeriodCard。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const hasCount = (c: Card): c is Extract<Card, { remaining: number }> => 'remaining' in c;

export interface CardAdjustInput {
  /** 改成剩几次；不改不传 */
  remaining?: number;
  /** 改成哪天到期（含）；不改不传 */
  expiresOn?: DateKey;
  /** 必填 */
  reason: string;
}

/**
 * 调次数、改到期日。作废、退款的卡不能改；期限卡、体验券没有次数；期限卡到期日不能早于开始日。
 * 剩余次数超过总数的，总数跟着加（比如补送几次）。期限卡改了到期日，后面接着的期限卡跟着挪（已经开始用的不能挪，拦下）。
 * cards 是这个会员所有的卡。返回改后的卡、跟着挪的期限卡和次数变化。
 */
export function adjustCard<C extends Card>(args: { card: C; cards: readonly Card[]; input: CardAdjustInput; today: DateKey }): { card: C; followers: PeriodCard[]; delta: number } {
  const { card, input, today } = args;
  const status = card.status ?? 'normal';
  if (status === 'void' || status === 'refunded') throw new RuleError('card-not-adjustable', '作废、退款的卡不能调整');
  if (!input.reason?.trim()) throw new RuleError('reason-required', '写一下调整的原因');
  let next: Card = card;
  let delta = 0;
  if (input.remaining !== undefined) {
    if (!hasCount(card)) throw new RuleError('adjust-invalid', '这张卡不按次数算');
    if (!Number.isInteger(input.remaining) || input.remaining < 0) throw new RuleError('adjust-invalid', '剩余次数填 0 以上的整数');
    delta = input.remaining - card.remaining;
    next = { ...card, remaining: input.remaining, total: Math.max(card.total, input.remaining) };
  }
  if (input.expiresOn !== undefined) {
    if (typeof input.expiresOn !== 'string' || !DATE_RE.test(input.expiresOn)) throw new RuleError('adjust-invalid', '到期日格式不对');
    if (card.kind === 'period' && input.expiresOn < card.startsOn) throw new RuleError('adjust-invalid', '到期日不能早于开始日');
    next = { ...next, expiresOn: input.expiresOn };
  }
  if (!delta && next.expiresOn === card.expiresOn) throw new RuleError('adjust-nothing-changed', '次数和到期日都没改');
  let followers: PeriodCard[] = [];
  if (next.kind === 'period' && next.expiresOn !== card.expiresOn) {
    followers = followersAfter(next, args.cards);
    const startedBefore = new Set(args.cards.filter(c => c.kind === 'period' && c.startsOn <= today).map(c => c.id));
    if (followers.some(f => startedBefore.has(f.id))) throw new RuleError('follower-started', '后面接着的期限卡已经开始用了，先调那张');
  }
  return { card: next as C, followers, delta };
}

/** 后台帮冻时超了规则、店长以上写原因可以破例的几种 */
export type FreezeOverridable = 'freeze-month-quota-used' | 'freeze-year-quota-used' | 'freeze-days-out-of-range';

export const FREEZE_OVERRIDE_TEXT: Record<FreezeOverridable, string> = {
  'freeze-month-quota-used': '这个月的冻结次数用完了',
  'freeze-year-quota-used': '今年的冻结次数用完了',
  'freeze-days-out-of-range': '天数超出了冻结规则',
};

/**
 * 后台帮会员冻结前的检查（不看 memberSelfService，会员不能自助的也能找前台办）。
 * blockedBy：破例也不行的（不是正在用的期限卡；天数不是 1–FREEZE_DAYS_LIMIT 的整数）。
 * needsOverride：超了冻结规则的（每月、每年次数，每次天数上下限），要写原因破例。days 不传就不查天数。
 */
export function deskFreezeCheck(args: { card: Card; days?: number; history: readonly DateKey[]; today: DateKey; rules: FreezeRules }): {
  blockedBy: RuleErrorCode | null;
  needsOverride: FreezeOverridable[];
} {
  const { card, days, today, rules } = args;
  if (card.kind !== 'period' || !isPeriodActive(card, today)) return { blockedBy: 'freeze-card-not-active', needsOverride: [] };
  if (days !== undefined && (!Number.isInteger(days) || days < 1 || days > FREEZE_DAYS_LIMIT)) return { blockedBy: 'freeze-days-invalid', needsOverride: [] };
  const needsOverride: FreezeOverridable[] = [];
  const quota = freezeQuotaLeft(args.history, today, rules);
  if (quota.month === 0) needsOverride.push('freeze-month-quota-used');
  if (quota.year === 0) needsOverride.push('freeze-year-quota-used');
  if (days !== undefined && (days < rules.minDays || days > rules.maxDays)) needsOverride.push('freeze-days-out-of-range');
  return { blockedBy: null, needsOverride };
}

/** 交给 freezePeriodCard 的规则：后台的检查已经做过，这里只用它冻结、挪后面的卡 */
const DESK_PASS: FreezeRules = { memberSelfService: true, perMonth: null, perYear: null, minDays: 1, maxDays: FREEZE_DAYS_LIMIT };

/**
 * 后台帮会员冻结，从今天起冻 days 天。超了冻结规则的要带 overrideReason（谁能破例看后台权限 card.freezeOverride），
 * 不带就拦下。这次冻结一样记 freeze 流水，计入会员每月、每年的次数。
 * 返回冻结后的卡、跟着挪的期限卡和破例了哪几条（没破例为空）。
 */
export function deskFreezePeriodCard(args: {
  card: Card; cards: readonly Card[]; days: number; history: readonly DateKey[]; today: DateKey; rules: FreezeRules; overrideReason?: string;
}): { card: PeriodCard; followers: PeriodCard[]; overridden: FreezeOverridable[] } {
  const { blockedBy, needsOverride } = deskFreezeCheck(args);
  if (blockedBy === 'freeze-card-not-active') throw new RuleError(blockedBy, '只有正在用的期限卡可以冻结');
  if (blockedBy) throw new RuleError(blockedBy, `冻结天数填 1–${FREEZE_DAYS_LIMIT} 的整数`);
  if (needsOverride.length && !args.overrideReason?.trim()) {
    const first = needsOverride[0]!;
    const msg = first === 'freeze-days-out-of-range' ? `一次能冻 ${args.rules.minDays}–${args.rules.maxDays} 天` : FREEZE_OVERRIDE_TEXT[first];
    throw new RuleError(first, `${msg}，要破例得写原因`);
  }
  const r = freezePeriodCard({ ...args, rules: DESK_PASS });
  return { ...r, overridden: needsOverride };
}

/** 会员以前每次冻结开始的日子（这个会员的卡上的 freeze 流水，会员自助和后台代办的都算），给 freezeQuotaLeft 用 */
export function freezeHistory(ledger: readonly LedgerEntry[], cardIds: Iterable<string>): DateKey[] {
  const ids = new Set(cardIds);
  return ledger.filter(e => e.reason === 'freeze' && ids.has(e.cardId)).map(e => e.at.slice(0, 10));
}

/** 调整、冻结、解冻的那笔流水；跟着挪了日期的期限卡记 adjust */
export function cardChangeLedgerEntry(args: {
  id: string;
  card: Card;
  reason: 'adjust' | 'freeze' | 'unfreeze';
  delta?: number;
  at: string;
  operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>;
  note: string;
}): LedgerEntry {
  const { card } = args;
  return {
    id: args.id,
    cardId: card.id,
    at: args.at,
    on: ledgerOnOf(args.at),
    delta: args.delta ?? 0,
    ...(hasCount(card) ? { remainingAfter: card.remaining } : {}),
    expiresOnAfter: card.expiresOn,
    reason: args.reason,
    ...args.operator,
    note: args.note,
  };
}
