import { describe, expect, it } from 'vitest';
import { defaultRules } from './gym';
import { applyEntry, claimShare, createReferral, entryOptions, expiringPeriodCards, referralQuotaLeft, RuleError, shareFromCountCard, type EntryContext } from './rules';
import type { CountCard, PeriodCard, Share } from './types';

const today = '2026-10-12';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };

const ctx = (checkedIn: string[] = []): EntryContext => ({ today, rules: defaultRules, hasCheckedIn: id => checkedIn.includes(id) });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };

describe('入场', () => {
  it('期限卡排在次卡前面，期限卡不扣次', () => {
    const opts = entryOptions([tenTimes, year], ctx());
    expect(opts.map(o => o.card.id)).toEqual(['p1', 'c1']);
    expect(opts.map(o => o.deducts)).toEqual([0, 1]);
  });

  it('次卡扣 1 次，同一天再次入场不扣', () => {
    expect(applyEntry(tenTimes, ctx()).card.remaining).toBe(5);
    expect(applyEntry(tenTimes, ctx(), true)).toEqual({ card: tenTimes, deducted: 0 });
  });

  it('过期或用完的次卡不出现在入场选项里', () => {
    expect(entryOptions([{ ...tenTimes, remaining: 0 }, { ...tenTimes, id: 'c2', expiresOn: '2026-10-11' }], ctx())).toEqual([]);
  });
});

describe('次卡转赠', () => {
  it('送出的次数从原卡扣掉，朋友领取后得到同样有效期的次卡', () => {
    const { card, share } = shareFromCountCard({ id: 's1', card: tenTimes, quantity: 2, today });
    expect(card.remaining).toBe(4);
    const claimed = claimShare({ share, claimerId: 'lu', cardId: 'g1', today });
    expect(claimed.share).toMatchObject({ status: 'claimed', claimedBy: 'lu' });
    expect(claimed.card).toMatchObject({ kind: 'gift', memberId: 'lu', remaining: 2, expiresOn: '2027-02-06' });
  });

  it('不能超过剩余次数，不能自己领自己的', () => {
    expect(code(() => shareFromCountCard({ id: 's1', card: tenTimes, quantity: 7, today }))).toBe('not-enough-remaining');
    expect(code(() => shareFromCountCard({ id: 's1', card: tenTimes, quantity: 0, today }))).toBe('invalid-quantity');
    const { share } = shareFromCountCard({ id: 's1', card: tenTimes, quantity: 1, today });
    expect(code(() => claimShare({ share, claimerId: 'jie', cardId: 'g1', today }))).toBe('own-share');
    expect(code(() => claimShare({ share: { ...share, status: 'claimed' }, claimerId: 'lu', cardId: 'g1', today }))).toBe('already-claimed');
  });
});

describe('老带新', () => {
  const invite = () => createReferral({ id: 'r1', cards: [year], sent: [], memberId: 'jie', today, rules: defaultRules });

  it('体验券当月底前有效，邀请人当天入场前不能用', () => {
    const share = invite();
    expect(share.expiresOn).toBe('2026-10-31');
    const { card } = claimShare({ share, claimerId: 'lu', cardId: 'v1', today });
    expect(entryOptions([card], ctx())[0]).toMatchObject({ usable: false, blockedBy: 'inviter-not-checked-in' });
    expect(code(() => applyEntry(card, ctx()))).toBe('inviter-not-checked-in');
  });

  it('邀请人入场后，朋友当天可以免费入场一次', () => {
    const { card } = claimShare({ share: invite(), claimerId: 'lu', cardId: 'v1', today });
    const res = applyEntry(card, ctx(['jie']));
    expect(res).toMatchObject({ deducted: 0, card: { usedOn: today } });
    expect(entryOptions([res.card], ctx(['jie']))).toEqual([]);
  });

  it('每月名额用完后不能再发；没有期限卡不能发', () => {
    const sent: Share[] = [invite()];
    expect(referralQuotaLeft([year], sent, 'jie', today, defaultRules)).toBe(0);
    expect(referralQuotaLeft([year], sent, 'jie', '2026-11-01', defaultRules)).toBe(1);
    expect(code(() => createReferral({ id: 'r2', cards: [year], sent, memberId: 'jie', today, rules: defaultRules }))).toBe('referral-quota-used');
    expect(code(() => createReferral({ id: 'r2', cards: [tenTimes], sent: [], memberId: 'jie', today, rules: defaultRules }))).toBe('no-period-card');
  });
});

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
