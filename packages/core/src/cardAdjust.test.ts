import { describe, expect, it } from 'vitest';
import { adjustCard, cardChangeLedgerEntry, deskFreezeCheck, deskFreezePeriodCard, freezeHistory } from './cardAdjust';
import { freezeBlockedBy, freezeQuotaLeft, unfreezePeriodCard } from './freeze';
import { FREEZE_DAYS_LIMIT } from './freezeRules';
import { defaultFreezeRules, defaultRules, type FreezeRules } from './gym';
import { ledgerMismatch } from './ledgerCheck';
import type { LedgerEntry } from './types';
import { entryOptions, RuleError } from './rules';
import type { CountCard, PeriodCard, ReferralVoucher } from './types';

const today = '2026-10-21';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const renewal: PeriodCard = { id: 'p2', kind: 'period', memberId: 'jie', productId: 'm1', name: '月卡', startsOn: '2027-03-15', expiresOn: '2027-04-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 5, expiresOn: '2027-02-06' };
const voucher: ReferralVoucher = { id: 'v1', kind: 'referral', memberId: 'jie', fromMemberId: 'lu', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31' };
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };
const rules: FreezeRules = { ...defaultFreezeRules, perMonth: 1, perYear: 2, minDays: 7, maxDays: 30 };

describe('调整次数、到期日', () => {
  it('改剩余次数：记下变化量；超过总数的总数跟着加', () => {
    expect(adjustCard({ card: tenTimes, cards: [tenTimes], input: { remaining: 3, reason: '多扣了' }, today })).toMatchObject({ card: { remaining: 3, total: 10 }, delta: -2 });
    expect(adjustCard({ card: tenTimes, cards: [tenTimes], input: { remaining: 12, reason: '补送' }, today })).toMatchObject({ card: { remaining: 12, total: 12 }, delta: 7 });
  });

  it('改到期日；次数和到期日可以一起改', () => {
    const r = adjustCard({ card: tenTimes, cards: [tenTimes], input: { remaining: 6, expiresOn: '2027-03-01', reason: '补偿' }, today });
    expect(r).toMatchObject({ card: { remaining: 6, expiresOn: '2027-03-01' }, delta: 1, followers: [] });
    expect(adjustCard({ card: voucher, cards: [voucher], input: { expiresOn: '2026-11-30', reason: '延期' }, today }).card.expiresOn).toBe('2026-11-30');
  });

  it('必须写原因；什么都没改、格式不对的拦下', () => {
    expect(code(() => adjustCard({ card: tenTimes, cards: [], input: { remaining: 3, reason: '  ' }, today }))).toBe('reason-required');
    expect(code(() => adjustCard({ card: tenTimes, cards: [], input: { reason: 'x' }, today }))).toBe('adjust-nothing-changed');
    expect(code(() => adjustCard({ card: tenTimes, cards: [], input: { remaining: 5, expiresOn: tenTimes.expiresOn, reason: 'x' }, today }))).toBe('adjust-nothing-changed');
    for (const remaining of [-1, 1.5, NaN]) expect(code(() => adjustCard({ card: tenTimes, cards: [], input: { remaining, reason: 'x' }, today }))).toBe('adjust-invalid');
    expect(code(() => adjustCard({ card: tenTimes, cards: [], input: { expiresOn: '2027/3/1', reason: 'x' }, today }))).toBe('adjust-invalid');
  });

  it('期限卡、体验券没有次数；期限卡到期日不能早于开始日', () => {
    expect(code(() => adjustCard({ card: year, cards: [year], input: { remaining: 3, reason: 'x' }, today }))).toBe('adjust-invalid');
    expect(code(() => adjustCard({ card: voucher, cards: [], input: { remaining: 1, reason: 'x' }, today }))).toBe('adjust-invalid');
    expect(code(() => adjustCard({ card: year, cards: [year], input: { expiresOn: '2026-03-14', reason: 'x' }, today }))).toBe('adjust-invalid');
  });

  it('作废、退款的卡不能改；冻结中的可以改', () => {
    for (const status of ['void', 'refunded'] as const) {
      expect(code(() => adjustCard({ card: { ...tenTimes, status }, cards: [], input: { remaining: 3, reason: 'x' }, today }))).toBe('card-not-adjustable');
    }
    expect(adjustCard({ card: { ...tenTimes, status: 'frozen' }, cards: [], input: { remaining: 3, reason: 'x' }, today }).card.status).toBe('frozen');
  });

  it('期限卡延长或缩短，后面接着的续费卡跟着挪；已经开始用的拦下', () => {
    const longer = adjustCard({ card: year, cards: [year, renewal], input: { expiresOn: '2027-03-21', reason: '闭馆补偿 7 天' }, today });
    expect(longer.followers).toEqual([{ ...renewal, startsOn: '2027-03-22', expiresOn: '2027-04-21' }]);
    const shorter = adjustCard({ card: year, cards: [year, renewal], input: { expiresOn: '2027-03-10', reason: '录错了' }, today });
    expect(shorter.followers[0]).toMatchObject({ startsOn: '2027-03-11', expiresOn: '2027-04-10' });
    const old: PeriodCard = { ...year, startsOn: '2026-01-01', expiresOn: '2026-09-30' };
    const running: PeriodCard = { ...renewal, startsOn: '2026-10-01', expiresOn: '2026-10-31' };
    expect(code(() => adjustCard({ card: old, cards: [old, running], input: { expiresOn: '2026-10-07', reason: 'x' }, today }))).toBe('follower-started');
  });

  it('流水接得上：次数变化记 delta，期限卡不记剩余', () => {
    const buy: LedgerEntry = { id: 'l1', cardId: 'c1', at: '2026-08-06T10:00:00+08:00', on: '2026-08-06', delta: 5, remainingAfter: 5, expiresOnAfter: tenTimes.expiresOn, reason: 'purchase', operatorType: 'staff', operatorId: 's1', note: '' };
    const r = adjustCard({ card: tenTimes, cards: [], input: { remaining: 8, expiresOn: '2027-03-01', reason: '补送' }, today });
    const e = cardChangeLedgerEntry({ id: 'l2', card: r.card, reason: 'adjust', delta: r.delta, at: `${today}T12:00:00+08:00`, operator: { operatorType: 'staff', operatorId: 's2' }, note: '补送' });
    expect(e).toMatchObject({ delta: 3, remainingAfter: 8, expiresOnAfter: '2027-03-01', reason: 'adjust', on: today });
    expect(e).not.toHaveProperty('refType');
    expect(ledgerMismatch(r.card, [buy, e])).toBeNull();
    expect(cardChangeLedgerEntry({ id: 'l3', card: year, reason: 'freeze', at: '', operator: { operatorType: 'staff', operatorId: 's2' }, note: '' })).toMatchObject({ delta: 0 });
    expect(cardChangeLedgerEntry({ id: 'l4', card: year, reason: 'freeze', at: '', operator: { operatorType: 'staff', operatorId: 's2' }, note: '' })).not.toHaveProperty('remainingAfter');
  });
});

describe('后台帮会员冻结', () => {
  const freeze = (days: number, history: string[] = [], overrideReason?: string, r = rules) =>
    deskFreezePeriodCard({ card: year, cards: [year, renewal], days, history, today, rules: r, overrideReason });

  it('规则内的直接冻，跟自助冻结一样从今天起、后面的卡跟着挪，没有破例', () => {
    const r = freeze(10);
    expect(r.card).toMatchObject({ status: 'frozen', frozenFrom: today, frozenUntil: '2026-10-30', expiresOn: year.expiresOn });
    expect(r.followers[0]).toMatchObject({ startsOn: '2027-03-25' });
    expect(r.overridden).toEqual([]);
  });

  it('会员不能自助的（memberSelfService 关了）后台照样能办', () => {
    const off = { ...rules, memberSelfService: false };
    expect(freezeBlockedBy({ card: year, history: [], today, rules: off })).toBe('freeze-not-self-service');
    expect(freeze(10, [], undefined, off).card.status).toBe('frozen');
  });

  it('后台代办的也计入每月、每年次数：本月冻过一次再冻要破例', () => {
    const history = freezeHistory(
      [{ id: 'l1', cardId: 'p1', at: '2026-10-02T15:00:00+08:00', on: '2026-10-02', delta: 0, expiresOnAfter: year.expiresOn, reason: 'freeze', operatorType: 'staff', operatorId: 's1', note: '' }],
      ['p1', 'p2'],
    );
    expect(history).toEqual(['2026-10-02']);
    expect(freezeQuotaLeft(history, today, rules).month).toBe(0);
    expect(code(() => freeze(10, history))).toBe('freeze-month-quota-used');
    expect(freeze(10, history, '医生证明，要再停一段').overridden).toEqual(['freeze-month-quota-used']);
  });

  it('每年次数、天数上下限超了也要破例；几条一起超的都列出来', () => {
    expect(code(() => freeze(10, ['2026-03-01', '2026-06-01']))).toBe('freeze-year-quota-used');
    expect(code(() => freeze(5))).toBe('freeze-days-out-of-range');
    expect(code(() => freeze(31))).toBe('freeze-days-out-of-range');
    expect(deskFreezeCheck({ card: year, days: 60, history: ['2026-06-01', today], today, rules })).toEqual({
      blockedBy: null,
      needsOverride: ['freeze-month-quota-used', 'freeze-year-quota-used', 'freeze-days-out-of-range'],
    });
    const r = freeze(60, [], '骨折，医生说休两个月');
    expect(r.card.frozenUntil).toBe('2026-12-19');
    expect(r.overridden).toEqual(['freeze-days-out-of-range']);
  });

  it('只写空格不算原因', () => {
    expect(code(() => freeze(5, [], '   '))).toBe('freeze-days-out-of-range');
  });

  it('破例也不行的：不是正在用的期限卡、天数不是 1 到上限的整数', () => {
    const blocked = (card: typeof year | typeof tenTimes, days = 10) => code(() => deskFreezePeriodCard({ card, cards: [card], days, history: [], today, rules, overrideReason: '破例' }));
    expect(blocked(tenTimes)).toBe('freeze-card-not-active');
    expect(blocked({ ...year, status: 'frozen', frozenFrom: today, frozenUntil: '2026-10-30' })).toBe('freeze-card-not-active');
    expect(blocked(renewal)).toBe('freeze-card-not-active');
    expect(blocked({ ...year, expiresOn: '2026-10-20' })).toBe('freeze-card-not-active');
    for (const d of [0, 2.5, FREEZE_DAYS_LIMIT + 1]) expect(blocked(year, d)).toBe('freeze-days-invalid');
    expect(deskFreezeCheck({ card: year, history: [], today, rules })).toEqual({ blockedBy: null, needsOverride: [] });
  });

  it('冻结中的卡不能入场；解冻后到期日按实际冻结天数顺延', () => {
    const r = freeze(10);
    expect(entryOptions([r.card], { today, rules: defaultRules, hasCheckedIn: () => false })).toEqual([]);
    const back = unfreezePeriodCard({ card: r.card, cards: [r.card, ...r.followers], on: '2026-10-25' });
    expect(back).toMatchObject({ days: 4, card: { status: 'normal', expiresOn: '2027-03-18' } });
    expect(back.card.frozenFrom).toBeUndefined();
    expect(back.followers[0]).toMatchObject({ startsOn: '2027-03-19' });
  });
});
