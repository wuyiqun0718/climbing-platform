import { describe, expect, it } from 'vitest';
import { checkInPlan, type CheckInArgs } from './checkIn';
import { entryBlockedText, entryInsurance, entrySheet, pickEntryCard, singleTicketOf } from './entrySheet';
import { defaultRules } from './gym';
import type { CountCard, PeriodCard, Product, ReferralVoucher } from './types';

const today = '2026-10-21';
const year: PeriodCard = { id: 'p1', kind: 'period', memberId: 'jie', productId: 'y1', name: '年卡', startsOn: '2026-03-15', expiresOn: '2027-03-14' };
const tenTimes: CountCard = { id: 'c1', kind: 'count', memberId: 'jie', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: '2027-02-06' };
const voucher: ReferralVoucher = { id: 'v1', kind: 'referral', memberId: 'jie', fromMemberId: 'lu', shareId: 's1', name: '老带新体验券', expiresOn: '2026-10-31' };

const product = (id: string, priceCents: number, over: Partial<Product> = {}): Product =>
  ({ id, category: 'count', name: id, priceCents, quantity: 1, perks: [], onSale: true, ...over });
const products = [product('c10', 89900, { quantity: 10 }), product('single', 10800), product('single-cheap', 9800, { onSale: false })];

const plan = (cards: CheckInArgs['cards'], inviterIn = false) => checkInPlan({
  memberId: 'jie', storeId: 'bingang', cards, past: [],
  ctx: { today, rules: defaultRules, hasCheckedIn: () => inviterIn },
});
const sheet = (cards: CheckInArgs['cards'], inviterIn = false) =>
  entrySheet({ options: plan(cards, inviterIn).options, products, todayPolicy: null });

describe('入场确认页', () => {
  it('期限卡和次卡都有时默认选期限卡', () => {
    const s = sheet([tenTimes, year]);
    expect(s).toMatchObject({ selected: 'p1', mustBuy: false });
    expect(s.options.map(o => o.card.id)).toEqual(['p1', 'c1']);
  });

  it('没有卡时只能买单次票，单次票取在售的', () => {
    expect(sheet([])).toMatchObject({ selected: null, mustBuy: true, waitingInviter: false, singleTicket: { id: 'single' } });
  });

  it('只有体验券、邀请人没入场：列出但禁用，显示原因，只能买单次票', () => {
    const s = sheet([voucher]);
    expect(s).toMatchObject({ selected: null, mustBuy: true, waitingInviter: true });
    expect(s.options[0]).toMatchObject({ usable: false });
    expect(entryBlockedText(s.options[0])).toBe('邀请人今天还没入场');
  });

  it('邀请人入场后体验券能用', () => {
    expect(sheet([voucher], true)).toMatchObject({ selected: 'v1', mustBuy: false, waitingInviter: false });
  });

  it('有次卡又有被拦的体验券：默认次卡，点体验券不换', () => {
    const s = sheet([voucher, tenTimes]);
    expect(s).toMatchObject({ selected: 'c1', mustBuy: false, waitingInviter: true });
    expect(pickEntryCard(s, 'v1')).toBe('c1');
    expect(pickEntryCard(s, 'nope')).toBe('c1');
  });

  it('点能用的卡就换过去', () => {
    expect(pickEntryCard(sheet([tenTimes, year]), 'c1')).toBe('c1');
  });

  it('没有在售的单次票时为 null', () => {
    expect(singleTicketOf([product('single', 10800, { onSale: false }), product('c10', 89900, { quantity: 10 })])).toBeNull();
    expect(singleTicketOf([product('a', 12800), product('b', 10800), product('pt', 100, { category: 'pt' })])?.id).toBe('b');
  });

  it('保险：今天没投过标「卡里含」，投过标「今天已投保」', () => {
    expect(entryInsurance(null).tag).toBe('卡里含');
    expect(entryInsurance({ status: 'pending' }).tag).toBe('今天已投保');
  });
});
