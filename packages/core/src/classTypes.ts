import type { DateKey } from '@climb/utils';
import type { ClassSession, ClassType } from './classes';
import type { ClassRules } from './gym';
import { RuleError } from './rules';

/**
 * 后台团课课程种类（任务 25）的校验，和排课时从种类拷到一节课（任务 26 用）。类型和 classRules 在 classes.ts / gym.ts，跟小程序同一份。
 *
 * 已定：
 * - 停用的种类不能再排新课（sessionFromType 拦），已经排了的照常上。
 * - 排课时把课名、时长、人数上限、扣次、默认教练拷到 ClassSession，以后改种类不影响已排的课。
 * - 时长、人数上限、扣次都是正整数。
 *
 * 等馆方的占位，确认后只改这几个常量：课名最多 CLASS_NAME_MAX 字；时长最多 CLASS_MINUTES_MAX 分钟；人数上限最多 CLASS_CAPACITY_MAX；
 * 扣次最多 CLASS_CREDITS_MAX；启用的种类不能重名。单节价（不用课包、按节付钱）小程序那边的 ClassType 还没有，先不做。
 * 候补、取消截止、迟到的规则在 GymRules.classRules（defaultClassRules 是占位），校验用 classRulesErrors。
 */

export const CLASS_NAME_MAX = 20;
export const CLASS_MINUTES_MAX = 480;
export const CLASS_CAPACITY_MAX = 200;
export const CLASS_CREDITS_MAX = 20;
/** classRules 里分钟数的上限（一周），防手滑 */
export const CLASS_RULE_MINUTES_MAX = 7 * 24 * 60;

/** 新建课程种类 POST /admin/class-types；credits 不填为 1，active 不填为启用 */
export interface ClassTypeInput {
  name: string;
  minutes: number;
  capacity: number;
  credits?: number;
  coachId?: string;
  active?: boolean;
}

/** 修改课程种类 PATCH /admin/class-types/:id：只传要改的；coachId 传 null 是去掉默认教练 */
export type ClassTypePatch = Partial<Omit<ClassTypeInput, 'coachId'>> & { coachId?: string | null };

export type ClassTypeErrors = Partial<Record<keyof ClassTypeInput, string>>;

/** 校验时要的现状：现有种类（查重名）、能当教练的员工 ID（在用的；教练资料见任务 28） */
export interface ClassTypeContext {
  types: readonly ClassType[];
  coachIds: readonly string[];
}

const isInt = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const nameTaken = (types: readonly ClassType[], name: string, exceptId?: string) => types.some(t => t.active && t.id !== exceptId && t.name.trim() === name);

function fieldErrors(input: Partial<Record<keyof ClassTypeInput, unknown>>, errs: ClassTypeErrors, ctx: ClassTypeContext) {
  if ('name' in input) {
    const name = cleanName(input.name);
    if (!name) errs.name = '请填课程名';
    else if (name.length > CLASS_NAME_MAX) errs.name = `课程名最多 ${CLASS_NAME_MAX} 个字`;
  }
  if ('minutes' in input && !isInt(input.minutes, CLASS_MINUTES_MAX)) errs.minutes = `时长填 1–${CLASS_MINUTES_MAX} 的整数（分钟）`;
  if ('capacity' in input && !isInt(input.capacity, CLASS_CAPACITY_MAX)) errs.capacity = `人数上限填 1–${CLASS_CAPACITY_MAX} 的整数`;
  if ('credits' in input && input.credits !== undefined && !isInt(input.credits, CLASS_CREDITS_MAX)) errs.credits = `扣次填 1–${CLASS_CREDITS_MAX} 的整数`;
  if ('coachId' in input && input.coachId !== undefined && input.coachId !== null && !ctx.coachIds.includes(input.coachId as string)) errs.coachId = '没有这个教练，或者账号停用了';
  if ('active' in input && input.active !== undefined && typeof input.active !== 'boolean') errs.active = '选一下启用还是停用';
}

/** 新建课程种类的校验，按字段给错误；全对返回 null。input 是接口收到的原样内容 */
export function newClassTypeErrors(input: Partial<Record<keyof ClassTypeInput, unknown>>, ctx: ClassTypeContext): ClassTypeErrors | null {
  const errs: ClassTypeErrors = {};
  fieldErrors({ ...input, name: input.name, minutes: input.minutes, capacity: input.capacity }, errs, ctx);
  if (!errs.name && input.active !== false && nameTaken(ctx.types, cleanName(input.name))) errs.name = '已经有这个课程了';
  return Object.keys(errs).length ? errs : null;
}

/** 修改课程种类的校验（只查传了的字段）；全对返回 null。改名或重新启用时查重名 */
export function classTypePatchErrors(type: ClassType, patch: Partial<Record<keyof ClassTypeInput, unknown>>, ctx: ClassTypeContext): ClassTypeErrors | null {
  const errs: ClassTypeErrors = {};
  // 原来的默认教练后来停用了，不改它的话照样能存
  const coach = 'coachId' in patch && patch.coachId === type.coachId ? { ...ctx, coachIds: [...ctx.coachIds, type.coachId!] } : ctx;
  fieldErrors(patch, errs, coach);
  if (!errs.name && !errs.active) {
    const after = applyClassTypePatch(type, patch as ClassTypePatch);
    if (after.active && (after.name !== type.name || !type.active) && nameTaken(ctx.types, after.name, type.id)) errs.name = '已经有这个课程了';
  }
  return Object.keys(errs).length ? errs : null;
}

/** 按新建的内容建一个课程种类（先用 newClassTypeErrors 校验过） */
export function buildClassType(id: string, input: ClassTypeInput): ClassType {
  const t: ClassType = { id, name: input.name.trim(), minutes: input.minutes, capacity: input.capacity, credits: input.credits ?? 1, active: input.active ?? true };
  if (input.coachId) t.coachId = input.coachId;
  return t;
}

/** 改后的课程种类（先用 classTypePatchErrors 校验过）；只取能改的字段 */
export function applyClassTypePatch(type: ClassType, patch: ClassTypePatch): ClassType {
  const next: ClassType = { ...type };
  if (patch.name !== undefined) next.name = cleanName(patch.name);
  if (patch.minutes !== undefined) next.minutes = patch.minutes;
  if (patch.capacity !== undefined) next.capacity = patch.capacity;
  if (patch.credits !== undefined) next.credits = patch.credits;
  if (patch.active !== undefined) next.active = patch.active;
  if (patch.coachId === null) delete next.coachId;
  else if (patch.coachId !== undefined) next.coachId = patch.coachId;
  return next;
}

/**
 * 排一节课：从课程种类拷课名、时长、人数上限、扣次、默认教练（任务 26 用；人数上限和教练这节课可以另填）。
 * 停用的种类不能排新课，抛 RuleError('class-type-inactive')。以后改种类不影响这节课。
 */
export function sessionFromType(
  type: ClassType,
  args: { id: string; storeId: string; on: DateKey; startTime: string; capacity?: number; coachId?: string },
): ClassSession {
  if (!type.active) throw new RuleError('class-type-inactive', `「${type.name}」已经停用，不能再排新课`);
  const s: ClassSession = {
    id: args.id,
    classTypeId: type.id,
    name: type.name,
    storeId: args.storeId,
    on: args.on,
    startTime: args.startTime,
    minutes: type.minutes,
    capacity: args.capacity ?? type.capacity,
    credits: type.credits,
    status: 'scheduled',
  };
  const coachId = args.coachId ?? type.coachId;
  if (coachId) s.coachId = coachId;
  return s;
}

/** 列表顺序：启用的在前，再按课程名 */
export const sortClassTypes = <T extends ClassType>(types: readonly T[]): T[] =>
  [...types].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'zh-CN') || a.id.localeCompare(b.id));

export type ClassRulesErrors = Partial<Record<keyof ClassRules, string>>;

const isMinutes = (v: unknown) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= CLASS_RULE_MINUTES_MAX;

/** 团课规则（GymRules.classRules）设置的校验；全对返回 null。waitlistMax 填 null 为不限 */
export function classRulesErrors(input: Partial<Record<keyof ClassRules, unknown>>): ClassRulesErrors | null {
  const errs: ClassRulesErrors = {};
  if (!isMinutes(input.cancelBeforeMinutes)) errs.cancelBeforeMinutes = `取消截止填 0–${CLASS_RULE_MINUTES_MAX} 的整数（开课前几分钟）`;
  if (typeof input.waitlist !== 'boolean') errs.waitlist = '选一下开不开候补';
  if (input.waitlistMax !== null && !isInt(input.waitlistMax, CLASS_CAPACITY_MAX)) errs.waitlistMax = `候补人数填 1–${CLASS_CAPACITY_MAX} 的整数，或者选不限`;
  if (!isMinutes(input.lateGraceMinutes)) errs.lateGraceMinutes = `迟到宽限填 0–${CLASS_RULE_MINUTES_MAX} 的整数（分钟）`;
  return Object.keys(errs).length ? errs : null;
}

/** 只留规则里的字段（先用 classRulesErrors 校验过） */
export const pickClassRules = (input: ClassRules): ClassRules => ({
  cancelBeforeMinutes: input.cancelBeforeMinutes,
  waitlist: input.waitlist,
  waitlistMax: input.waitlistMax,
  lateGraceMinutes: input.lateGraceMinutes,
});
