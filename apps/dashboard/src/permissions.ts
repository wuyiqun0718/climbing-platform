import type { Staff, StaffRole, Store } from '@climb/api';

/**
 * 后台的角色权限：哪个角色能看哪些页、能做哪些操作，只写在这里。
 * 导航、路由守卫、页面上的按钮都查这里，不另写判断。
 * 依据 docs/mvp-plan.md：前台只能做前台操作，店长能改价和退款，老板能看所有店的财务。
 * 标「等馆方」的是先定的占位，馆方确认后只改这张表。
 */

export type PageKey = 'dashboard' | 'finance' | 'members' | 'courses' | 'events' | 'entries' | 'products' | 'staff' | 'settings' | 'audit';

export type ActionKey =
  /** 新建会员（13） */
  | 'member.create'
  /** 线下收款开卡（14） */
  | 'order.create'
  /** 手动登记入场（15） */
  | 'checkIn.create'
  /** 撤销入场（16）。已定前台可以撤销（必须写原因，进操作日志） */
  | 'checkIn.void'
  /** 调整次数、有效期（17） */
  | 'card.adjust'
  /** 冻结、解冻（17）。已定 manager 以上 */
  | 'card.freeze'
  /** 后台帮冻时超了冻结规则（次数、天数），写原因破例（17）。已定店长以上 */
  | 'card.freezeOverride'
  /** 退款（18）。等馆方：先放店长以上 */
  | 'order.refund'
  /** 新建卡种、改名称、卖点、上下架、排序（19） */
  | 'product.edit'
  /** 改卡种标价，新建卡种也要（19）。等馆方：谁能改价还在讨论，先放店长以上（mvp-plan 第 5 节「店长能改价」） */
  | 'product.price'
  /** 员工账号（22） */
  | 'staff.manage'
  /** 青橙导入（39） */
  | 'import.run'
  /** 导出 Excel（24）。等馆方：先放店长以上；每种导出另外要能看对应的页面（订单要财务） */
  | 'data.export'
  /** 导出时手机号不打码（24）。等馆方：先只给老板，其余跟会员列表一样打码 */
  | 'member.fullPhone'
  /** 改冻结规则（17.5）。已定老板能改；店长能不能改等定了权限再说 */
  | 'settings.freezeRules';

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
  settings: OWNER,
  /** 操作日志（23）。等馆方：先放店长以上，店长只看自己店的（见 canSeeAllAuditLogs） */
  audit: MANAGER_UP,
};

export const ACTION_ROLES: Record<ActionKey, readonly StaffRole[]> = {
  'member.create': ALL,
  'order.create': ALL,
  'checkIn.create': ALL,
  'checkIn.void': ALL,
  'card.adjust': MANAGER_UP,
  'card.freeze': MANAGER_UP,
  'card.freezeOverride': MANAGER_UP,
  'order.refund': MANAGER_UP,
  'product.edit': MANAGER_UP,
  'product.price': MANAGER_UP,
  'staff.manage': OWNER,
  'import.run': OWNER,
  'settings.freezeRules': OWNER,
  'data.export': MANAGER_UP,
  'member.fullPhone': OWNER,
};

export const canSeePage = (role: StaffRole, page: PageKey) => PAGE_ROLES[page].includes(role);

export const canDo = (role: StaffRole, action: ActionKey) => ACTION_ROLES[action].includes(role);

// ---- 门店 ----

/**
 * 只管部分门店的员工能不能在会员列表里看到、搜到别的店的会员。
 * 等馆方：先都能看（会员可以去任何一家店，前台要给别的店的会员登记入场）；改成 false 就只看归属自己店的。
 */
export const MEMBERS_VISIBLE_ACROSS_STORES = true;

/** storeIds 为空表示能看全部门店；只有这种员工能选「全部门店」（接口不带 store 就是全部门店） */
export const canSeeAllStores = (staff: Pick<Staff, 'storeIds'>) => staff.storeIds.length === 0;

/**
 * 操作日志能不能看全部（含卡种、员工、设置这类全馆的，不带门店）：老板都能看全部，别的角色按能不能看全部门店。
 * 等馆方（多店员工能不能看汇总还在讨论）：先这样，定了只改这里。看不了全部的只能按自己的店查，全馆的看不到。
 */
export const canSeeAllAuditLogs = (staff: Pick<Staff, 'role' | 'storeIds'>) => staff.role === 'owner' || canSeeAllStores(staff);

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
