import {
  MEMBER_SOURCES,
  type ApiRequest,
  type ApiResponse,
  type DashboardSummary,
  type ExpiringCardRow,
  type LoginResult,
  type NewcomerRow,
  type ReferralFunnel,
  type RequestAdapter,
  type Staff,
  type StoreCompareRow,
} from '@climb/api';
import { expiringPeriodCards } from '@climb/core';
import { monthOf } from '@climb/utils';
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

/** 本月 1 日到今天第一次到店的新客，按来源；口径见 @climb/api 的 NewcomerRow */
function newcomerRows(db: MockDb, storeIds: string[]): NewcomerRow[] {
  const month = monthOf(db.today);
  const hasCard = (on: string | null) => on !== null && on <= db.today;
  const fresh = db.members.filter(m => monthOf(m.firstVisitOn) === month && m.firstVisitOn <= db.today && storeIds.includes(m.firstVisitStoreId));
  return MEMBER_SOURCES.map(source => {
    const ms = fresh.filter(m => m.source === source);
    return { source, visitors: ms.length, bought: ms.filter(m => hasCard(m.firstCardOn)).length };
  });
}

/** 本月发出的老带新邀请的漏斗，按邀请人的归属门店；口径见 @climb/api 的 ReferralFunnel */
function referralFunnel(db: MockDb, storeIds: string[]): ReferralFunnel {
  const month = monthOf(db.today);
  const member = (id: string | null) => (id ? db.members.find(m => m.id === id) : undefined);
  const sent = db.referrals.filter(
    r => monthOf(r.createdOn) === month && r.createdOn <= db.today && storeIds.includes(member(r.fromMemberId)?.homeStoreId ?? ''),
  );
  const claimed = sent.filter(r => r.claimedByMemberId);
  const visited = claimed.filter(r => r.usedOn && r.usedOn <= db.today);
  const bought = visited.filter(r => {
    const on = member(r.claimedByMemberId)?.firstCardOn;
    return on != null && on <= db.today;
  });
  return { sent: sent.length, claimed: claimed.length, visited: visited.length, bought: bought.length };
}

/** 快到期的期限卡，按会员归属门店；哪些卡算「快到期」由 @climb/core 决定 */
function expiringRows(db: MockDb, storeIds: string[]): ExpiringCardRow[] {
  const byId = new Map(db.members.map(m => [m.id, m]));
  return expiringPeriodCards(db.cards, db.today, db.rules).flatMap(c => {
    const m = byId.get(c.memberId);
    if (!m || !storeIds.includes(m.homeStoreId)) return [];
    return [{ cardId: c.id, cardName: c.name, memberId: m.id, memberName: m.name, storeId: m.homeStoreId, expiresOn: c.expiresOn }];
  });
}

type StoreStat = keyof MockDb['storeStats'][string];
const sumStats = (db: MockDb, ids: string[], k: StoreStat) => ids.reduce((n, id) => n + (db.storeStats[id]?.[k] ?? 0), 0);

function storeCompare(db: MockDb): StoreCompareRow[] {
  return db.stores.map(st => {
    const nc = newcomerRows(db, [st.id]);
    return {
      storeId: st.id,
      monthRevenueCents: sumStats(db, [st.id], 'monthRevenueCents'),
      todayEntries: sumStats(db, [st.id], 'todayEntries'),
      activeMembers: sumStats(db, [st.id], 'activeMembers'),
      newcomers: nc.reduce((n, r) => n + r.visitors, 0),
      newcomersBought: nc.reduce((n, r) => n + r.bought, 0),
    };
  });
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
      const sum = (k: StoreStat) => sumStats(db, ids, k);
      const res: DashboardSummary = {
        storeId,
        today: db.today,
        monthRevenueCents: sum('monthRevenueCents'),
        todayEntries: sum('todayEntries'),
        lastWeekSameTimeEntries: sum('lastWeekSameTimeEntries'),
        todayBookings: sum('todayBookings'),
        activeMembers: sum('activeMembers'),
        newcomers: newcomerRows(db, ids),
        referral: referralFunnel(db, ids),
        expiring: expiringRows(db, ids),
        stores: storeId ? null : storeCompare(db),
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
