import { describe, expect, it } from 'vitest';
import { freezeBlockedBy, freezePeriodCard, freezeUntilOn, freezeQuotaLeft, periodEndOn, settleFreeze, unfreezePeriodCard } from './freeze';
import { defaultFreezeRules, defaultRules, type FreezeRules } from './gym';
import { periodStartsOn } from './orders';
import { createReferral } from './referral';
import { applyEntry, entryOptions, RuleError } from './rules';
import type { PeriodCard } from './types';
import { newShareToken } from './shareToken';
import { cardBalance, isCardLive } from './wallet';

const today = '2026-10-12';
const T = newShareToken(n => crypto.getRandomValues(new Uint8Array(n)));
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const next: PeriodCard = { ...year, id: 'p2', productId: 'm1', name: '月卡', startsOn: '2027-03-15', expiresOn: '2027-04-13' };
const rules: FreezeRules = { ...defaultFreezeRules, perMonth: 1, perYear: 2, minDays: 7, maxDays: 30 };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };
const freeze = (days: number, history: string[] = [], r = rules, cards = [year]) => freezePeriodCard({ card: year, cards, days, history, today, rules: r });

describe('冻结次数和天数', () => {
  it('默认每月 1 次、每年不限', () => {
    expect(freezeQuotaLeft([], today, defaultFreezeRules)).toEqual({ month: 1, year: null });
    expect(freezeQuotaLeft(['2026-10-01'], today, defaultFreezeRules)).toEqual({ month: 0, year: null });
  });

  it('本月次数用完被拒，上个月的不算', () => {
    expect(code(() => freeze(7, ['2026-10-01']))).toBe('freeze-month-quota-used');
    expect(code(() => freeze(7, ['2026-09-30']))).toBeNull();
  });

  it('今年次数用完被拒，跨年重新算', () => {
    expect(code(() => freeze(7, ['2026-03-01', '2026-06-01']))).toBe('freeze-year-quota-used');
    expect(freezeQuotaLeft(['2026-12-20', '2026-11-02'], '2027-01-05', rules)).toEqual({ month: 1, year: 2 });
    expect(freezeQuotaLeft(['2026-12-20'], '2026-12-31', rules)).toEqual({ month: 0, year: 1 });
  });

  it('天数超出上下限被拒', () => {
    expect(code(() => freeze(6))).toBe('freeze-days-out-of-range');
    expect(code(() => freeze(31))).toBe('freeze-days-out-of-range');
    expect(code(() => freeze(7.5))).toBe('freeze-days-out-of-range');
    expect(code(() => freeze(7))).toBeNull();
    expect(code(() => freeze(30))).toBeNull();
  });

  it('关了自助冻结、还没开始或已到期的卡、已经冻结的卡不能冻', () => {
    expect(code(() => freeze(7, [], { ...rules, memberSelfService: false }))).toBe('freeze-not-self-service');
    const base = { history: [], today, rules };
    expect(freezeBlockedBy({ ...base, card: next })).toBe('freeze-card-not-active');
    expect(freezeBlockedBy({ ...base, card: { ...year, expiresOn: '2026-10-11' } })).toBe('freeze-card-not-active');
    expect(freezeBlockedBy({ ...base, card: freeze(7).card })).toBe('freeze-card-not-active');
  });
});

describe('冻结和解冻', () => {
  it('冻结从今天起，到期日先不变；冻结中不能入场、不能发老带新', () => {
    const { card } = freeze(10);
    expect(card).toMatchObject({ status: 'frozen', frozenFrom: today, frozenUntil: '2026-10-21', expiresOn: '2027-03-14' });
    const ctx = { today, rules: defaultRules, hasCheckedIn: () => false };
    expect(entryOptions([card], ctx)).toEqual([]);
    expect(code(() => applyEntry(card, ctx))).toBe('card-inactive');
    expect(code(() => createReferral({ id: 'r1', token: T, cards: [card], sent: [], memberId: 'jie', today, rules: defaultRules }))).toBe('referral-card-frozen');
  });

  it('提前解冻按实际冻结天数顺延，解冻当天就能用', () => {
    const { card } = freeze(10);
    const r = unfreezePeriodCard({ card, cards: [card], on: '2026-10-15' });
    expect(r.days).toBe(3);
    expect(r.card).toEqual({ ...year, status: 'normal', expiresOn: '2027-03-17' });
  });

  it('冻结当天就解冻不顺延', () => {
    const { card } = freeze(10);
    expect(unfreezePeriodCard({ card, cards: [card], on: today }).card.expiresOn).toBe('2027-03-14');
  });

  it('冻满了次日自动解冻，顺延计划的天数；没到就不动', () => {
    const { card } = freeze(10);
    expect(settleFreeze(card, [card], '2026-10-21')).toBeNull();
    const r = settleFreeze(card, [card], '2026-10-25')!;
    expect(r.days).toBe(10);
    expect(r.card.expiresOn).toBe('2027-03-24');
  });

  it('没冻结的卡不能解冻', () => {
    expect(code(() => unfreezePeriodCard({ card: year, cards: [year], on: today }))).toBe('card-not-frozen');
  });

  it('冻结中卡包里照样显示，剩余天数停在冻结那天', () => {
    const short = { ...year, expiresOn: '2026-10-14' };
    const { card } = freezePeriodCard({ card: short, cards: [short], days: 30, history: [], today, rules });
    expect(isCardLive(card, '2026-11-01')).toBe(true);
    expect(cardBalance(card, '2026-11-01')).toMatchObject({ left: 3, frozenUntil: '2026-11-10' });
  });
});

describe('冻结和后面接着的期限卡', () => {
  it('冻结时续的卡往后挪计划天数，提前解冻再挪回来接上，不重叠', () => {
    const frozen = freeze(10, [], rules, [year, next]);
    expect(frozen.followers).toEqual([{ ...next, startsOn: '2027-03-25', expiresOn: '2027-04-23' }]);
    const r = unfreezePeriodCard({ card: frozen.card, cards: [frozen.card, ...frozen.followers], on: '2026-10-15' });
    expect(r.card.expiresOn).toBe('2027-03-17');
    expect(r.followers).toEqual([{ ...next, startsOn: '2027-03-18', expiresOn: '2027-04-16' }]);
  });

  it('冻结中买新的期限卡，接在冻满以后；解冻后跟着挪', () => {
    const { card } = freeze(10);
    expect(periodEndOn(card)).toBe('2027-03-24');
    expect(periodStartsOn([card], 'jie', today)).toBe('2027-03-25');
    // 原来的到期日已经过了、还在冻结中的卡也要算进去
    const short = freezePeriodCard({ card: { ...year, expiresOn: '2026-10-14' }, cards: [], days: 30, history: [], today, rules }).card;
    expect(periodStartsOn([short], 'jie', '2026-11-01')).toBe('2026-11-14');
    const bought: PeriodCard = { ...next, startsOn: '2027-03-25', expiresOn: '2027-04-23' };
    const r = unfreezePeriodCard({ card, cards: [card, bought], on: '2026-10-14' });
    expect(r.followers).toEqual([{ ...bought, startsOn: '2027-03-17', expiresOn: '2027-04-15' }]);
  });

  it('冻满自动解冻时后面的卡不用再挪', () => {
    const frozen = freeze(10, [], rules, [year, next]);
    expect(settleFreeze(frozen.card, [frozen.card, ...frozen.followers], '2026-10-22')!.followers).toEqual([]);
  });
});

describe('冻到哪天', () => {
  it('含首尾：今天起冻 1 天就是冻到今天，冻 7 天到第 7 天', () => {
    expect(freezeUntilOn('2026-10-23', 1)).toBe('2026-10-23');
    expect(freezeUntilOn('2026-10-23', 7)).toBe('2026-10-29');
    expect(freezeUntilOn('2026-10-30', 3)).toBe('2026-11-01');
  });
});
