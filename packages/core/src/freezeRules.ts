import type { FreezeRules } from './gym';

/**
 * 后台「冻结规则」设置的校验。规则怎么用（能不能冻、冻几天、解冻后到期日）见 freeze.ts。
 * 一次最多能填多少天是系统的上限，防止填错；等馆方：先按一年。
 */
export const FREEZE_DAYS_LIMIT = 365;

export type FreezeRulesErrors = Partial<Record<keyof FreezeRules, string>>;

const isCount = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 1);
const isDays = (v: unknown) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= FREEZE_DAYS_LIMIT;

/** 按字段给错误；全对返回 null。input 是接口收到的原样内容，次数填 null 为不限 */
export function freezeRulesErrors(input: Partial<Record<keyof FreezeRules, unknown>>): FreezeRulesErrors | null {
  const errs: FreezeRulesErrors = {};
  const { memberSelfService, perMonth, perYear, minDays, maxDays } = input;
  if (typeof memberSelfService !== 'boolean') errs.memberSelfService = '选一下会员能不能自己冻结';
  if (!isCount(perMonth)) errs.perMonth = '每月次数填 1 以上的整数，或者选不限';
  if (!isCount(perYear)) errs.perYear = '每年次数填 1 以上的整数，或者选不限';
  else if (perYear !== null && isCount(perMonth) && perMonth !== null && (perYear as number) < (perMonth as number)) {
    errs.perYear = '每年次数不能少于每月次数';
  }
  if (!isDays(minDays)) errs.minDays = `最少天数填 1–${FREEZE_DAYS_LIMIT} 的整数`;
  if (!isDays(maxDays)) errs.maxDays = `最多天数填 1–${FREEZE_DAYS_LIMIT} 的整数`;
  else if (isDays(minDays) && (maxDays as number) < (minDays as number)) errs.maxDays = '最多天数不能少于最少天数';
  return Object.keys(errs).length ? errs : null;
}

/** 只留规则里的字段（接口收到的多余字段不存）；先用 freezeRulesErrors 校验过再调 */
export const pickFreezeRules = (input: FreezeRules): FreezeRules => ({
  memberSelfService: input.memberSelfService,
  perMonth: input.perMonth,
  perYear: input.perYear,
  minDays: input.minDays,
  maxDays: input.maxDays,
});
