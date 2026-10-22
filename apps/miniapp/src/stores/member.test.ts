import { createApi } from '@climb/api';
import { defaultRules, type Card } from '@climb/core';
import { describe, expect, it, vi } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from '../mock';
import { createMemberStore, type Me } from './member';

const TODAY = '2026-10-21';

/** 跟 src/stores/index.ts 一样接 mock，身份跟着 mock.currentMember() 走 */
function setup() {
  const mock = createMock({ rules: defaultRules, today: () => TODAY });
  const api = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(mock.currentMember() ?? '') });
  const fetchMe = vi.fn((): Promise<Me | null> => api.me.get());
  const fetchCards = vi.fn(() => api.me.cards());
  const store = createMemberStore({ fetchMe, fetchCards });
  const entry = (storeId: string, cardId: string) => ({ ...mock.issueEntryQr(storeId), cardId, idempotencyKey: `key-${Math.random()}` });
  return { mock, api, store, fetchMe, fetchCards, entry };
}

const remaining = (cards: readonly Card[], id: string) => {
  const c = cards.find(x => x.id === id);
  return c && 'remaining' in c ? c.remaining : undefined;
};

/** 手动控制什么时候返回 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

describe('会员 store', () => {
  it('启动时拉会员和卡包', async () => {
    const { store } = setup();
    expect(store.state.loaded).toBe(false);
    await store.load();
    expect(store.state.me).toMatchObject({ id: MOCK_MEMBERS.ajie, name: '阿杰', waiverSigned: true });
    expect(store.state.cards.map(c => c.id)).toEqual(['card-ajie-year', 'card-ajie-c10', 'card-ajie-class10', 'card-ajie-pt5']);
    expect(store.state.loaded).toBe(true);
    expect(store.state.loading).toBe(false);
  });

  it('同时多个页面要数据只拉一次，拉过以后不再拉', async () => {
    const { store, fetchMe, fetchCards } = setup();
    await Promise.all([store.load(), store.ensureLoaded(), store.ensureLoaded()]);
    await store.ensureLoaded();
    expect(fetchMe).toHaveBeenCalledTimes(1);
    expect(fetchCards).toHaveBeenCalledTimes(1);
  });

  it('没登录不拉卡包', async () => {
    const fetchCards = vi.fn(async () => [] as Card[]);
    const store = createMemberStore({ fetchMe: async () => null, fetchCards });
    await store.load();
    expect(store.state.me).toBeNull();
    expect(fetchCards).not.toHaveBeenCalled();
  });

  it('入场扣次后卡包刷新', async () => {
    const { entry, store, api } = setup();
    await store.load();
    await store.changeCards(() => api.checkIns.create(entry('binggang', 'card-ajie-c10')));
    expect(remaining(store.state.cards, 'card-ajie-c10')).toBe(5);
  });

  it('转赠和领取后两边的卡包都刷新', async () => {
    const { store, api, mock } = setup();
    await store.load();
    const share = await store.changeCards(() => api.shares.createCount({ cardId: 'card-ajie-c10', quantity: 2 }));
    expect(remaining(store.state.cards, 'card-ajie-c10')).toBe(4);

    mock.switchMember(MOCK_MEMBERS.xiaolu);
    await store.reset();
    expect(store.state.me?.name).toBe('小鹿');
    expect(store.state.cards).toEqual([]);

    await store.changeCards(() => api.shares.claim(share.token));
    expect(store.state.cards).toHaveLength(1);
    expect(store.state.cards[0]).toMatchObject({ kind: 'gift', remaining: 2 });
  });

  it('购卡这类以后加的操作也用 changeCards：外部改了卡包，刷新后能看到', async () => {
    const { store, mock } = setup();
    await store.load();
    const card: Card = { id: 'card-new', kind: 'count', memberId: MOCK_MEMBERS.ajie, productId: 'c20', name: '20 次卡', total: 20, remaining: 20, expiresOn: '2027-10-20' };
    await store.changeCards(async () => void mock.db.cards.push(card));
    expect(store.state.cards.map(c => c.id)).toContain('card-new');
  });

  it('操作失败不刷新，错误照常抛出', async () => {
    const { store, api, fetchCards } = setup();
    await store.load();
    await expect(store.changeCards(() => api.checkIns.create({ storeId: 'binggang', qrToken: 'nope', cardId: 'card-ajie-c10', idempotencyKey: 'k1' }))).rejects.toThrow();
    expect(fetchCards).toHaveBeenCalledTimes(1);
  });

  it('操作成功但刷新失败，结果照常返回', async () => {
    const { entry, store, api, fetchCards } = setup();
    await store.load();
    fetchCards.mockRejectedValueOnce(new Error('断网'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ci = await store.changeCards(() => api.checkIns.create(entry('binggang', 'card-ajie-c10')));
    expect(ci.deducted).toBe(1);
    expect(remaining(store.state.cards, 'card-ajie-c10')).toBe(6);
    warn.mockRestore();
  });

  it('换了身份后，旧身份晚回来的数据不覆盖新数据', async () => {
    const slow = deferred<Me | null>();
    const fetchMe = vi.fn().mockReturnValueOnce(slow.promise).mockResolvedValue({ id: 'b', name: '小鹿', phone: '13800000002', waiverSigned: false });
    const store = createMemberStore({ fetchMe, fetchCards: async () => [] });
    const first = store.load();
    await store.reset();
    slow.resolve({ id: 'a', name: '阿杰', phone: '13800000001', waiverSigned: true, coach: null });
    await first;
    expect(store.state.me?.name).toBe('小鹿');
    expect(store.state.loading).toBe(false);
  });

  it('签完告知书直接改本地状态', async () => {
    const { store, fetchMe } = setup();
    await store.load();
    store.markWaiverSigned();
    expect(store.state.me?.waiverSigned).toBe(true);
    expect(fetchMe).toHaveBeenCalledTimes(1);
  });
});

describe('拉取失败', () => {
  it('失败时 failed 为 true、loaded 不变；重试成功后清掉', async () => {
    const { store, fetchMe } = setup();
    fetchMe.mockRejectedValueOnce(new Error('断网'));
    await expect(store.load()).rejects.toThrow('断网');
    expect(store.state.failed).toBe(true);
    expect(store.state.loaded).toBe(false);
    const again = store.load();
    expect(store.state.failed).toBe(false);
    await again;
    expect(store.state.loaded).toBe(true);
    expect(store.state.failed).toBe(false);
  });

  it('换了身份后，旧请求晚失败不标 failed', async () => {
    const { store, fetchMe } = setup();
    const slow = deferred<Me | null>();
    fetchMe.mockImplementationOnce(() => slow.promise.then(() => { throw new Error('旧的'); }));
    const old = store.load().catch(() => {});
    const fresh = store.reset();
    slow.resolve(null);
    await old;
    await fresh;
    expect(store.state.failed).toBe(false);
    expect(store.state.loaded).toBe(true);
  });
});
