import type { DateKey } from '@climb/utils';
import { entryOptions, RuleError, type EntryContext, type EntryOption } from './rules';
import type { Card, EntryCard } from './types';

/**
 * 入场（扫码和前台登记共用）：列出这次能用的卡、同日再次入场不扣次、用卡后卡怎么变。记不记流水见 ledger.ts 的 entryLedgerDelta。
 * 小程序签到、后台手动登记、mock 和后端都按这里，页面里不另写判断。
 *
 * 等馆方确认的，先用下面的占位，确认后只改这里：
 * 1. REENTRY_ANY_STORE：同一天再次入场不扣次，不管上一次在哪家店（卡三店通用）；改成 false 就只算同一家店。
 *    同日再次入场免不免扣次本身是岩馆配置 GymRules.sameDayReentryFree（默认免）。
 * 2. CHECK_IN_REQUIRES_WAIVER.desk：前台登记时会员没签（或没签当前版）风险告知书能不能入场。先不拦，前台登记时提示前台
 *    让会员在小程序里补签；改成 true 就拦下（错误码 waiver-required）。
 *    扫码入场（scan）已定：第一次入场必须先在小程序里同意告知书，告知书换版本后要重签，所以固定为 true。
 *    签没签当前版本按 waiver.ts 的 hasSignedWaiver 算。
 */

export const REENTRY_ANY_STORE = true;

/** 入场方式：会员扫前台的码 / 前台在后台登记 */
export type CheckInVia = 'scan' | 'desk';

export const CHECK_IN_REQUIRES_WAIVER: Record<CheckInVia, boolean> = { scan: true, desk: false };

/** 已有的入场记录里判断要用的字段（对应 check_ins 表） */
export interface PastCheckIn {
  memberId: string;
  storeId: string;
  on: DateKey;
  cardId: string | null;
  voided: boolean;
}

export interface CheckInArgs {
  memberId: string;
  storeId: string;
  /** 这个会员的卡（别人的卡会被忽略） */
  cards: readonly Card[];
  /** 入场记录，至少包含这个会员今天的 */
  past: readonly PastCheckIn[];
  ctx: EntryContext;
}

/** 卡不能用的原因，前台登记弹窗里显示 */
export const ENTRY_BLOCKED_TEXT: Record<NonNullable<EntryOption['blockedBy']>, string> = {
  'inviter-not-checked-in': '邀请人今天还没入场',
};

export interface CheckInPlan {
  /** 今天已经入过场（撤销的不算），这次是再次入场 */
  reentry: boolean;
  options: EntryOption[];
}

const todaysEntries = (a: Pick<CheckInArgs, 'memberId' | 'storeId' | 'past' | 'ctx'>) =>
  a.past.filter(c => c.memberId === a.memberId && c.on === a.ctx.today && !c.voided && (REENTRY_ANY_STORE || c.storeId === a.storeId));

/** 今天是不是已经入过场（撤销的不算）；是否跨店算见 REENTRY_ANY_STORE */
export const isReentry = (a: Pick<CheckInArgs, 'memberId' | 'storeId' | 'past' | 'ctx'>) => todaysEntries(a).length > 0;

const isEntryCard = (c: Card): c is EntryCard => c.kind === 'period' || c.kind === 'count' || c.kind === 'gift' || c.kind === 'referral';

/**
 * 这次入场能用哪些卡、各扣几次。可用的在前；再次入场时今天用过的那张在前，期限卡其次。
 * 规则允许同日再次入场免扣次时，所有可用的卡都不扣；今天用过的卡即使刚好扣完最后一次、体验券已经用掉，也还能再进。
 */
export function checkInPlan(a: CheckInArgs): CheckInPlan {
  const { ctx } = a;
  const mine = a.cards.filter((c): c is EntryCard => c.memberId === a.memberId && isEntryCard(c));
  const free = ctx.rules.sameDayReentryFree && isReentry(a);
  let options = entryOptions(mine, ctx);
  if (!free) return { reentry: isReentry(a), options };

  const usedToday = new Set(todaysEntries(a).map(c => c.cardId));
  for (const card of mine) {
    const normal = (card.status ?? 'normal') === 'normal';
    if (usedToday.has(card.id) && normal && card.expiresOn >= ctx.today && !options.some(o => o.card.id === card.id)) {
      options.push({ card, usable: true, deducts: 0 });
    }
  }
  options = options.map(o => (o.usable ? { ...o, deducts: 0 } : o));
  const rank = (o: EntryOption) => (o.usable ? 0 : 100) + (usedToday.has(o.card.id) ? 0 : 10) + (o.card.kind === 'period' ? 0 : 1);
  options.sort((x, y) => rank(x) - rank(y));
  return { reentry: true, options };
}

/**
 * 用某张卡入场，返回更新后的卡、扣了几次、是不是再次入场。不能用的卡抛 RuleError。
 * via：怎么入场的；waiverSigned：会员签过当前版本的风险告知书没有（hasSignedWaiver），按 CHECK_IN_REQUIRES_WAIVER[via] 决定拦不拦。
 */
export function checkInWith<C extends EntryCard>(
  a: CheckInArgs & { cardId: string; via: CheckInVia; waiverSigned: boolean },
): { card: C; deducted: number; reentry: boolean } {
  if (CHECK_IN_REQUIRES_WAIVER[a.via] && !a.waiverSigned) {
    throw new RuleError('waiver-required', a.via === 'scan' ? '先看一下风险告知书，同意后再入场' : '还没签风险告知书，先让会员在小程序里签');
  }
  const { reentry, options } = checkInPlan(a);
  const opt = options.find(o => o.card.id === a.cardId);
  if (!opt) throw new RuleError('card-not-usable', '这张卡现在不能用来入场');
  if (!opt.usable) throw new RuleError('inviter-not-checked-in', '邀请人今天还没入场，体验券暂时不能用');
  const card = opt.card as C;
  const deducted = opt.deducts;
  if (card.kind === 'count' || card.kind === 'gift') return { card: { ...card, remaining: card.remaining - deducted }, deducted, reentry };
  if (card.kind === 'referral' && !card.usedOn) return { card: { ...card, usedOn: a.ctx.today }, deducted, reentry };
  return { card, deducted, reentry };
}
