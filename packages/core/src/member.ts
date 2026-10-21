/**
 * 会员建档的规则：手机号、名字、来源怎么校验，手机号怎么判重。后台建档表单和后端都按这里。
 *
 * 等馆方确认的，先用下面的占位，确认后只改这个文件：
 * 1. 前台建档能选哪些来源（DESK_MEMBER_SOURCES）：先给除青橙导入以外的四种；青橙导入只能由导入产生。
 * 2. 名字选填（前台忙的时候先建档，会员自己在小程序里补），最长 MEMBER_NAME_MAX 个字。
 * 3. 只收中国大陆手机号（1 开头 11 位）。
 */

/** 会员来源（members.source） */
export type MemberSource = 'walkin' | 'referral' | 'gift' | 'platform' | 'legacy_import';
export const MEMBER_SOURCES: readonly MemberSource[] = ['walkin', 'referral', 'gift', 'platform', 'legacy_import'];

/** 前台手动建档能选的来源，也是表单里的顺序（等馆方） */
export const DESK_MEMBER_SOURCES: readonly MemberSource[] = ['walkin', 'referral', 'gift', 'platform'];
export const DEFAULT_DESK_MEMBER_SOURCE: MemberSource = 'walkin';

export const MEMBER_NAME_MAX = 20;

/** 去掉空格、横杠和 +86 / 86 前缀：「+86 138-1234-5678」→「13812345678」 */
export function normalizePhone(raw: string): string {
  const s = raw.replace(/[\s-]/g, '');
  return /^(\+?86)1\d{10}$/.test(s) ? s.replace(/^\+?86/, '') : s;
}

/** 手机号（先 normalizePhone）的错误文案，没问题返回空串 */
export function phoneError(phone: string): string {
  if (!phone) return '请填手机号';
  if (!/^1[3-9]\d{9}$/.test(phone)) return '手机号不对，要 1 开头的 11 位';
  return '';
}

export function memberNameError(name: string): string {
  if (name.trim().length > MEMBER_NAME_MAX) return `名字最多 ${MEMBER_NAME_MAX} 个字`;
  return '';
}

export function deskSourceError(source: string): string {
  return (DESK_MEMBER_SOURCES as readonly string[]).includes(source) ? '' : '请选来源';
}

export interface NewMemberInput {
  phone: string;
  name: string;
  source: string;
}

export interface NewMemberErrors {
  phone?: string;
  name?: string;
  source?: string;
}

/** 建档表单的校验，按字段给错误；全对返回 null。phone 传原始输入即可 */
export function newMemberErrors(input: NewMemberInput): NewMemberErrors | null {
  const errs: NewMemberErrors = {};
  const phone = phoneError(normalizePhone(input.phone));
  const name = memberNameError(input.name);
  const source = deskSourceError(input.source);
  if (phone) errs.phone = phone;
  if (name) errs.name = name;
  if (source) errs.source = source;
  return Object.keys(errs).length ? errs : null;
}

/** 一个手机号只能建一个档：按 normalizePhone 后的号码找已有的会员 */
export function findMemberByPhone<M extends { phone: string }>(members: readonly M[], phone: string): M | undefined {
  const p = normalizePhone(phone);
  return members.find(m => normalizePhone(m.phone) === p);
}
