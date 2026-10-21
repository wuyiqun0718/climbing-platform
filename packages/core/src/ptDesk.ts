import type { CardChange } from './classes';
import type { PtRules } from './gym';
import { ledgerOnOf } from './ledgerCheck';
import { cancelPtBooking, coachCancelPtBooking, ptSlotStartsAt, type PtBooking, type PtSlotMark } from './pt';
import { RuleError, type RuleErrorCode } from './rules';
import type { Card, LedgerEntry } from './types';

/**
 * 后台处理私教（任务 30）：标线下约 / 不接课、去掉标记、确认、取消。占格子、确认、退课时的规则都在 pt.ts（跟小程序分支逐字一致，这里不改），
 * 这里只加后台要的：
 * - 取消分两种：会员要取消（前台代办，cancelPtBooking by: 'staff'，越过自助截止，流水 pt_cancel）；教练取消或拒绝（coachCancelPtBooking，流水 pt_void）。
 *   两种都要写原因（pt.ts 里只有教练取消要求原因，前台代办的在这里补上）。开课后不能取消。
 * - 去掉标记：已经过了的格子不能改。
 * - 私教规则（GymRules.ptRules，默认值是占位）的设置校验。
 * 要不要教练确认看 ptRules.needCoachConfirm：开着时会员约了是 pending，后台确认后才是 booked。
 */

export type PtCancelKind = 'member' | 'coach';

export const PT_DESK_TEXT: Partial<Record<RuleErrorCode, string>> = {
  'pt-reason-required': '取消、拒绝要写原因，会员那边能看到',
  'pt-slot-past': '这个时段已经过了',
};

const fail = (code: RuleErrorCode): never => {
  throw new RuleError(code, PT_DESK_TEXT[code] ?? code);
};

/**
 * 后台取消一节私教。kind = 'member'：会员要取消，前台代办（退课时 pt_cancel）；kind = 'coach'：教练取消或拒绝（退课时 pt_void，原因记在预约上）。
 * 原因必填。返回改后的预约和要记的流水（CardChange）。
 */
export function deskCancelPtBooking(a: { booking: PtBooking; cards: Card[]; now: Date; rules: PtRules; kind: PtCancelKind; reason: string }): { booking: PtBooking; changes: CardChange[] } {
  const reason = (a.reason ?? '').trim();
  if (!reason) fail('pt-reason-required');
  if (a.kind === 'coach') return coachCancelPtBooking({ booking: a.booking, cards: a.cards, now: a.now, reason });
  const r = cancelPtBooking({ booking: a.booking, cards: a.cards, now: a.now, rules: a.rules, by: 'staff' });
  return { booking: { ...r.booking, closeReason: reason }, changes: r.changes };
}

/** 去掉一条标记（线下约的、不接课）前检查：已经开始或过了的不能改 */
export function unmarkPtSlotBlockedBy(mark: PtSlotMark, now: Date): RuleErrorCode | null {
  return ptSlotStartsAt(mark.on, mark.hour).getTime() <= now.getTime() ? 'pt-slot-past' : null;
}

/** 私教课时变化（约课、取消、教练取消）的流水，关联到私教预约 */
export function ptLedgerEntry(a: { id: string; change: CardChange; at: string; operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>; note?: string }): LedgerEntry {
  const { change } = a;
  return {
    id: a.id,
    cardId: change.card.id,
    at: a.at,
    on: ledgerOnOf(a.at),
    delta: change.delta,
    remainingAfter: change.card.remaining,
    expiresOnAfter: change.card.expiresOn,
    reason: change.reason,
    refType: 'pt_booking',
    refId: change.bookingId,
    ...a.operator,
    note: a.note ?? '',
  };
}

export type PtRulesErrors = Partial<Record<keyof PtRules, string>>;

const isHour = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

/** 私教规则设置的校验：整点 0–24、结束晚于开始、取消截止 0 以上的分钟（最多一周）、要不要教练确认 */
export function ptRulesErrors(input: Partial<Record<keyof PtRules, unknown>>): PtRulesErrors | null {
  const errs: PtRulesErrors = {};
  if (!isHour(input.openHour, 0, 23)) errs.openHour = '开始填 0–23 的整点';
  if (!isHour(input.closeHour, 1, 24)) errs.closeHour = '结束填 1–24 的整点';
  else if (!errs.openHour && (input.closeHour as number) <= (input.openHour as number)) errs.closeHour = '结束要晚于开始';
  if (!isHour(input.cancelBeforeMinutes, 0, 7 * 24 * 60)) errs.cancelBeforeMinutes = '取消截止填 0 以上的整数（上课前几分钟）';
  if (typeof input.needCoachConfirm !== 'boolean') errs.needCoachConfirm = '选一下要不要教练确认';
  return Object.keys(errs).length ? errs : null;
}

export const pickPtRules = (r: PtRules): PtRules => ({ openHour: r.openHour, closeHour: r.closeHour, cancelBeforeMinutes: r.cancelBeforeMinutes, needCoachConfirm: r.needCoachConfirm });
