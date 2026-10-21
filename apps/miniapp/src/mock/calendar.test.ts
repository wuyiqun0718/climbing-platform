import { ApiError, createApi } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from './index';

const TODAY = '2026-10-21';

function setup() {
  const mock = createMock({ rules: defaultRules, today: () => TODAY, now: () => new Date(`${TODAY}T15:00:00`) });
  const as = (memberId: string | null) =>
    createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => (memberId ? mockToken(memberId) : null) });
  const entry = (storeId: string, cardId: string) => ({ ...mock.issueEntryQr(storeId), cardId, idempotencyKey: `key-${Math.random()}` });
  return { mock, db: mock.db, entry, ajie: as(MOCK_MEMBERS.ajie), xiaolu: as(MOCK_MEMBERS.xiaolu), guest: as(null) };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: ((e as ApiError).data as { code: string }).code };
};

describe('mock 攀爬日历', () => {
  it('默认这个月；示例数据里的入场按月出现，翻到上个月能看到', async () => {
    const { ajie } = setup();
    const oct = await ajie.me.checkIns();
    expect(oct.month).toBe('2026-10');
    expect(oct.days).toEqual([{ on: '2026-10-14', storeIds: ['huanqiugang'], count: 1, stores: [{ id: 'huanqiugang', name: '环球港店' }] }]);
    expect((await ajie.me.checkIns('2026-09')).days.map(d => d.on)).toEqual(['2026-09-01', '2026-09-15', '2026-09-30']);
    expect((await ajie.me.checkIns('2026-12')).days).toEqual([]);
  });

  it('同一天去了两家店、再次入场：只标一天，列出两家店', async () => {
    const { ajie, entry } = setup();
    await ajie.checkIns.create(entry('binggang', 'card-ajie-year'));
    await ajie.checkIns.create(entry('huiju', 'card-ajie-year'));
    await ajie.checkIns.create(entry('binggang', 'card-ajie-year'));
    const today = (await ajie.me.checkIns()).days.find(d => d.on === TODAY)!;
    expect(today).toMatchObject({ storeIds: ['binggang', 'huiju'], count: 3 });
    expect(today.stores.map(s => s.name)).toEqual(['滨港店', '汇聚店']);
  });

  it('被前台撤销的入场不算', async () => {
    const { ajie, db, entry } = setup();
    const ci = await ajie.checkIns.create(entry('binggang', 'card-ajie-year'));
    db.checkIns.find(c => c.id === ci.id)!.voided = true;
    expect((await ajie.me.checkIns()).days.map(d => d.on)).toEqual(['2026-10-14']);
  });

  it('只看自己的；没登录 401，月份格式不对 400', async () => {
    const { xiaolu, guest } = setup();
    expect((await xiaolu.me.checkIns()).days).toEqual([]);
    expect((await codeOf(guest.me.checkIns())).status).toBe(401);
    expect(await codeOf(xiaolu.me.checkIns('2026-13'))).toEqual({ status: 400, code: 'bad-request' });
    expect(await codeOf(xiaolu.me.checkIns('2026-1'))).toEqual({ status: 400, code: 'bad-request' });
  });
});
