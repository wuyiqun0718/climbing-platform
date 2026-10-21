import { describe, expect, it } from 'vitest';
import { summarizeCards } from './summary';
import type { CountCard, GiftCard, PeriodCard, ReferralVoucher } from './types';

const today = '2026-10-12';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2026-10-21' };
const next: PeriodCard = { ...year, id: 'p2', startsOn: '2026-10-22', expiresOn: '2027-10-21' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const gift: GiftCard = { id: 'g1', kind: 'gift', memberId: 'jie', fromMemberId: 'lu', shareId: 's1', name: '好友送的次卡', total: 2, remaining: 2, expiresOn: '2026-12-01' };
const voucher: ReferralVoucher = { id: 'r1', kind: 'referral', memberId: 'lu', fromMemberId: 'jie', shareId: 's2', name: '老带新体验券', expiresOn: '2026-10-31' };

describe('首页卡摘要', () => {
  it('期限卡算上今天还剩几天，续的卡单独列出', () => {
    const s = summarizeCards([next, year], today);
    expect(s.period).toEqual({ card: year, daysLeft: 10 });
    expect(s.upcomingPeriod).toBe(next);
    expect(s.canEnter).toBe(true);
  });

  it('只有还没生效的期限卡时不能入场', () => {
    const s = summarizeCards([next], today);
    expect(s.period).toBeUndefined();
    expect(s.canEnter).toBe(false);
  });

  it('次卡和好友送的合计剩余次数，过期的不算', () => {
    const expired = { ...tenTimes, id: 'c2', expiresOn: '2026-10-11' };
    expect(summarizeCards([tenTimes, gift, expired], today).countLeft).toBe(8);
  });

  it('用完的次卡、用过或过期的体验券不算能入场', () => {
    const s = summarizeCards([{ ...tenTimes, remaining: 0 }, { ...voucher, usedOn: '2026-10-10' }, { ...voucher, id: 'r2', expiresOn: '2026-10-11' }], today);
    expect(s).toMatchObject({ countLeft: 0, voucher: undefined, canEnter: false });
  });

  it('没用过的体验券可以入场', () => {
    expect(summarizeCards([voucher], today)).toMatchObject({ voucher, canEnter: true });
  });
});
