import { daysBetween, type DateKey } from '@climb/utils';
import { isPeriodActive } from './rules';
import type { Card, PeriodCard, ReferralVoucher } from './types';

export interface CardsSummary {
  /** 今天生效中的期限卡（有多张取最晚到期的） */
  period?: { card: PeriodCard; daysLeft: number };
  /** 还没生效的期限卡（续卡），最早生效的那张 */
  upcomingPeriod?: PeriodCard;
  /** 次卡和好友送的次卡，没过期的剩余次数合计 */
  countLeft: number;
  /** 没用过、没过期的老带新体验券 */
  voucher?: ReferralVoucher;
  /** 有没有能用来入场的东西；没有就引导去买卡 */
  canEnter: boolean;
}

/** 首页顶上的会员卡摘要：现在靠什么入场、还剩多少 */
export function summarizeCards(cards: Card[], today: DateKey): CardsSummary {
  const periods = cards.filter((c): c is PeriodCard => c.kind === 'period');
  const active = periods.filter(c => isPeriodActive(c, today)).sort((a, b) => b.expiresOn.localeCompare(a.expiresOn))[0];
  const upcomingPeriod = periods.filter(c => c.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0];
  const countLeft = cards.reduce((n, c) => ((c.kind === 'count' || c.kind === 'gift') && c.expiresOn >= today ? n + c.remaining : n), 0);
  const voucher = cards.find((c): c is ReferralVoucher => c.kind === 'referral' && !c.usedOn && c.expiresOn >= today);
  return {
    period: active && { card: active, daysLeft: daysBetween(today, active.expiresOn) + 1 },
    upcomingPeriod,
    countLeft,
    voucher,
    canEnter: !!active || countLeft > 0 || !!voucher,
  };
}
