import { describe, expect, it } from 'vitest';
import { cardState, cardText } from './cardText';
import { isCardValid } from './rules';
import type { Card, CountCard, LessonCard, PeriodCard, ReferralVoucher } from './types';

const today = '2026-10-12';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const voucher: ReferralVoucher = { id: 'r1', kind: 'referral', memberId: 'jie', fromMemberId: 'x', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31' };
const pt: LessonCard = { id: 'l1', kind: 'pt', memberId: 'jie', productId: 'pt5', name: '私教 5 节', total: 5, remaining: 2, expiresOn: '2027-01-01' };

describe('卡的展示文字', () => {
  it('期限卡：剩几天（今天到期算 1 天）和起止日期', () => {
    expect(cardText(year, today)).toEqual({ kind: '期限卡', value: 154, unit: '天后到期', meta: '2026.03.15 – 2027.03.14' });
    expect(cardText({ ...year, expiresOn: today }, today).value).toBe(1);
    expect(cardText({ ...year, expiresOn: '2026-10-11' }, today)).toMatchObject({ value: '已到期', unit: '' });
  });

  it('次卡、课时：剩余 / 总数，有效期', () => {
    expect(cardText(tenTimes, today)).toEqual({ kind: '次卡', value: 6, unit: '/ 10 次', meta: '2027.02.06 前有效' });
    expect(cardText(pt, today)).toMatchObject({ kind: '私教课时', value: 2, unit: '/ 5 节' });
  });

  it('体验券：用过显示已用；小程序传了不能用显示等待', () => {
    expect(cardText(voucher, today).value).toBe('可用');
    expect(cardText(voucher, today, { usable: false }).value).toBe('等待');
    expect(cardText({ ...voucher, usedOn: today }, today).value).toBe('已用');
  });
});

describe('卡的状态', () => {
  it('卡上存的状态优先，正常的再看过期、用完、没开始', () => {
    expect(cardState(tenTimes, today)).toBe('normal');
    expect(cardState({ ...tenTimes, status: 'frozen' }, today)).toBe('frozen');
    expect(cardState({ ...tenTimes, status: 'refunded', remaining: 0 }, today)).toBe('refunded');
    expect(cardState({ ...tenTimes, remaining: 0 }, today)).toBe('used_up');
    expect(cardState({ ...tenTimes, expiresOn: '2026-10-11' }, today)).toBe('expired');
    expect(cardState({ ...year, startsOn: '2026-10-13' }, today)).toBe('not_started');
    expect(cardState({ ...voucher, usedOn: today }, today)).toBe('used_up');
  });

  it('正常和还没开始的就是有效卡，跟 isCardValid 一致', () => {
    const cards: Card[] = [
      year, tenTimes, voucher, pt,
      { ...year, startsOn: '2026-10-20' }, { ...tenTimes, remaining: 0 }, { ...tenTimes, status: 'void' }, { ...voucher, usedOn: today }, { ...pt, expiresOn: '2026-01-01' },
    ];
    for (const c of cards) expect(['normal', 'not_started'].includes(cardState(c, today))).toBe(isCardValid(c, today));
  });
});
