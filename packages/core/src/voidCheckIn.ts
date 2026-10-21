import type { PastCheckIn } from './checkIn';
import { isPolicyInForce, type InsurancePolicy } from './insurance';
import type { LedgerEntry } from './ledger';
import { RuleError } from './rules';
import type { Card } from './types';

/**
 * 撤销入场（docs/mvp-plan.md 第 9 节已定：前台、店长、老板都能撤，扫码和前台登记的都能撤，必须填原因，记流水和操作日志）。
 * 后台撤销、mock 和后端都按这里，页面里不另写判断。
 *
 * - 次数：只退这次实际扣掉的（deducted）。同一天再次入场扣 0 的，撤销也不退。
 *   撤销扣了次的那次，而同一天还有别的没撤销、因为同日再次入场才扣 0 的入场（用的是次卡、朋友送的次卡）时，不退：
 *   扣次转给其中最早的那次（那条的 deducted 改成这次扣的次数），否则会员等于白进了。
 *   那次用的是同一张卡：卡不动，记一笔变化量 0 的 check_in_void 流水说明转走了；
 *   用的是另一张卡：这张卡退回、那张卡扣掉（那张卡剩余不够、不是正常状态的跳过，看下一次；都不行才退回）。
 * - 体验券：这次入场用掉了它（usedOn 是这天），同一天没有别的没撤销的入场，撤销后恢复成没用过；还有别的入场就不恢复。
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
  /** 这个会员的入场记录，至少包含撤销那天的（可以包含要撤销的这条），按入场先后排 */
  past: readonly VoidableCheckIn[];
  /** 这个会员的卡（判断同一天别的入场用的是什么卡，扣次转过去时用） */
  cards: readonly Card[];
  /** 这个会员的保单，至少包含撤销那天的 */
  policies: readonly P[];
  reason: string;
}

export interface VoidCheckInResult<C extends Card, P extends InsurancePolicy> {
  /** 撤销后的卡；没卡为 null，卡没变化时原样返回 */
  card: C | null;
  /** 这张卡退回了几次；扣次转给同一张卡的另一次入场时为 0 */
  restored: number;
  /** 扣次转给了同一天的哪次入场：改后的那条（deducted 已改）；用的是另一张卡时带上扣过的那张卡，同一张卡为 null */
  moved: { checkIn: VoidableCheckIn; card: Card | null } | null;
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
  let moved: VoidCheckInResult<C, P>['moved'] = null;
  let voucherRestored = false;
  const d = checkIn.deducted;
  if (card && 'remaining' in card && d > 0) {
    const cardOf = (id: string | null) => a.cards.find(c => c.id === id && c.memberId === checkIn.memberId);
    for (const o of others) {
      const oc = cardOf(o.cardId);
      if (o.deducted !== 0 || !oc || !(oc.kind === 'count' || oc.kind === 'gift')) continue;
      if (oc.id === card.id) {
        moved = { checkIn: { ...o, deducted: d }, card: null };
        break;
      }
      if ((oc.status ?? 'normal') === 'normal' && oc.remaining >= d) {
        moved = { checkIn: { ...o, deducted: d }, card: { ...oc, remaining: oc.remaining - d } };
        break;
      }
    }
    if (!moved || moved.card) {
      restored = d;
      card = { ...card, remaining: card.remaining + d };
    }
  }
  if (card?.kind === 'referral' && card.usedOn === checkIn.on && !others.length) {
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
  return { card, restored, moved, voucherRestored, policy };
}

/**
 * 撤销入场的那笔 check_in_void 流水：退回次数的记 +n；扣次转给同一张卡另一次入场的记一笔 0，备注写明转到哪次。
 * 没退也没转（期限卡、体验券、扣 0 的再次入场）不记，返回 null。
 * 转到另一张卡时，那张卡扣次的流水用 checkIn.ts 的 checkInLedgerEntry（checkInId 是转过去的那次）。
 */
export function checkInVoidLedgerEntry(args: {
  id: string;
  /** 撤销后的卡 */
  card: Card;
  restored: number;
  /** 扣次转给了同一张卡的哪次入场 */
  movedTo?: string;
  at: string;
  checkInId: string;
  operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>;
  /** 撤销原因 */
  note: string;
}): LedgerEntry | null {
  const { card } = args;
  if ((!args.restored && !args.movedTo) || !('remaining' in card)) return null;
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
    note: args.restored || !args.movedTo ? args.note : `${args.note}（扣次转到同一天的入场 ${args.movedTo}）`,
  };
}
