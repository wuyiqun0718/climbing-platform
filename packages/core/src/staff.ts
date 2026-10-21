import { normalizePhone, phoneError } from './member';
import type { RuleErrorCode } from './rules';

/**
 * 员工账号（任务 22）：新建、修改、停用、重置密码的校验和不能做的改动。后台员工页、mock 和后端都按这里。
 * 只有老板能管员工（dashboard 的 permissions.ts，staff.manage）。
 *
 * 已定：
 * - 手机号是登录名，全馆唯一（停用的也占着，避免重新启用时撞号）。
 * - 可操作门店：要么「全部门店」（存成空数组，见 @climb/api 的 Staff.storeIds），要么至少选一家存在的店。
 * - 不能停用自己、不能改自己的角色；改完以后系统里至少要有一个在用的老板。
 * - 停用、重置密码后，这个员工已经登录的会话立即失效（后端按 token 版本号判断）。
 *
 * 等馆方的占位，确认后只改这几个常量：名字最多 STAFF_NAME_MAX 个字；密码 STAFF_PASSWORD_MIN–STAFF_PASSWORD_MAX 位，不限字符种类。
 */

export type StaffRole = 'owner' | 'manager' | 'desk';

export const STAFF_ROLES: readonly StaffRole[] = ['owner', 'manager', 'desk'];

export const STAFF_ROLE_TEXT: Record<StaffRole, string> = { owner: '馆长', manager: '店长', desk: '前台' };

/** 角色高低：数字大的权限多 */
const ROLE_RANK: Record<StaffRole, number> = { desk: 1, manager: 2, owner: 3 };

export const STAFF_NAME_MAX = 20;
export const STAFF_PASSWORD_MIN = 6;
export const STAFF_PASSWORD_MAX = 32;

/** 新建员工 POST /admin/staff */
export interface StaffInput {
  phone: string;
  name: string;
  role: StaffRole;
  /** 全部门店；true 时 storeIds 不看 */
  allStores: boolean;
  storeIds: string[];
  /** 初始密码 */
  password: string;
}

/** 修改员工 PATCH /admin/staff/:id：只传要改的；password 是重置密码，active 是停用、启用 */
export type StaffPatch = Partial<StaffInput & { active: boolean }>;

export type StaffErrors = Partial<Record<keyof StaffInput | 'active', string>>;

/** 校验时要的现状：现有门店 ID、现有员工（查手机号重复） */
export interface StaffContext {
  storeIds: readonly string[];
  staff: readonly { id: string; phone: string }[];
}

export function passwordError(v: unknown): string {
  if (typeof v !== 'string' || v.length < STAFF_PASSWORD_MIN || v.length > STAFF_PASSWORD_MAX) return `密码要 ${STAFF_PASSWORD_MIN}–${STAFF_PASSWORD_MAX} 位`;
  return '';
}

/** 存的门店：全部门店存空数组；否则去重 */
export const staffStoreIds = (allStores: boolean, storeIds: readonly string[]) => (allStores ? [] : [...new Set(storeIds)]);

function storesError(allStores: unknown, storeIds: unknown, ctx: StaffContext): string {
  if (allStores === true) return '';
  if (allStores !== false && allStores !== undefined) return '可操作门店格式不对';
  if (!Array.isArray(storeIds) || storeIds.length === 0) return '至少选一家店，或者选全部门店';
  if (storeIds.some(id => typeof id !== 'string' || !ctx.storeIds.includes(id))) return '有不存在的门店';
  return '';
}

function fieldErrors(input: Partial<Record<keyof StaffPatch, unknown>>, ctx: StaffContext, selfId: string | null, errs: StaffErrors) {
  if ('phone' in input) {
    const phone = typeof input.phone === 'string' ? normalizePhone(input.phone) : '';
    const e = phoneError(phone);
    if (e) errs.phone = e;
    else if (ctx.staff.some(s => s.id !== selfId && normalizePhone(s.phone) === phone)) errs.phone = '这个手机号已经有员工账号了';
  }
  if ('name' in input) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) errs.name = '请填名字';
    else if (name.length > STAFF_NAME_MAX) errs.name = `名字最多 ${STAFF_NAME_MAX} 个字`;
  }
  if ('role' in input && !STAFF_ROLES.includes(input.role as StaffRole)) errs.role = '请选角色';
  if ('allStores' in input || 'storeIds' in input) {
    const e = storesError(input.allStores, input.storeIds, ctx);
    if (e) errs.storeIds = e;
  }
  if ('password' in input) {
    const e = passwordError(input.password);
    if (e) errs.password = e;
  }
  if ('active' in input && typeof input.active !== 'boolean') errs.active = '状态不对';
}

/** 新建员工的校验，按字段给错误；全对返回 null。input 是接口收到的原样内容 */
export function newStaffErrors(input: Partial<Record<keyof StaffInput, unknown>>, ctx: StaffContext): StaffErrors | null {
  const errs: StaffErrors = {};
  fieldErrors({ phone: input.phone, name: input.name, role: input.role, allStores: input.allStores ?? false, storeIds: input.storeIds, password: input.password }, ctx, null, errs);
  return Object.keys(errs).length ? errs : null;
}

/** 修改员工的校验（只查传了的字段）；全对返回 null */
export function staffPatchErrors(id: string, patch: Partial<Record<keyof StaffPatch, unknown>>, ctx: StaffContext): StaffErrors | null {
  const errs: StaffErrors = {};
  fieldErrors(patch, ctx, id, errs);
  return Object.keys(errs).length ? errs : null;
}

export type StaffChangeBlockedBy = Extract<RuleErrorCode, 'staff-self-deactivate' | 'staff-self-demote' | 'staff-last-owner'>;

export const STAFF_BLOCKED_TEXT: Record<StaffChangeBlockedBy, string> = {
  'staff-self-deactivate': '不能停用自己的账号',
  'staff-self-demote': '不能改自己的角色',
  'staff-last-owner': '至少要留一个在用的馆长账号',
};

interface StaffState {
  id: string;
  role: StaffRole;
  active: boolean;
}

/**
 * 这次改动能不能做（先过 staffPatchErrors）：自己不能停用、不能降级（老板改自己的角色就是降级）；
 * 改完以后在用的老板不能一个都没有。actorId 是操作的员工，staff 是改之前的全部员工。
 */
export function staffChangeBlockedBy(actorId: string, target: StaffState, patch: Pick<StaffPatch, 'role' | 'active'>, staff: readonly StaffState[]): StaffChangeBlockedBy | null {
  const next: StaffState = { ...target, role: patch.role ?? target.role, active: patch.active ?? target.active };
  if (target.id === actorId) {
    if (target.active && !next.active) return 'staff-self-deactivate';
    if (ROLE_RANK[next.role] < ROLE_RANK[target.role]) return 'staff-self-demote';
  }
  const owners = staff.map(s => (s.id === target.id ? next : s)).filter(s => s.active && s.role === 'owner');
  if (!owners.length) return 'staff-last-owner';
  return null;
}
