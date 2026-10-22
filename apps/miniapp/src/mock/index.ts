import type { ApiRequest, CheckInPreview, CheckInResult, EntryQrBody, RequestAdapter } from '@climb/api';
import type { GymRules, WaiverVersion } from '@climb/core';
import { toDateKey, type DateKey } from '@climb/utils';
import { loadCurrentWx, loadDb, mockToken, saveCurrentWx, saveDb, seedDb, type MockDb, type MockStorage } from './db';
import { createRoutes } from './routes';
import { issueEntryQr } from './routes/checkins';
import { createMockAdapter, type MockIdentity } from './router';

export { MOCK_LEGACY_PHONE, MOCK_MEMBERS, MOCK_WAIVER, mockToken, mockWxToken, seedDb, type MockDb, type MockStorage } from './db';

export interface MockOptions {
  rules: GymRules;
  /** 测试里固定日期；默认取当天 */
  today?: () => DateKey;
  /** 测试里固定时间（订单的付款时限）；默认取现在 */
  now?: () => Date;
  db?: MockDb;
  /** 给了就从这里读数据，每次改数据的请求后存回去，刷新不丢 */
  storage?: MockStorage;
}

export interface Mock {
  adapter: RequestAdapter;
  db: MockDb;
  /**
   * 当前用的是哪个微信（openid）。小程序里 `uni.login` 的 code 在 mock 下就是它，
   * 登录时 `POST /auth/wx-login` 拿它换 token。
   */
  currentWx(): string;
  /** 当前微信绑着的会员；新微信还没验证手机号时为 null */
  currentMember(): string | null;
  /** 换成某位示例会员的微信 */
  switchMember(memberId: string): void;
  /** 换成一个没登录过的新微信，用来走「验证手机号」和认领老卡 */
  switchToNewWx(): void;
  /**
   * 模拟微信支付成功的回调：走一遍 `POST /pay/wechat/notify`，订单变成已支付并发卡。
   * 重复调用跟微信重复回调一样，不会再发卡。
   */
  simulatePayment(orderId: string): Promise<void>;
  /** 前台平板在某家店显示一个新的入场码（后端的 `GET /desk/qr`）；H5 的「模拟扫码」和测试用 */
  issueEntryQr(storeId: string): EntryQrBody;
  /**
   * 让另一位会员在某家店扫码入场（没签当前告知书就先签，用第一张能用的卡）；没有能用的卡抛错。
   * 开发面板用它模拟「邀请人入场」，老带新的领取人那边刷新后就能用体验券。
   */
  checkInAs(memberId: string, storeId: string): Promise<CheckInResult>;
  /** 后台上了一版新的告知书，今天生效（条款在旧版后面加一条），所有人入场前要重签；测试和开发面板用 */
  publishWaiver(): WaiverVersion;
  /** 数据回到示例数据（不改当前身份） */
  reset(): void;
  /** 模拟断网：打开后所有请求都失败（不是 ApiError，页面按网络问题处理）；开发面板用来看加载失败的样子 */
  setOffline(on: boolean): void;
  offline(): boolean;
}

/**
 * 后端没好之前用的假接口：实现 @climb/api 的契约。
 * 返回的 db 可以直接看和改，测试和开发面板会用到。
 */
export function createMock(opts: MockOptions): Mock {
  const now = opts.now ?? (() => new Date());
  const today = opts.today ?? (() => toDateKey(now()));
  const { storage } = opts;
  const db = opts.db ?? (storage ? loadDb(storage, today()) : seedDb(today()));
  let current: string = storage ? loadCurrentWx(storage) : 'wx-ajie';
  const setCurrent = (openid: string) => {
    current = openid;
    if (storage) saveCurrentWx(storage, openid);
  };

  const resolveToken = (token: string): MockIdentity => {
    if (token.startsWith('mock-wx:')) return { memberId: null, openid: token.slice(8) || null };
    const id = token.startsWith('mock:') ? token.slice(5) : '';
    return { memberId: db.members.some(m => m.id === id) ? id : null, openid: null };
  };
  const inner = createMockAdapter(createRoutes(db, { rules: opts.rules, today, now }), resolveToken);
  let offline = false;
  const adapter: RequestAdapter = async req => {
    if (offline) throw new Error('mock 断网');
    try {
      return await inner(req);
    } finally {
      if (storage && req.method !== 'GET') saveDb(storage, db);
    }
  };

  return {
    adapter,
    db,
    setOffline: on => { offline = on; },
    offline: () => offline,
    currentWx: () => current,
    currentMember: () => db.members.find(m => m.openid === current)?.id ?? null,
    switchMember(memberId) {
      const openid = db.members.find(m => m.id === memberId)?.openid;
      if (!openid) throw new Error(`mock 里没有登录过的会员 ${memberId}`);
      setCurrent(openid);
    },
    switchToNewWx() {
      setCurrent(`wx-new-${Date.now().toString(36)}`);
    },
    async simulatePayment(orderId) {
      const order = db.orders.find(o => o.id === orderId);
      if (!order) throw new Error(`mock 里没有订单 ${orderId}`);
      const res = await adapter({
        method: 'POST',
        url: '/pay/wechat/notify',
        headers: {},
        body: { outTradeNo: order.id, transactionId: `mock-wx-${order.id}`, amountCents: order.amountCents },
      });
      if (res.status !== 200) throw new Error(`模拟支付失败：${JSON.stringify(res.data)}`);
    },
    issueEntryQr(storeId) {
      const qr = issueEntryQr(db, storeId, now());
      if (storage) saveDb(storage, db);
      return qr;
    },
    async checkInAs(memberId, storeId) {
      const call = async <T>(method: ApiRequest['method'], url: string, body: unknown): Promise<T> => {
        const res = await adapter({ method, url, headers: { Authorization: `Bearer ${mockToken(memberId)}` }, body });
        if (res.status !== 200) throw new Error((res.data as { message?: string }).message ?? `模拟入场失败：${JSON.stringify(res.data)}`);
        return res.data as T;
      };
      const qr = issueEntryQr(db, storeId, now());
      const preview = await call<CheckInPreview>('POST', '/check-ins/preview', qr);
      const card = preview.options.find(o => o.usable)?.card;
      if (!card) throw new Error('这位会员没有能用来入场的卡');
      if (preview.waiver) await call('POST', '/waivers', { waiverVersionId: preview.waiver.id });
      return call<CheckInResult>('POST', '/check-ins', { ...qr, cardId: card.id, idempotencyKey: `dev-${++db.seq}` });
    },
    publishWaiver() {
      const n = db.waiverVersions.length + 1;
      const last = db.waiverVersions[db.waiverVersions.length - 1];
      const version = { ...last, id: `waiver-v${n}`, version: `${today().slice(0, 7)}-v${n}`, points: [...last.points, `（第 ${n} 版新加的一条示意条款）`], effectiveFrom: today() };
      db.waiverVersions.push(version);
      if (storage) saveDb(storage, db);
      return version;
    },
    reset() {
      // 路由里拿的是同一个 db 对象，所以原地替换内容
      Object.assign(db, seedDb(today()));
      if (storage) saveDb(storage, db);
    },
  };
}
