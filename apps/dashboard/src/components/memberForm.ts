import { ApiError, type MemberExistsError } from '@climb/api';

/** 建档接口返回 409（手机号已经有档案）时取出那个人；别的错误返回 null */
export function memberExists(e: unknown): MemberExistsError | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null;
  const d = e.data as Partial<MemberExistsError> | null;
  return d?.code === 'member-exists' && typeof d.memberId === 'string' ? (d as MemberExistsError) : null;
}

/** 400 时后端指出的是哪一项（phone / name / source），用来把错误显示在那一项下面 */
export function badField(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 400) return null;
  const f = (e.data as { field?: unknown } | null)?.field;
  return typeof f === 'string' ? f : null;
}
