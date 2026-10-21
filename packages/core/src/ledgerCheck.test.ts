import { describe, expect, it } from 'vitest';
import { ledgerAfterText, ledgerDeltaText, ledgerMismatch } from './ledgerCheck';
import type { CountCard, LedgerEntry, PeriodCard } from './types';

const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 8, expiresOn: '2027-02-06' };
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };

let n = 0;
const entry = (cardId: string, delta: number, remainingAfter: number | null, expiresOnAfter: string, reason: LedgerEntry['reason'] = 'check_in'): LedgerEntry => ({
  id: `l${++n}`, cardId, at: '2026-10-01T10:00:00+08:00', on: '2026-10-01', delta, ...(remainingAfter === null ? {} : { remainingAfter }), expiresOnAfter, reason, operatorType: 'member', operatorId: 'jie',
});

describe('卡流水对账', () => {
  const count = [
    entry('c1', 10, 10, '2027-02-06', 'purchase'),
    entry('c1', -1, 9, '2027-02-06'),
    entry('c1', -1, 8, '2027-02-06'),
    entry('c1', -1, 7, '2027-02-06'),
    entry('c1', 1, 8, '2027-02-06', 'check_in_void'),
  ];

  it('每笔接得上、最后一笔等于卡上的就一致', () => {
    expect(ledgerMismatch(tenTimes, count)).toBeNull();
    expect(ledgerMismatch(year, [entry('p1', 0, null, '2027-03-14', 'purchase')])).toBeNull();
  });

  it('只看这张卡的流水', () => {
    expect(ledgerMismatch(tenTimes, [entry('x', 5, 5, '2027-01-01', 'purchase'), ...count])).toBeNull();
  });

  it('最后一笔跟卡上的剩余、到期日对不上', () => {
    expect(ledgerMismatch({ ...tenTimes, remaining: 7 }, count)).toMatch('卡上剩 7');
    expect(ledgerMismatch({ ...tenTimes, expiresOn: '2027-03-01' }, count)).toMatch('到期');
  });

  it('中间某一笔算错了', () => {
    const bad = [...count.slice(0, 2), entry('c1', -1, 7, '2027-02-06')];
    expect(ledgerMismatch({ ...tenTimes, remaining: 7 }, bad)).toMatch('9 -1 ≠ 7');
  });

  it('没有流水、期限卡记了次数都不行', () => {
    expect(ledgerMismatch(tenTimes, [])).toBe('没有流水');
    expect(ledgerMismatch(year, [entry('p1', 1, 1, '2027-03-14', 'purchase')])).toMatch('不记次数');
  });
});

describe('卡流水的展示文字', () => {
  it('变化量：有正负号；次数没变的看有效期变没变', () => {
    expect(ledgerDeltaText(tenTimes, entry('c1', 10, 10, '2027-02-06', 'purchase'), undefined)).toBe('+10 次');
    expect(ledgerDeltaText(tenTimes, entry('c1', -1, 9, '2027-02-06'), undefined)).toBe('−1 次');
    const before = entry('p1', 0, null, '2027-03-14', 'purchase');
    expect(ledgerDeltaText(year, entry('p1', 0, null, '2027-04-14', 'unfreeze'), before)).toBe('改有效期');
    expect(ledgerDeltaText(year, entry('p1', 0, null, '2027-03-14', 'freeze'), before)).toBe('—');
  });

  it('变化后：次卡写剩几次和到期日，期限卡只写到期日', () => {
    expect(ledgerAfterText(tenTimes, entry('c1', -1, 9, '2027-02-06'))).toBe('剩 9 次，2027.02.06 到期');
    expect(ledgerAfterText(year, entry('p1', 0, null, '2027-03-14', 'purchase'))).toBe('2027.03.14 到期');
  });
});

