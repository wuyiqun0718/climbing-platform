import type { ApiRequest, ApiResponse, DashboardSummary, LoginResult, RequestAdapter, Staff } from '@climb/api';
import { canSeeStore } from '../../permissions';
import type { MockDb } from './db';

/**
 * 后端没好之前用的假后端：实现 @climb/api 里后台接口的契约，数据放在内存里。
 * 新加接口时在 routes 里加一条，并在 adapter.test.ts 里加单测。
 */

interface Ctx {
  db: MockDb;
  body: any;
  query: URLSearchParams;
  params: string[];
  /** 登录的员工；公开接口为空 */
  staff: Staff | null;
}

type Handler = (ctx: Ctx) => ApiResponse;

const ok = (data: unknown): ApiResponse => ({ status: 200, data });
const fail = (status: number, code: string, message: string): ApiResponse => ({ status, data: { code, message } });

const TOKEN_PREFIX = 'mock-';

function toStaff({ password: _p, active: _a, ...s }: MockDb['staff'][number]): Staff {
  return s;
}


const routes: { method: ApiRequest['method']; path: RegExp; auth: boolean; handle: Handler }[] = [
  {
    method: 'POST',
    path: /^\/admin\/auth\/login$/,
    auth: false,
    handle: ({ db, body }) => {
      const s = db.staff.find(x => x.phone === body?.phone);
      if (!s || s.password !== body?.password) return fail(401, 'bad-credentials', '手机号或密码不对');
      if (!s.active) return fail(403, 'staff-inactive', '这个账号已停用，找馆长开通');
      const res: LoginResult = { token: TOKEN_PREFIX + s.id, staff: toStaff(s) };
      return ok(res);
    },
  },
  { method: 'GET', path: /^\/admin\/auth\/me$/, auth: true, handle: ({ staff }) => ok(staff) },
  {
    method: 'GET',
    path: /^\/admin\/stores$/,
    auth: true,
    handle: ({ db, staff }) => ok(db.stores.filter(st => canSeeStore(staff!, st.id))),
  },
  {
    method: 'GET',
    path: /^\/admin\/dashboard$/,
    auth: true,
    handle: ({ db, query, staff }) => {
      const storeId = query.get('store');
      if (storeId && !db.stores.some(st => st.id === storeId)) return fail(404, 'store-not-found', '没有这家店');
      // 只能看部分门店的员工，必须指定自己的店
      if (storeId ? !canSeeStore(staff!, storeId) : staff!.storeIds.length > 0) return fail(403, 'forbidden', '没有这家店的权限');
      const ids = storeId ? [storeId] : db.stores.map(st => st.id);
      const sum = (k: keyof MockDb['storeStats'][string]) => ids.reduce((n, id) => n + (db.storeStats[id]?.[k] ?? 0), 0);
      const res: DashboardSummary = {
        storeId,
        today: db.today,
        monthRevenueCents: sum('monthRevenueCents'),
        todayEntries: sum('todayEntries'),
        lastWeekSameTimeEntries: sum('lastWeekSameTimeEntries'),
        todayBookings: sum('todayBookings'),
        activeMembers: db.activeMembers,
      };
      return ok(res);
    },
  },
];

export function createMockAdapter(db: MockDb, opts: { delayMs?: number } = {}): RequestAdapter {
  return async req => {
    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
    const url = new URL(req.url, 'http://mock.local');
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.path);
      if (!m) continue;
      let staff: Staff | null = null;
      if (r.auth) {
        const token = req.headers.Authorization?.replace(/^Bearer /, '') ?? '';
        const s = token.startsWith(TOKEN_PREFIX) ? db.staff.find(x => x.id === token.slice(TOKEN_PREFIX.length) && x.active) : undefined;
        if (!s) return fail(401, 'unauthorized', '登录已过期，请重新登录');
        staff = toStaff(s);
      }
      // 返回深拷贝，避免页面改到 mock 里的数据
      const res = r.handle({ db, body: req.body, query: url.searchParams, params: m.slice(1), staff });
      return { status: res.status, data: structuredClone(res.data) };
    }
    return fail(404, 'not-found', `mock 还没实现 ${req.method} ${url.pathname}`);
  };
}
