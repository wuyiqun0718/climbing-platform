import { describe, expect, it } from 'vitest';
import { defaultRules } from './gym';
import { createReferral, referralQuotaLeft } from './referral';
import { applyEntry, claimShare, entryOptions, isCardValid, isPeriodActive, RuleError, shareBlockedBy, shareFromCountCard, type EntryContext } from './rules';
import { newShareToken } from './shareToken';
import type { CountCard, GiftCard, PeriodCard, Share } from './types';

const today = '2026-10-12';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };

const T = newShareToken(n => crypto.getRandomValues(new Uint8Array(n)));
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
    const { card, share } = shareFromCountCard({ id: 's1', token: T, card: tenTimes, quantity: 2, today });
    expect(card.remaining).toBe(4);
    const claimed = claimShare({ share, claimerId: 'lu', cardId: 'g1', today });
    expect(claimed.share).toMatchObject({ status: 'claimed', claimedBy: 'lu' });
    expect(claimed.card).toMatchObject({ kind: 'gift', memberId: 'lu', remaining: 2, expiresOn: '2027-02-06' });
  });

  it('不能超过剩余次数，不能自己领自己的', () => {
    expect(code(() => shareFromCountCard({ id: 's1', token: T, card: tenTimes, quantity: 7, today }))).toBe('not-enough-remaining');
    expect(code(() => shareFromCountCard({ id: 's1', token: T, card: tenTimes, quantity: 0, today }))).toBe('invalid-quantity');
    const { share } = shareFromCountCard({ id: 's1', token: T, card: tenTimes, quantity: 1, today });
    expect(code(() => claimShare({ share, claimerId: 'jie', cardId: 'g1', today }))).toBe('own-share');
    expect(code(() => claimShare({ share: { ...share, status: 'claimed' }, claimerId: 'lu', cardId: 'g1', today }))).toBe('already-claimed');
  });

  it('分享带 token 和原卡，有效期跟原卡一致', () => {
    const { share } = shareFromCountCard({ id: 's1', token: T, card: tenTimes, quantity: 2, today });
    expect(share).toMatchObject({ kind: 'count', token: T, fromMemberId: 'jie', fromCardId: 'c1', quantity: 2, expiresOn: '2027-02-06', status: 'pending' });
  });

  it('次数要是正整数；全部送完可以', () => {
    for (const q of [1.5, -1, Number.NaN]) expect(code(() => shareFromCountCard({ id: 's1', token: T, card: tenTimes, quantity: q, today }))).toBe('invalid-quantity');
    expect(shareFromCountCard({ id: 's1', token: T, card: tenTimes, quantity: 6, today }).card.remaining).toBe(0);
  });

  it('只有自己买的次卡能转赠：好友送的、期限卡不行；过期、用完的不行', () => {
    const gift: GiftCard = { id: 'g1', kind: 'gift', memberId: 'jie', fromMemberId: 'lu', shareId: 's0', name: '好友送的次卡', total: 2, remaining: 2, expiresOn: '2027-02-06' };
    expect(code(() => shareFromCountCard({ id: 's1', token: T, card: gift, quantity: 1, today }))).toBe('card-not-shareable');
    expect(code(() => shareFromCountCard({ id: 's1', token: T, card: year, quantity: 1, today }))).toBe('card-not-shareable');
    expect(code(() => shareFromCountCard({ id: 's1', token: T, card: { ...tenTimes, expiresOn: '2026-10-11' }, quantity: 1, today }))).toBe('card-expired');
    expect(code(() => shareFromCountCard({ id: 's1', token: T, card: { ...tenTimes, remaining: 0 }, quantity: 1, today }))).toBe('not-enough-remaining');
    expect(shareBlockedBy(tenTimes, today)).toBeNull();
    expect(shareBlockedBy(gift, today)).toBe('card-not-shareable');
    expect(shareBlockedBy({ ...tenTimes, status: 'frozen' }, today)).toBe('card-inactive');
    expect(shareBlockedBy({ ...tenTimes, remaining: 0 }, today)).toBe('not-enough-remaining');
    expect(shareBlockedBy(tenTimes, '2027-02-06')).toBeNull();
    expect(shareBlockedBy(tenTimes, '2027-02-07')).toBe('card-expired');
  });

  it('token 不是 newShareToken 生成的格式就不生成分享', () => {
    expect(() => shareFromCountCard({ id: 's1', token: 's1', card: tenTimes, quantity: 1, today })).toThrow();
    expect(() => createReferral({ id: 'r1', token: '', cards: [year], sent: [], memberId: 'jie', today, rules: defaultRules })).toThrow();
  });
});

describe('老带新', () => {
  const invite = () => createReferral({ id: 'r1', token: T, cards: [year], sent: [], memberId: 'jie', today, rules: defaultRules });

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
    expect(code(() => createReferral({ id: 'r2', token: T, cards: [year], sent, memberId: 'jie', today, rules: defaultRules }))).toBe('referral-quota-used');
    expect(code(() => createReferral({ id: 'r2', token: T, cards: [tenTimes], sent: [], memberId: 'jie', today, rules: defaultRules }))).toBe('no-period-card');
  });
});

describe('卡的状态', () => {
  const inactive = ['frozen', 'void', 'refunded'] as const;

  it('冻结、作废、已退款的卡不出现在入场选项里，也不能入场', () => {
    for (const status of inactive) {
      expect(entryOptions([{ ...year, status }, { ...tenTimes, status }], ctx())).toEqual([]);
      expect(code(() => applyEntry({ ...tenTimes, status }, ctx()))).toBe('card-inactive');
    }
    expect(entryOptions([{ ...year, status: 'normal' }], ctx())).toHaveLength(1);
  });

  it('非正常的期限卡不算在有效期内，不能发老带新', () => {
    for (const status of inactive) {
      const cards = [{ ...year, status }];
      expect(isPeriodActive(cards[0], today)).toBe(false);
      expect(referralQuotaLeft(cards, [], 'jie', today, defaultRules)).toBe(0);
      expect(code(() => createReferral({ id: 'r1', token: T, cards, sent: [], memberId: 'jie', today, rules: defaultRules }))).toBe(status === 'frozen' ? 'referral-card-frozen' : 'no-period-card');
    }
  });

  it('非正常的次卡不能转赠', () => {
    for (const status of inactive) expect(code(() => shareFromCountCard({ id: 's1', token: T, card: { ...tenTimes, status }, quantity: 1, today }))).toBe('card-inactive');
  });
});

describe('有效卡', () => {
  it('正常、没过期、没用完的才算；还没开始的续费卡也算', () => {
    expect(isCardValid(year, today)).toBe(true);
    expect(isCardValid({ ...year, startsOn: '2026-11-01', expiresOn: '2026-11-30' }, today)).toBe(true);
    expect(isCardValid({ ...year, expiresOn: '2026-10-11' }, today)).toBe(false);
    expect(isCardValid({ ...year, expiresOn: today }, today)).toBe(true);
    expect(isCardValid(tenTimes, today)).toBe(true);
    expect(isCardValid({ ...tenTimes, remaining: 0 }, today)).toBe(false);
  });

  it('冻结、作废、已退款的不算', () => {
    expect(isCardValid({ ...year, status: 'normal' }, today)).toBe(true);
    for (const status of ['frozen', 'void', 'refunded'] as const) expect(isCardValid({ ...tenTimes, status }, today)).toBe(false);
  });

  it('体验券用过就不算', () => {
    const v = { id: 'v1', kind: 'referral' as const, memberId: 'lu', fromMemberId: 'jie', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31' };
    expect(isCardValid(v, today)).toBe(true);
    expect(isCardValid({ ...v, usedOn: today }, today)).toBe(false);
  });
});
