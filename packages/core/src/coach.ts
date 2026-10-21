/**
 * 教练资料（任务 28）：教练就是员工，员工账号上多一份 coach 资料，id 用员工 id，不另建一套。
 * 小程序 GET /coaches 返回的 Coach（id、name、tags、bio、storeIds）跟小程序分支 @climb/api 的 Coach 同名同字段；
 * 教练本人在小程序里按员工手机号认出来（小程序分支 MockCoach.phone），手机号就是员工账号的。
 *
 * 已定：
 * - 可约门店（storeIds）至少一家，而且必须是这个员工能操作的店的子集（员工是「全部门店」的随便选）。
 * - 单节价是正整数分。
 * - 停用的员工不出现在教练列表里。员工后来改了能操作的门店，列表里只露出还在范围内的可约门店，改员工时也会拦下超出范围的。
 * - 提成规则等馆方，这里不算。
 *
 * 等馆方的占位，确认后只改这几个常量：标签最多 COACH_TAGS_MAX 个、每个 COACH_TAG_MAX 字；简介最多 COACH_BIO_MAX 字；
 * 单节价最多 COACH_PRICE_MAX_CENTS；头像先填图片链接（https），上传等对象存储接好再做。
 * 头像、单节价小程序那边的 Coach 还没有，先只在后台。
 */

export const COACH_TAGS_MAX = 5;
export const COACH_TAG_MAX = 10;
export const COACH_BIO_MAX = 200;
export const COACH_PRICE_MAX_CENTS = 1_000_000;
export const COACH_AVATAR_URL_MAX = 500;

/** 员工账号上的教练资料 */
export interface CoachProfile {
  /** 擅长什么，教练列表上的小标签 */
  tags: string[];
  bio: string;
  /** 头像图片链接，没有为 null */
  avatarUrl: string | null;
  /** 单节价，分 */
  priceCents: number;
  /** 在哪几家店接私教 */
  storeIds: string[];
}

/** 小程序教练列表里的一位（同小程序分支 @climb/api 的 Coach） */
export interface CoachView {
  id: string;
  name: string;
  tags: string[];
  bio: string;
  storeIds: string[];
}

export type CoachProfileErrors = Partial<Record<keyof CoachProfile, string>>;

const isText = (v: unknown): v is string => typeof v === 'string';

/** 员工能操作的店里有没有这家：storeIds 为空是全部门店 */
const canUseStore = (staffStoreIds: readonly string[], id: string) => staffStoreIds.length === 0 || staffStoreIds.includes(id);

/**
 * 教练资料的校验，按字段给错误；全对返回 null。input 是接口收到的原样内容；
 * staffStoreIds 是这个员工（改完以后）能操作的店，allStoreIds 是现有的全部门店。
 */
export function coachProfileErrors(input: Partial<Record<keyof CoachProfile, unknown>>, staffStoreIds: readonly string[], allStoreIds: readonly string[]): CoachProfileErrors | null {
  const errs: CoachProfileErrors = {};
  const { tags, bio, avatarUrl, priceCents, storeIds } = input;
  if (!Array.isArray(tags) || !tags.every(isText)) errs.tags = '标签格式不对';
  else {
    const clean = tags.map(t => t.trim()).filter(Boolean);
    if (clean.length > COACH_TAGS_MAX) errs.tags = `标签最多 ${COACH_TAGS_MAX} 个`;
    else if (clean.some(t => t.length > COACH_TAG_MAX)) errs.tags = `每个标签最多 ${COACH_TAG_MAX} 个字`;
  }
  if (!isText(bio)) errs.bio = '简介格式不对';
  else if (bio.trim().length > COACH_BIO_MAX) errs.bio = `简介最多 ${COACH_BIO_MAX} 个字`;
  if (avatarUrl !== null && avatarUrl !== undefined && !(isText(avatarUrl) && /^https:\/\/\S+$/.test(avatarUrl.trim()) && avatarUrl.length <= COACH_AVATAR_URL_MAX)) {
    errs.avatarUrl = '头像要填 https 开头的图片链接，或者不填';
  }
  if (!Number.isInteger(priceCents) || (priceCents as number) <= 0) errs.priceCents = '单节价要大于 0，最多两位小数';
  else if ((priceCents as number) > COACH_PRICE_MAX_CENTS) errs.priceCents = `单节价最多 ${COACH_PRICE_MAX_CENTS / 100} 元`;
  if (!Array.isArray(storeIds) || storeIds.length === 0 || !storeIds.every(isText)) errs.storeIds = '至少选一家接私教的店';
  else if (storeIds.some(id => !allStoreIds.includes(id))) errs.storeIds = '有不存在的门店';
  else if (storeIds.some(id => !canUseStore(staffStoreIds, id))) errs.storeIds = '接私教的店只能从这个员工能操作的店里选';
  return Object.keys(errs).length ? errs : null;
}

/** 存的样子（先用 coachProfileErrors 校验过）：去空格、去空标签、门店去重 */
export function cleanCoachProfile(p: CoachProfile): CoachProfile {
  return {
    tags: p.tags.map(t => t.trim()).filter(Boolean),
    bio: p.bio.trim(),
    avatarUrl: p.avatarUrl?.trim() || null,
    priceCents: p.priceCents,
    storeIds: [...new Set(p.storeIds)],
  };
}

/**
 * 小程序教练列表（GET /coaches?store=）：在用、有教练资料的员工，可约门店只留还在员工能操作范围内的；
 * store 不填为全部，填了只要在这家店接私教的。按员工列表的先后。
 */
export function listCoaches(
  staff: readonly { id: string; name: string; active: boolean; storeIds: string[]; coach?: CoachProfile | null }[],
  store?: string | null,
): CoachView[] {
  return staff.flatMap(s => {
    if (!s.active || !s.coach) return [];
    const storeIds = s.coach.storeIds.filter(id => canUseStore(s.storeIds, id));
    if (!storeIds.length || (store && !storeIds.includes(store))) return [];
    return [{ id: s.id, name: s.name, tags: s.coach.tags, bio: s.coach.bio, storeIds }];
  });
}
