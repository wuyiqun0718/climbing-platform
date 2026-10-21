import { addDays, daysBetween, monthOf, type DateKey } from '@climb/utils';
import type { FreezeRules } from './gym';
import { isPeriodActive, RuleError, type RuleErrorCode } from './rules';
import type { Card, PeriodCard } from './types';

/**
 * 期限卡冻结。冻结从当天开始，冻结期间不能入场、不能发老带新（status 为 frozen，入场和老带新的规则已经拦了）。
 * 到期日不在冻结时改，解冻时按实际冻结天数顺延；到了计划的最后一天还没解冻的，次日自动解冻（settleFreeze）。
 * 同一会员后面接着的期限卡（续费买的、还没开始的）跟着挪，始终接在这张卡后面，不会重叠。
 */

/** 计划冻结几天（含首尾） */
const plannedDays = (c: PeriodCard) => daysBetween(c.frozenFrom!, c.frozenUntil!) + 1;

const isFrozenPeriod = (c: Card): c is PeriodCard & { frozenFrom: DateKey; frozenUntil: DateKey } =>
  c.kind === 'period' && c.status === 'frozen' && !!c.frozenFrom && !!c.frozenUntil;

/** 期限卡实际要用到哪天：冻结中的按冻满计划天数算（解冻前到期日还没顺延），其他就是到期日 */
export function periodEndOn(card: PeriodCard): DateKey {
  return isFrozenPeriod(card) ? addDays(card.expiresOn, plannedDays(card)) : card.expiresOn;
}

/** 本月、本年还能冻几次；null 为不限。history 是这个会员以前每次冻结开始的日子（流水里的 freeze） */
export function freezeQuotaLeft(history: readonly DateKey[], today: DateKey, rules: FreezeRules): { month: number | null; year: number | null } {
  const left = (limit: number | null, same: (d: DateKey) => boolean) => (limit === null ? null : Math.max(0, limit - history.filter(same).length));
  return {
    month: left(rules.perMonth, d => monthOf(d) === monthOf(today)),
    year: left(rules.perYear, d => d.slice(0, 4) === today.slice(0, 4)),
  };
}

/** 会员现在能不能自己冻结这张卡（不看天数）；能就返回 null，不能返回原因 */
export function freezeBlockedBy(args: { card: Card; history: readonly DateKey[]; today: DateKey; rules: FreezeRules }): RuleErrorCode | null {
  const { card, today, rules } = args;
  if (!rules.memberSelfService) return 'freeze-not-self-service';
  if (card.kind !== 'period' || !isPeriodActive(card, today)) return 'freeze-card-not-active';
  const quota = freezeQuotaLeft(args.history, today, rules);
  if (quota.month === 0) return 'freeze-month-quota-used';
  if (quota.year === 0) return 'freeze-year-quota-used';
  return null;
}

const FREEZE_MESSAGES: Partial<Record<RuleErrorCode, string>> = {
  'freeze-not-self-service': '冻结要找前台办理',
  'freeze-card-not-active': '只有正在用的期限卡可以冻结',
  'freeze-month-quota-used': '这个月的冻结次数用完了',
  'freeze-year-quota-used': '今年的冻结次数用完了',
};

/** 把这张卡后面接着的期限卡整体挪到 card 用完的次日开始，各自的天数和间隔不变 */
function chainFollowers(card: PeriodCard, cards: readonly Card[]): PeriodCard[] {
  const followers = cards.filter((c): c is PeriodCard =>
    c.kind === 'period' && c.memberId === card.memberId && c.id !== card.id && c.startsOn > card.startsOn && (c.status ?? 'normal') === 'normal');
  if (!followers.length) return [];
  const first = followers.reduce((min, c) => (c.startsOn < min ? c.startsOn : min), followers[0].startsOn);
  const shift = daysBetween(first, addDays(periodEndOn(card), 1));
  if (shift === 0) return [];
  return followers.map(c => ({ ...c, startsOn: addDays(c.startsOn, shift), expiresOn: addDays(c.expiresOn, shift) }));
}

/** 期限卡的有效期改了（后台调整）以后，后面接着的期限卡跟着挪，规则同冻结、解冻 */
export const followersAfter = (card: PeriodCard, cards: readonly Card[]): PeriodCard[] => chainFollowers(card, cards);

/**
 * 会员自助冻结，从今天起冻 days 天。cards 是这个会员所有的卡（挪后面的期限卡用），
 * history 见 freezeQuotaLeft。返回冻结后的卡和跟着挪了日期的期限卡。
 */
export function freezePeriodCard(args: {
  card: Card; cards: readonly Card[]; days: number; history: readonly DateKey[]; today: DateKey; rules: FreezeRules;
}): { card: PeriodCard; followers: PeriodCard[] } {
  const { card, days, today, rules } = args;
  const blocked = freezeBlockedBy(args);
  if (blocked) throw new RuleError(blocked, FREEZE_MESSAGES[blocked]!);
  if (!Number.isInteger(days) || days < rules.minDays || days > rules.maxDays) {
    throw new RuleError('freeze-days-out-of-range', `一次能冻 ${rules.minDays}–${rules.maxDays} 天`);
  }
  const frozen: PeriodCard = { ...(card as PeriodCard), status: 'frozen', frozenFrom: today, frozenUntil: addDays(today, days - 1) };
  return { card: frozen, followers: chainFollowers(frozen, args.cards) };
}

/**
 * 解冻：on 是恢复能用的那天（提前解冻就是今天，当天就能入场）。到期日顺延实际冻结的天数，
 * 最多顺延计划的天数。返回解冻后的卡、跟着挪了日期的期限卡和顺延的天数。
 */
export function unfreezePeriodCard(args: { card: Card; cards: readonly Card[]; on: DateKey }): { card: PeriodCard; followers: PeriodCard[]; days: number } {
  const { card } = args;
  if (!isFrozenPeriod(card)) throw new RuleError('card-not-frozen', '这张卡没有冻结');
  const days = Math.min(plannedDays(card), Math.max(0, daysBetween(card.frozenFrom, args.on)));
  const { frozenFrom: _from, frozenUntil: _until, ...rest } = card;
  const unfrozen: PeriodCard = { ...rest, status: 'normal', expiresOn: addDays(card.expiresOn, days) };
  return { card: unfrozen, followers: chainFollowers(unfrozen, args.cards), days };
}

/** 过了计划冻结的最后一天还没解冻的，自动解冻（后端每天跑一次；mock 在每次请求前跑）。不用解冻返回 null */
export function settleFreeze(card: Card, cards: readonly Card[], today: DateKey) {
  if (!isFrozenPeriod(card) || card.frozenUntil >= today) return null;
  return unfreezePeriodCard({ card, cards, on: addDays(card.frozenUntil, 1) });
}
