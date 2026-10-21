import { describe, expect, it } from 'vitest';
import type { CountCard, GiftCard, LessonCard, PeriodCard, ReferralVoucher } from './types';
import { cardBalance, groupWallet, isCardLive } from './wallet';

const today = '2026-10-12';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2026-10-21' };
const next: PeriodCard = { ...year, id: 'p2', startsOn: '2026-10-22', expiresOn: '2026-11-20' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const gift: GiftCard = { id: 'g1', kind: 'gift', memberId: 'jie', fromMemberId: 'lu', shareId: 's1', name: '好友送的次卡', total: 2, remaining: 2, expiresOn: '2026-12-01' };
const voucher: ReferralVoucher = { id: 'r1', kind: 'referral', memberId: 'jie', fromMemberId: 'lu', shareId: 's2', name: '老带新体验券', expiresOn: '2026-10-31' };
const pt: LessonCard = { id: 'l1', kind: 'pt', memberId: 'jie', productId: 'pt5', name: '私教 5 节', total: 5, remaining: 3, expiresOn: '2027-01-01' };
const cls: LessonCard = { ...pt, id: 'l2', kind: 'class', name: '团课 10 次', total: 10, remaining: 10 };

describe('卡包', () => {
  it('五种卡分到入场卡和课程，期限卡在前，续卡排在生效中的后面', () => {
    const g = groupWallet([cls, voucher, gift, next, tenTimes, pt, year], today);
    expect(g.entry.map(c => c.id)).toEqual(['p1', 'p2', 'c1', 'g1', 'r1']);
    expect(g.lessons.map(c => c.id)).toEqual(['l1', 'l2']);
    expect(g.done).toEqual([]);
  });

  it('用完、过期、用过的放进折叠区，最近到期的在前', () => {
    const empty = { ...tenTimes, id: 'c2', remaining: 0 };
    const expired = { ...year, id: 'p3', expiresOn: '2026-10-11' };
    const used = { ...voucher, id: 'r2', usedOn: '2026-10-10' };
    const ptDone = { ...pt, id: 'l3', remaining: 0 };
    const g = groupWallet([empty, expired, used, ptDone, year], today);
    expect(g.entry.map(c => c.id)).toEqual(['p1']);
    expect(g.lessons).toEqual([]);
    expect(g.done.map(c => c.id)).toEqual(['c2', 'l3', 'r2', 'p3']);
  });

  it('到期那天还能用', () => {
    expect(isCardLive({ ...tenTimes, expiresOn: today }, today)).toBe(true);
    expect(isCardLive({ ...voucher, expiresOn: today }, today)).toBe(true);
  });

  it('期限卡剩余天数含今天；没生效的显示总天数和生效日', () => {
    expect(cardBalance(year, today)).toEqual({ type: 'days', left: 10, total: 221 });
    expect(cardBalance(year, '2026-10-21')).toMatchObject({ left: 1 });
    expect(cardBalance(next, today)).toEqual({ type: 'days', left: 30, total: 30, startsOn: '2026-10-22' });
  });

  it('次卡、好友送的、课时显示剩余/总数，体验券显示用没用', () => {
    expect(cardBalance(tenTimes, today)).toEqual({ type: 'times', left: 6, total: 10 });
    expect(cardBalance(gift, today)).toEqual({ type: 'times', left: 2, total: 2 });
    expect(cardBalance(pt, today)).toEqual({ type: 'times', left: 3, total: 5 });
    expect(cardBalance(voucher, today)).toEqual({ type: 'voucher', used: false });
    expect(cardBalance({ ...voucher, usedOn: today }, today)).toEqual({ type: 'voucher', used: true });
  });
});
