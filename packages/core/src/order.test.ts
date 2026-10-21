import { describe, expect, it } from 'vitest';
import { addDays, addMonths } from '@climb/utils';
import { ledgerMismatch } from './ledger';
import { DEFAULT_VALID_MONTHS, DESK_PRICE_REASON_MAX, deskOrderErrors, issueCard, parseYuanInput, periodStartsOn, purchaseLedgerEntry } from './order';
import type { Card, Product } from './types';

const product = (p: Partial<Product> & Pick<Product, 'category'>): Product => ({ id: 'p', name: '卡', priceCents: 59_900, perks: [], onSale: true, ...p });
const month = product({ id: 'p-30', category: 'period', name: '月卡', days: 30 });
const ten = product({ id: 'p-10x', category: 'count', name: '10 次卡', quantity: 10, validMonths: 6, priceCents: 128_000 });

describe('线下收款开卡', () => {
  it('实收默认标价不用写原因；改低要写原因；不能高于标价、不能为 0', () => {
    const ok = { channel: 'desk_cash', amountCents: 59_900, priceReason: '' };
    expect(deskOrderErrors(month, ok)).toBeNull();
    expect(deskOrderErrors(month, { ...ok, amountCents: 50_000 })).toEqual({ priceReason: '改了价要写原因' });
    expect(deskOrderErrors(month, { ...ok, amountCents: 50_000, priceReason: '老会员续卡打折' })).toBeNull();
    expect(deskOrderErrors(month, { ...ok, amountCents: 60_000, priceReason: 'x' })?.amountCents).toBe('实收不能比标价高');
    expect(deskOrderErrors(month, { ...ok, amountCents: 0 })?.amountCents).toBeTruthy();
    expect(deskOrderErrors(month, { ...ok, amountCents: NaN })?.amountCents).toBeTruthy();
    expect(deskOrderErrors(month, { ...ok, amountCents: 1, priceReason: '啊'.repeat(DESK_PRICE_REASON_MAX + 1) })?.priceReason).toBeTruthy();
  });

  it('只收现金、POS、转账', () => {
    expect(deskOrderErrors(month, { channel: 'wechat', amountCents: 59_900, priceReason: '' })).toEqual({ channel: '请选收款方式' });
    expect(deskOrderErrors(month, { channel: 'desk_transfer', amountCents: 59_900, priceReason: '' })).toBeNull();
  });

  it('元转分：最多两位小数，格式不对是 NaN', () => {
    expect(parseYuanInput('599')).toBe(59_900);
    expect(parseYuanInput(' 599.5 ')).toBe(59_950);
    expect(parseYuanInput('0.07')).toBe(7);
    expect(parseYuanInput('599.555')).toBeNaN();
    expect(parseYuanInput('-1')).toBeNaN();
    expect(parseYuanInput('')).toBeNaN();
  });

  it('期限卡从今天算；有没到期的期限卡就接在最晚那张后面', () => {
    const today = '2026-10-21';
    expect(issueCard({ id: 'c1', product: month, memberId: 'm', cards: [], today })).toMatchObject({ kind: 'period', startsOn: today, expiresOn: '2026-11-19' });
    const cards: Card[] = [
      { id: 'a', kind: 'period', memberId: 'm', productId: 'p-30', name: '月卡', startsOn: '2026-10-01', expiresOn: '2026-10-30' },
      { id: 'b', kind: 'period', memberId: 'other', productId: 'p-30', name: '月卡', startsOn: '2026-10-01', expiresOn: '2026-12-30' },
      { id: 'c', kind: 'period', memberId: 'm', productId: 'p-30', name: '月卡', startsOn: '2026-09-01', expiresOn: '2026-12-01', status: 'refunded' },
    ];
    expect(periodStartsOn(cards, 'm', today)).toBe('2026-10-31');
    expect(periodStartsOn(cards, 'm', '2026-11-01')).toBe('2026-11-01');
  });

  it('次卡、课包按次数和有效月数开卡，purchase 流水跟卡对得上', () => {
    const card = issueCard({ id: 'c2', product: ten, memberId: 'm', cards: [], today: '2026-10-21' });
    expect(card).toMatchObject({ kind: 'count', total: 10, remaining: 10, expiresOn: '2027-04-20', productId: 'p-10x' });
    const pt = issueCard({ id: 'c3', product: product({ category: 'pt', quantity: 5, validMonths: 3 }), memberId: 'm', cards: [], today: '2026-10-21' });
    expect(pt).toMatchObject({ kind: 'pt', total: 5, remaining: 5, expiresOn: '2027-01-20' });
    for (const c of [card, pt, issueCard({ id: 'c4', product: month, memberId: 'm', cards: [], today: '2026-10-21' })]) {
      const e = purchaseLedgerEntry({ id: 'l', card: c, at: '2026-10-21T10:00:00+08:00', orderId: 'o', operator: { operatorType: 'staff', operatorId: 's' } });
      expect(e).toMatchObject({ reason: 'purchase', ref: { type: 'order', id: 'o' } });
      expect(ledgerMismatch(c, [e])).toBeNull();
    }
  });

  it('有效期含开卡当天；月底开卡按月底对齐', () => {
    const one = product({ category: 'count', quantity: 10, validMonths: 1 });
    expect(issueCard({ id: 'c', product: one, memberId: 'm', cards: [], today: '2026-10-21' }).expiresOn).toBe('2026-11-20');
    expect(issueCard({ id: 'c', product: one, memberId: 'm', cards: [], today: '2027-01-31' }).expiresOn).toBe(addDays(addMonths('2027-01-31', 1), -1));
  });

  it('没填有效月数：单次票只当天有效，多次的按 DEFAULT_VALID_MONTHS', () => {
    const today = '2026-10-21';
    const single = issueCard({ id: 'c', product: product({ category: 'count', quantity: 1 }), memberId: 'm', cards: [], today });
    expect(single).toMatchObject({ total: 1, remaining: 1, expiresOn: today });
    expect(issueCard({ id: 'c', product: product({ category: 'count' }), memberId: 'm', cards: [], today }).expiresOn).toBe(today);
    const multi = issueCard({ id: 'c', product: product({ category: 'class', quantity: 10 }), memberId: 'm', cards: [], today });
    expect(multi.expiresOn).toBe(addDays(addMonths(today, DEFAULT_VALID_MONTHS), -1));
    expect(multi.expiresOn).toBe('2027-10-20');
    const singleWithMonths = issueCard({ id: 'c', product: product({ category: 'pt', quantity: 1, validMonths: 3 }), memberId: 'm', cards: [], today });
    expect(singleWithMonths.expiresOn).toBe('2027-01-20');
  });
});
