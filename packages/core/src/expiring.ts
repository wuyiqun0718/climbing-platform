import { addDays, type DateKey } from '@climb/utils';
import type { GymRules } from './gym';
import type { Card, PeriodCard } from './types';

/**
 * 后台看板「7 天内到期」（mvp/dashboard 任务 8）。从 rules.ts 挪出来，rules.ts 跟小程序分支保持一致。
 * 快到期、该提醒续费的期限卡：今天到 rules.expiryReminderDays 天后之间到期（含两头）。
 * 同一会员已经有一张更晚到期的期限卡（续过了）就不算。按到期日排序。
 * 等馆方：次卡快到期或快用完要不要也提醒，先只算期限卡（跟原型一样）。
 */
export function expiringPeriodCards(cards: Card[], today: DateKey, rules: Pick<GymRules, 'expiryReminderDays'>): PeriodCard[] {
  const until = addDays(today, rules.expiryReminderDays);
  const periods = cards.filter((c): c is PeriodCard => c.kind === 'period');
  return periods
    .filter(c => c.expiresOn >= today && c.expiresOn <= until)
    .filter(c => !periods.some(o => o.memberId === c.memberId && o.expiresOn > c.expiresOn))
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.id.localeCompare(b.id));
}
