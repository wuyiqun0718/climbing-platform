import type { Staff, StaffRole, Store } from '@climb/api';

/**
 * 后台的角色权限：哪个角色能看哪些页、能做哪些操作，只写在这里。
 * 导航、路由守卫、页面上的按钮都查这里，不另写判断。
 * 依据 docs/mvp-plan.md：前台只能做前台操作，店长能改价和退款，老板能看所有店的财务。
 * 标「等馆方」的是先定的占位，馆方确认后只改这张表。
 */

export type PageKey = 'dashboard' | 'finance' | 'members' | 'courses' | 'events' | 'entries' | 'products' | 'staff';

export type ActionKey =
  /** 线下收款开卡（14） */
  | 'order.create'
  /** 手动登记入场（15） */
  | 'checkIn.create'
  /** 撤销入场（16）。等馆方：前台能不能自己撤销，先允许（必须写原因，进操作日志） */
  | 'checkIn.void'
  /** 调整次数、有效期（17） */
  | 'card.adjust'
  /** 冻结、解冻（17）。等馆方：先跟调整一样只给店长以上 */
  | 'card.freeze'
  /** 退款（18） */
  | 'order.refund'
  /** 新建、改价、上下架卡种（19） */
  | 'product.edit'
  /** 员工账号（22） */
  | 'staff.manage'
  /** 青橙导入（39） */
  | 'import.run';

const ALL: StaffRole[] = ['owner', 'manager', 'desk'];
const MANAGER_UP: StaffRole[] = ['owner', 'manager'];
const OWNER: StaffRole[] = ['owner'];

export const PAGE_ROLES: Record<PageKey, readonly StaffRole[]> = {
  dashboard: ALL,
  finance: MANAGER_UP,
  members: ALL,
  courses: ALL,
  events: ALL,
  entries: ALL,
  products: MANAGER_UP,
  staff: OWNER,
};

export const ACTION_ROLES: Record<ActionKey, readonly StaffRole[]> = {
  'order.create': ALL,
  'checkIn.create': ALL,
  'checkIn.void': ALL,
  'card.adjust': MANAGER_UP,
  'card.freeze': MANAGER_UP,
  'order.refund': MANAGER_UP,
  'product.edit': MANAGER_UP,
  'staff.manage': OWNER,
  'import.run': OWNER,
};

export const canSeePage = (role: StaffRole, page: PageKey) => PAGE_ROLES[page].includes(role);

export const canDo = (role: StaffRole, action: ActionKey) => ACTION_ROLES[action].includes(role);

// ---- 门店 ----

/** storeIds 为空表示能看全部门店；只有这种员工能选「全部门店」（接口不带 store 就是全部门店） */
export const canSeeAllStores = (staff: Pick<Staff, 'storeIds'>) => staff.storeIds.length === 0;

export const canSeeStore = (staff: Pick<Staff, 'storeIds'>, storeId: string) => canSeeAllStores(staff) || staff.storeIds.includes(storeId);

/** 门店切换的选项；id 为 null 是「全部门店」 */
export function storeOptions(staff: Pick<Staff, 'storeIds'>, stores: Store[]): { id: string | null; name: string }[] {
  const own = stores.filter(s => canSeeStore(staff, s.id));
  return canSeeAllStores(staff) ? [{ id: null, name: '全部门店' }, ...own] : own;
}

/**
 * 当前门店：想要的（上次选的）还能选就用它，否则用第一个选项（能看全部的默认「全部门店」）。
 * 门店列表还没加载时（stores 为空）只按员工的 storeIds 判断，不清掉上次的选择。
 */
export function resolveStore(staff: Pick<Staff, 'storeIds'>, stores: Store[], wanted: string | null | undefined): string | null {
  if (stores.length === 0) {
    const allowed = wanted === null ? canSeeAllStores(staff) : wanted !== undefined && canSeeStore(staff, wanted);
    if (allowed) return wanted as string | null;
    return canSeeAllStores(staff) ? null : staff.storeIds[0]!;
  }
  const opts = storeOptions(staff, stores);
  if (wanted !== undefined && opts.some(o => o.id === wanted)) return wanted;
  return opts[0]?.id ?? null;
}
