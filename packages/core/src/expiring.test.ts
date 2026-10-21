import { describe, expect, it } from 'vitest';
import { expiringPeriodCards } from './expiring';
import { defaultRules } from './gym';
import type { CountCard, PeriodCard } from './types';

const today = '2026-10-12';
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };

describe('快到期提醒', () => {
  const period = (id: string, memberId: string, expiresOn: string): PeriodCard => ({ id, kind: 'period', memberId, productId: 'm1', name: '月卡', startsOn: '2026-09-01', expiresOn });

  it('今天到 7 天后到期的期限卡，按到期日排，次卡不算', () => {
    const cards = [period('a', 'm1', '2026-10-19'), period('b', 'm2', '2026-10-12'), period('c', 'm3', '2026-10-11'), period('d', 'm4', '2026-10-20'), { ...tenTimes, expiresOn: '2026-10-13' }];
    expect(expiringPeriodCards(cards, today, defaultRules).map(c => c.id)).toEqual(['b', 'a']);
  });

  it('已经续了一张更晚到期的就不提醒；提前天数跟着岩馆配置', () => {
    const cards = [period('a', 'm1', '2026-10-14'), { ...period('a2', 'm1', '2026-11-14'), startsOn: '2026-10-15' }, period('b', 'm2', '2026-10-14')];
    expect(expiringPeriodCards(cards, today, defaultRules).map(c => c.id)).toEqual(['b']);
    expect(expiringPeriodCards(cards, today, { ...defaultRules, expiryReminderDays: 1 })).toEqual([]);
  });
});
