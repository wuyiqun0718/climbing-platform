import { ApiError, createApi } from '@climb/api';
import { defaultRules, ENTRY_QR_TTL_SECONDS, entrySheet } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from './index';

const TODAY = '2026-10-21';
const C10 = 'card-ajie-c10';
const YEAR = 'card-ajie-year';

function setup() {
  let now = new Date('2026-10-21T02:00:00.000Z');
  const mock = createMock({ rules: defaultRules, today: () => TODAY, now: () => now });
  const as = (memberId: string) => createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(memberId) });
  return { mock, ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), wait: (s: number) => { now = new Date(now.getTime() + s * 1000); } };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return ((e as ApiError).data as { code: string }).code;
};

describe('mock 扫码入场', () => {
  it('预览：门店和能用的卡，期限卡在前，冻结中的卡不列；预览不作废码', async () => {
    const { mock, ajie } = setup();
    const qr = mock.issueEntryQr('huiju');
    const preview = await ajie.checkIns.preview(qr);
    expect(preview).toMatchObject({ store: { id: 'huiju', name: '汇聚店' }, reentry: false, todayPolicy: null });
    expect(preview.options.map(o => [o.card.id, o.deducts])).toEqual([[YEAR, 0], [C10, 1]]);

    await ajie.me.freezeCard(YEAR, { days: 5 });
    expect((await ajie.checkIns.preview(qr)).options.map(o => o.card.id)).toEqual([C10]);
    expect(await ajie.checkIns.create({ ...qr, cardId: C10, idempotencyKey: 'k1' })).toMatchObject({ storeId: 'huiju', storeName: '汇聚店', deducted: 1 });
  });

  it('过期的码、用过的码、门店对不上的码被拒', async () => {
    const { mock, ajie, xiaolu, wait } = setup();
    const old = mock.issueEntryQr('binggang');
    wait(ENTRY_QR_TTL_SECONDS + 1);
    expect(await codeOf(ajie.checkIns.preview(old))).toBe('qr-expired');
    expect(await codeOf(ajie.checkIns.create({ ...old, cardId: YEAR, idempotencyKey: 'k1' }))).toBe('qr-expired');

    const qr = mock.issueEntryQr('binggang');
    expect(await codeOf(ajie.checkIns.preview({ ...qr, storeId: 'huiju' }))).toBe('invalid-qr');
    await ajie.checkIns.create({ ...qr, cardId: YEAR, idempotencyKey: 'k2' });
    expect(await codeOf(ajie.checkIns.create({ ...qr, cardId: YEAR, idempotencyKey: 'k3' }))).toBe('qr-used');
    expect(await codeOf(xiaolu.checkIns.preview(qr))).toBe('qr-used');
    expect(mock.db.entryQrs.find(q => q.token === qr.qrToken)).toMatchObject({ usedBy: MOCK_MEMBERS.ajie });
  });

  it('同一个幂等键提交两次只入场一次、只扣一次，返回同一条记录', async () => {
    const { mock, ajie } = setup();
    const body = { ...mock.issueEntryQr('binggang'), cardId: C10, idempotencyKey: 'k1' };
    const [a, b] = await Promise.all([ajie.checkIns.create(body), ajie.checkIns.create(body)]);
    expect(b).toEqual(a);
    expect(await ajie.checkIns.create(body)).toEqual(a);
    expect(mock.db.checkIns.filter(c => c.on === TODAY)).toHaveLength(1);
    expect((await ajie.me.cards()).find(c => c.id === C10)).toMatchObject({ remaining: 5 });
  });

  it('当天第一次入场投一张保单（投保中），同一天在别的店再入场不扣次、复用这张', async () => {
    const { mock, ajie } = setup();
    const first = await ajie.checkIns.create({ ...mock.issueEntryQr('binggang'), cardId: C10, idempotencyKey: 'k1' });
    expect(first).toMatchObject({ deducted: 1, reentry: false, policy: { status: 'pending', storeId: 'binggang', checkInId: first.id, on: TODAY } });

    const qr = mock.issueEntryQr('huanqiugang');
    expect(await ajie.checkIns.preview(qr)).toMatchObject({ reentry: true, todayPolicy: { id: first.policy.id } });
    const again = await ajie.checkIns.create({ ...qr, cardId: C10, idempotencyKey: 'k2' });
    expect(again).toMatchObject({ deducted: 0, reentry: true, storeName: '环球港店', policy: { id: first.policy.id, checkInId: first.id } });
    expect(mock.db.policies.filter(p => p.on === TODAY)).toHaveLength(1);
    expect((await ajie.me.cards()).find(c => c.id === C10)).toMatchObject({ remaining: 5 });
  });

  it('每个人各投各的；体验券入场也含保险', async () => {
    const { mock, ajie, xiaolu } = setup();
    const { card } = await xiaolu.shares.claim((await ajie.shares.createReferral()).id);
    const a = await ajie.checkIns.create({ ...mock.issueEntryQr('huiju'), cardId: YEAR, idempotencyKey: 'k1' });
    const b = await xiaolu.checkIns.create({ ...mock.issueEntryQr('huiju'), cardId: card.id, idempotencyKey: 'k1' });
    expect(b.policy).toMatchObject({ memberId: MOCK_MEMBERS.xiaolu, status: 'pending' });
    expect(b.policy.id).not.toBe(a.policy.id);
  });

  it('规则拦下的入场不作废码、不投保', async () => {
    const { mock, ajie, xiaolu } = setup();
    const { card } = await xiaolu.shares.claim((await ajie.shares.createReferral()).id);
    const qr = mock.issueEntryQr('huiju');
    expect(await codeOf(xiaolu.checkIns.create({ ...qr, cardId: card.id, idempotencyKey: 'k1' }))).toBe('inviter-not-checked-in');
    expect(mock.db.entryQrs.find(q => q.token === qr.qrToken)?.usedAt).toBeUndefined();
    expect(mock.db.policies.filter(p => p.on === TODAY)).toEqual([]);
  });

  it('没卡的新客：确认页只能买单次票；付完用新发的票、同一个码入场，扣 1 次', async () => {
    const { mock, xiaolu } = setup();
    const qr = mock.issueEntryQr('huiju');
    const preview = await xiaolu.checkIns.preview(qr);
    const sheet = entrySheet({ options: preview.options, products: await xiaolu.products.list(), todayPolicy: preview.todayPolicy });
    expect(sheet).toMatchObject({ mustBuy: true, selected: null, singleTicket: { id: 'single' }, insurance: { tag: '卡里含' } });
    const { order } = await xiaolu.orders.create({ productId: sheet.singleTicket!.id });
    await mock.simulatePayment(order.id);
    const paid = await xiaolu.orders.get(order.id);
    expect(await xiaolu.checkIns.create({ ...qr, cardId: paid.cardId!, idempotencyKey: 'k1' })).toMatchObject({ deducted: 1, reentry: false, policy: { status: 'pending' } });
  });
});
