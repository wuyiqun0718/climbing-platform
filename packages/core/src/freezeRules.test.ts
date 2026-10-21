import { describe, expect, it } from 'vitest';
import { freezeBlockedBy, freezePeriodCard, freezeQuotaLeft, settleFreeze, unfreezePeriodCard } from './freeze';
import { FREEZE_DAYS_LIMIT, freezeRulesErrors, pickFreezeRules } from './freezeRules';
import { defaultFreezeRules, defaultRules, defineGym, type FreezeRules } from './gym';
import { referralStatus } from './referral';
import { entryOptions, RuleError } from './rules';
import type { PeriodCard } from './types';

const today = '2026-10-12';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };
const freeze = (rules: FreezeRules, days: number, history: string[] = [], on = today) =>
  freezePeriodCard({ card: year, cards: [year], days, history, today: on, rules });

describe('冻结规则默认值', () => {
  it('默认会员可以自助、每月 1 次、每年不限、每次 1–30 天', () => {
    expect(defaultRules.freezeRules).toEqual({ memberSelfService: true, perMonth: 1, perYear: null, minDays: 1, maxDays: 30 });
  });

  it('岩馆只改一部分时其余用默认', () => {
    const gym = defineGym({ rules: { freezeRules: { perYear: 4 } } } as Parameters<typeof defineGym>[0]);
    expect(gym.rules.freezeRules).toEqual({ ...defaultFreezeRules, perYear: 4 });
    expect(gym.rules.expiryReminderDays).toBe(defaultRules.expiryReminderDays);
  });
});

describe('后台设置冻结规则的校验', () => {
  const ok: FreezeRules = { memberSelfService: false, perMonth: 2, perYear: 6, minDays: 7, maxDays: 60 };

  it('合法的通过，次数可以不限', () => {
    expect(freezeRulesErrors(ok)).toBeNull();
    expect(freezeRulesErrors({ ...ok, perMonth: null, perYear: null })).toBeNull();
    expect(freezeRulesErrors({ ...ok, perMonth: null, perYear: 1 })).toBeNull();
    expect(freezeRulesErrors({ ...ok, minDays: 30, maxDays: 30 })).toBeNull();
  });

  it('次数要 1 以上的整数或不限', () => {
    expect(freezeRulesErrors({ ...ok, perMonth: 0 })?.perMonth).toBeTruthy();
    expect(freezeRulesErrors({ ...ok, perMonth: 1.5 })?.perMonth).toBeTruthy();
    expect(freezeRulesErrors({ ...ok, perYear: '3' })?.perYear).toBeTruthy();
    expect(freezeRulesErrors({ ...ok, perYear: undefined })?.perYear).toBeTruthy();
  });

  it('每年不能少于每月', () => {
    expect(freezeRulesErrors({ ...ok, perMonth: 3, perYear: 2 })).toEqual({ perYear: '每年次数不能少于每月次数' });
  });

  it('天数在 1 到上限之间，最多不能少于最少', () => {
    expect(freezeRulesErrors({ ...ok, minDays: 0 })?.minDays).toBeTruthy();
    expect(freezeRulesErrors({ ...ok, maxDays: FREEZE_DAYS_LIMIT + 1 })?.maxDays).toBeTruthy();
    expect(freezeRulesErrors({ ...ok, minDays: 10, maxDays: 9 })).toEqual({ maxDays: '最多天数不能少于最少天数' });
  });

  it('开关要是布尔值；多余字段不存', () => {
    expect(freezeRulesErrors({ ...ok, memberSelfService: 'yes' as unknown as boolean })?.memberSelfService).toBeTruthy();
    expect(pickFreezeRules({ ...ok, extra: 1 } as FreezeRules)).toEqual(ok);
  });
});

describe('按配置拦冻结', () => {
  const rules: FreezeRules = { ...defaultFreezeRules, perMonth: 1, perYear: 2, minDays: 7, maxDays: 30 };

  it('每月次数：本月用完被拦，上个月的不算', () => {
    expect(code(() => freeze(rules, 7, ['2026-10-01']))).toBe('freeze-month-quota-used');
    expect(code(() => freeze(rules, 7, ['2026-09-30']))).toBeNull();
    expect(code(() => freeze({ ...rules, perMonth: 2 }, 7, ['2026-10-01']))).toBeNull();
    expect(code(() => freeze({ ...rules, perMonth: null, perYear: null }, 7, ['2026-10-01', '2026-10-05', '2026-10-08']))).toBeNull();
  });

  it('每年次数：今年用完被拦，跨年重新算', () => {
    expect(code(() => freeze(rules, 7, ['2026-03-01', '2026-06-01']))).toBe('freeze-year-quota-used');
    expect(code(() => freeze(rules, 7, ['2025-11-01', '2025-12-01']))).toBeNull();
    expect(freezeQuotaLeft(['2026-12-20', '2026-11-02'], '2027-01-05', rules)).toEqual({ month: 1, year: 2 });
    expect(freezeQuotaLeft(['2026-12-20'], '2026-12-31', rules)).toEqual({ month: 0, year: 1 });
  });

  it('跨月：月底冻过，下个月 1 日又能冻', () => {
    expect(freezeQuotaLeft(['2026-10-31'], '2026-10-31', rules).month).toBe(0);
    expect(freezeQuotaLeft(['2026-10-31'], '2026-11-01', rules).month).toBe(1);
  });

  it('天数上下限按配置', () => {
    expect(code(() => freeze(rules, 6))).toBe('freeze-days-out-of-range');
    expect(code(() => freeze(rules, 31))).toBe('freeze-days-out-of-range');
    expect(code(() => freeze(rules, 7))).toBeNull();
    expect(code(() => freeze(rules, 30))).toBeNull();
    expect(code(() => freeze({ ...rules, maxDays: 60 }, 31))).toBeNull();
  });

  it('关掉自助就只能前台办', () => {
    expect(code(() => freeze({ ...rules, memberSelfService: false }, 7))).toBe('freeze-not-self-service');
  });

  it('冻结中的卡不能再冻、不能入场、不能发老带新', () => {
    const frozen = freeze(rules, 7).card;
    expect(freezeBlockedBy({ card: frozen, history: [], today, rules })).toBe('freeze-card-not-active');
    const ctx = { today, rules: defaultRules, hasCheckedIn: () => false };
    expect(entryOptions([frozen], ctx)).toEqual([]);
    // 老带新的判断用小程序分支的 referral.ts：冻结中的给出更具体的原因 referral-card-frozen
    expect(referralStatus({ cards: [frozen], sent: [], memberId: 'jie', today, rules: defaultRules }).blockedBy).toBe('referral-card-frozen');
  });
});

describe('解冻后的到期日', () => {
  const rules = defaultFreezeRules;

  it('提前解冻按实际冻结天数顺延', () => {
    const frozen = freeze(rules, 10).card;
    const r = unfreezePeriodCard({ card: frozen, cards: [frozen], on: '2026-10-16' });
    expect(r.days).toBe(4);
    expect(r.card).toMatchObject({ status: 'normal', expiresOn: '2027-03-18' });
    expect(r.card.frozenFrom).toBeUndefined();
  });

  it('冻满了次日自动解冻，顺延计划天数；跨年也按天算', () => {
    const frozen = freeze(rules, 30, [], '2026-12-20').card;
    expect(frozen.frozenUntil).toBe('2027-01-18');
    expect(settleFreeze(frozen, [frozen], '2027-01-18')).toBeNull();
    expect(settleFreeze(frozen, [frozen], '2027-01-19')).toMatchObject({ days: 30, card: { expiresOn: '2027-04-13' } });
  });
});
