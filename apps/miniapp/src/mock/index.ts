import type { RequestAdapter } from '@climb/api';
import type { GymRules } from '@climb/core';
import { toDateKey, type DateKey } from '@climb/utils';
import { loadCurrentWx, loadDb, saveCurrentWx, saveDb, seedDb, type MockDb, type MockStorage } from './db';
import { createRoutes } from './routes';
import { createMockAdapter, type MockIdentity } from './router';

export { MOCK_LEGACY_PHONE, MOCK_MEMBERS, mockToken, mockWxToken, seedDb, type MockDb, type MockStorage } from './db';

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
  /** 数据回到示例数据（不改当前身份） */
  reset(): void;
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
  const adapter: RequestAdapter = async req => {
    try {
      return await inner(req);
    } finally {
      if (storage && req.method !== 'GET') saveDb(storage, db);
    }
  };

  return {
    adapter,
    db,
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
    reset() {
      // 路由里拿的是同一个 db 对象，所以原地替换内容
      Object.assign(db, seedDb(today()));
      if (storage) saveDb(storage, db);
    },
  };
}
