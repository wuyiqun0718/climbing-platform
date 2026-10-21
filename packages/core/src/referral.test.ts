import { describe, expect, it } from 'vitest';
import { defaultRules } from './gym';
import { createReferral, referralRecords, referralStatus } from './referral';
import { RuleError } from './rules';
import { claimShare } from './share';
import { newShareToken } from './shareToken';
import type { PeriodCard, Share } from './types';

const today = '2026-10-12';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const T = () => newShareToken(n => crypto.getRandomValues(new Uint8Array(n)));
const send = (id: string, on: string, sent: Share[] = [], rules = defaultRules) =>
  createReferral({ id, token: T(), cards: [year], sent, memberId: 'jie', today: on, rules });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as RuleError).code; } return null; };
const status = (cards = [year], sent: Share[] = [], rules = defaultRules, on = today) => referralStatus({ cards, sent, memberId: 'jie', today: on, rules });

describe('老带新名额', () => {
  it('有正在用的期限卡，本月按 GymRules 给名额；发了就少一个，下个月重新算', () => {
    expect(status()).toEqual({ perMonth: 1, used: 0, left: 1, blockedBy: null });
    const sent = [send('r1', today)];
    expect(status([year], sent)).toEqual({ perMonth: 1, used: 1, left: 0, blockedBy: 'referral-quota-used' });
    expect(status([year], sent, defaultRules, '2026-11-01')).toMatchObject({ used: 0, left: 1, blockedBy: null });
  });

  it('名额数改 GymRules 就行', () => {
    const rules = { ...defaultRules, referralsPerMonth: 2 };
    const sent = [send('r1', today, [], rules)];
    expect(status([year], sent, rules)).toMatchObject({ perMonth: 2, used: 1, left: 1 });
    sent.push(send('r2', today, sent, rules));
    expect(code(() => send('r3', today, sent, rules))).toBe('referral-quota-used');
  });

  it('朋友没领、过期了，也占本月名额；别人发的不算', () => {
    const mine = { ...send('r1', '2026-10-01'), expiresOn: '2026-10-31' };
    const others = { ...mine, id: 'r9', fromMemberId: 'lu' };
    expect(status([year], [others])).toMatchObject({ used: 0, left: 1 });
    expect(status([year], [mine])).toMatchObject({ used: 1, left: 0 });
  });

  it('期限卡冻结中：单独说明原因，不能发', () => {
    const frozen = { ...year, status: 'frozen' as const, frozenFrom: '2026-10-10', frozenUntil: '2026-10-20' };
    expect(status([frozen])).toMatchObject({ left: 0, blockedBy: 'referral-card-frozen' });
    expect(code(() => createReferral({ id: 'r1', token: T(), cards: [frozen], sent: [], memberId: 'jie', today, rules: defaultRules }))).toBe('referral-card-frozen');
    // 冻结的卡旁边还有一张正在用的期限卡，照样能发
    expect(status([frozen, { ...year, id: 'p2' }])).toMatchObject({ blockedBy: null, left: 1 });
  });

  it('没有期限卡、期限卡过期或还没开始、作废或退款，都算没有期限卡', () => {
    expect(status([])).toMatchObject({ left: 0, blockedBy: 'no-period-card' });
    expect(status([{ ...year, expiresOn: '2026-10-11' }])).toMatchObject({ blockedBy: 'no-period-card' });
    expect(status([{ ...year, startsOn: '2026-11-01' }])).toMatchObject({ blockedBy: 'no-period-card' });
    expect(status([{ ...year, status: 'void' }])).toMatchObject({ blockedBy: 'no-period-card' });
    expect(status([{ ...year, memberId: 'lu' }])).toMatchObject({ blockedBy: 'no-period-card' });
  });

  it('体验券当月底前有效', () => {
    expect(send('r1', today)).toMatchObject({ kind: 'referral', fromMemberId: 'jie', createdOn: today, expiresOn: '2026-10-31', status: 'pending' });
  });
});

describe('老带新已发记录', () => {
  it('最近的在前；分别是等领取、过期、领了没来、来过了', () => {
    const sep = send('r1', '2026-09-03');
    const aug = send('r0', '2026-08-03');
    const oct = send('r2', '2026-10-05');
    const claimed = claimShare({ share: aug, claimerId: 'lu', claimerCards: [], cardId: 'v0', today: '2026-08-04' });
    const used = claimShare({ share: oct, claimerId: 'xia', claimerCards: [], cardId: 'v2', today });
    const cards = [claimed.card, { ...used.card, usedOn: today }];
    const records = referralRecords({ sent: [aug.id, sep.id, oct.id].map(id => [claimed.share, sep, used.share].find(s => s.id === id)!), cards, memberId: 'jie', today });
    expect(records.map(r => [r.share.id, r.state, r.claimerId, r.usedOn])).toEqual([
      ['r2', 'used', 'xia', today],
      ['r1', 'expired', undefined, undefined],
      ['r0', 'claimed', 'lu', undefined],
    ]);
    expect(referralRecords({ sent: [send('r3', today)], cards: [], memberId: 'jie', today })[0].state).toBe('pending');
    expect(referralRecords({ sent: [sep], cards: [], memberId: 'lu', today })).toEqual([]);
  });
});
