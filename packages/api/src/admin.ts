import type { Cents, DateKey } from '@climb/utils';
import { createHttp, type ClientOptions } from './client';

/**
 * 后台接口（后端还没开始写，路径是约定稿，见 docs/mvp-plan.md 第 6 节）。
 * 后台按 docs/tasks-dashboard.md 逐个加接口，后端照这里的类型实现。
 */

export type StaffRole = 'owner' | 'manager' | 'desk';

export interface Store {
  id: string;
  name: string;
}

export interface Staff {
  id: string;
  name: string;
  phone: string;
  role: StaffRole;
  /** 能操作哪些店，空数组表示全部 */
  storeIds: string[];
}

export interface LoginResult {
  token: string;
  staff: Staff;
}

export interface DashboardSummary {
  /** 门店 ID；不传表示全部门店 */
  storeId: string | null;
  today: DateKey;
  monthRevenueCents: Cents;
  todayEntries: number;
  /** 上周同一天、截至同一时刻的入场人次 */
  lastWeekSameTimeEntries: number;
  todayBookings: number;
  activeMembers: number;
}

export function createAdminApi(opts: ClientOptions) {
  const http = createHttp(opts);
  return {
    auth: {
      login: (body: { phone: string; password: string }) => http<LoginResult>('POST', '/admin/auth/login', body),
      me: () => http<Staff>('GET', '/admin/auth/me'),
    },
    stores: {
      list: () => http<Store[]>('GET', '/admin/stores'),
    },
    dashboard: (q: { store?: string } = {}) =>
      http<DashboardSummary>('GET', q.store ? `/admin/dashboard?store=${encodeURIComponent(q.store)}` : '/admin/dashboard'),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
