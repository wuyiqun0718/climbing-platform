import type { PastCheckIn } from './checkIn';
import { isPolicyInForce, type InsurancePolicy } from './insurance';
import type { LedgerEntry } from './ledger';
import { RuleError } from './rules';
import type { Card } from './types';

/**
 * 撤销入场（docs/mvp-plan.md 第 9 节已定：前台、店长、老板都能撤，扫码和前台登记的都能撤，必须填原因，记流水和操作日志）。
 * 后台撤销、mock 和后端都按这里，页面里不另写判断。
 *
 * - 次数：只退这次实际扣掉的（deducted）。同一天再次入场扣 0 的，撤销也不退；退回记一笔 check_in_void 流水。
 * - 体验券：这次入场用掉了它（usedOn 是这天，同一天没有别的没撤销的入场也用它），撤销后恢复成没用过。
 * - 保险（一人一天一张，见 insurance.ts）：撤销的是投这张保单的那次入场时，
 *   同一天还有别的没撤销的入场 → 保单继续有效，改挂到那次入场（门店也跟着改）；没有 → 标记 refund_pending 待退保。
 *   撤销的是复用保单的再次入场，保单不动。投保失败的同样标记待退保，退保和失败怎么收尾见任务 33、34。
 * - 已经撤销的再撤销抛 already-voided；接口层要做成幂等（返回第一次的结果），不要把这个错误给页面。
 */

/** 入场记录里撤销要用的字段（对应 check_ins 表） */
export interface VoidableCheckIn extends PastCheckIn {
  id: string;
  deducted: number;
}

export interface VoidCheckInArgs<C extends Card, P extends InsurancePolicy> {
  checkIn: VoidableCheckIn;
  /** 这次入场用的卡（checkIn.cardId 那张）；没卡的入场为 null */
  card: C | null;
  /** 这个会员的入场记录，至少包含撤销那天的（可以包含要撤销的这条） */
  past: readonly VoidableCheckIn[];
  /** 这个会员的保单，至少包含撤销那天的 */
  policies: readonly P[];
  reason: string;
}

export interface VoidCheckInResult<C extends Card, P extends InsurancePolicy> {
  /** 撤销后的卡；没卡为 null，卡没变化时原样返回 */
  card: C | null;
  /** 退回了几次（= 这次扣的次数） */
  restored: number;
  /** 体验券恢复成没用过 */
  voucherRestored: boolean;
  /** 改过的保单（改挂到别的入场或待退保）；这次入场不是投保那次、或保单已经不算数时为 null */
  policy: P | null;
}

export function voidCheckIn<C extends Card, P extends InsurancePolicy>(a: VoidCheckInArgs<C, P>): VoidCheckInResult<C, P> {
  const { checkIn } = a;
  if (checkIn.voided) throw new RuleError('already-voided', '这次入场已经撤销过了');
  if (!a.reason.trim()) throw new RuleError('reason-required', '撤销要写原因');
  if ((a.card?.id ?? null) !== checkIn.cardId) throw new Error(`撤销入场 ${checkIn.id}：传入的卡不是这次入场用的卡`);

  const others = a.past.filter(c => c.id !== checkIn.id && c.memberId === checkIn.memberId && c.on === checkIn.on && !c.voided);

  let card = a.card;
  let restored = 0;
  let voucherRestored = false;
  if (card && 'remaining' in card && checkIn.deducted > 0) {
    restored = checkIn.deducted;
    card = { ...card, remaining: card.remaining + restored };
  }
  if (card?.kind === 'referral' && card.usedOn === checkIn.on && !others.some(c => c.cardId === card!.id)) {
    const { usedOn: _u, ...rest } = card;
    card = rest as C;
    voucherRestored = true;
  }

  const p = a.policies.find(x => x.checkInId === checkIn.id && x.memberId === checkIn.memberId && x.on === checkIn.on && isPolicyInForce(x));
  let policy: P | null = null;
  if (p) {
    const next = others[0];
    policy = next ? { ...p, checkInId: next.id, storeId: next.storeId } : { ...p, status: 'refund_pending' };
  }
  return { card, restored, voucherRestored, policy };
}

/** 撤销入场退回次数的那笔 check_in_void 流水；没退次数（期限卡、体验券、扣 0 的再次入场）不记，返回 null */
export function checkInVoidLedgerEntry(args: {
  id: string;
  /** 撤销后的卡 */
  card: Card;
  restored: number;
  at: string;
  checkInId: string;
  operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>;
  /** 撤销原因 */
  note: string;
}): LedgerEntry | null {
  const { card } = args;
  if (!args.restored || !('remaining' in card)) return null;
  return {
    id: args.id,
    cardId: card.id,
    at: args.at,
    delta: args.restored,
    remainingAfter: card.remaining,
    expiresOnAfter: card.expiresOn,
    reason: 'check_in_void',
    ref: { type: 'check_in', id: args.checkInId },
    ...args.operator,
    note: args.note,
  };
}
