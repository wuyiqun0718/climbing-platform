import type { DateKey } from '@climb/utils';
import type { Card, LedgerEntry, LedgerReason } from './types';

/** 流水原因的中文，会员端和后台都用这一份 */
export const LEDGER_REASON_LABELS: Record<LedgerReason, string> = {
  purchase: '购买',
  check_in: '入场',
  check_in_void: '撤销入场',
  share_out: '送给朋友',
  share_return: '朋友没领，退回',
  claim: '领取朋友送的',
  adjust: '前台调整',
  refund: '退款',
  import: '从原系统转入',
  freeze: '冻结',
  unfreeze: '解冻',
};

/** 卡现在还剩几次：次卡、课时看 remaining，体验券没用过算 1 次，期限卡没有次数 */
export function remainingOf(card: Card): number | undefined {
  if (card.kind === 'period') return undefined;
  if (card.kind === 'referral') return card.usedOn ? 0 : 1;
  return card.remaining;
}

/** 卡变化之后记一笔流水；card 传变化后的卡 */
export function ledgerEntry(args: {
  id: string;
  card: Card;
  delta: number;
  reason: LedgerReason;
  on: DateKey;
  at: string;
  ref?: { type: NonNullable<LedgerEntry['refType']>; id: string };
  note?: string;
}): LedgerEntry {
  const { card, ref } = args;
  const entry: LedgerEntry = {
    id: args.id,
    cardId: card.id,
    delta: args.delta,
    expiresOnAfter: card.expiresOn,
    reason: args.reason,
    on: args.on,
    at: args.at,
  };
  const remainingAfter = remainingOf(card);
  if (remainingAfter !== undefined) entry.remainingAfter = remainingAfter;
  if (ref) Object.assign(entry, { refType: ref.type, refId: ref.id });
  if (args.note) entry.note = args.note;
  return entry;
}

/** 入场后要不要记流水、记多少：扣了次数或用掉体验券才记；期限卡、同日再次入场不记 */
export function entryLedgerDelta(before: Card, after: Card, deducted: number): number | null {
  if (deducted > 0) return -deducted;
  if (before.kind === 'referral' && after.kind === 'referral' && !before.usedOn && after.usedOn) return -1;
  return null;
}
