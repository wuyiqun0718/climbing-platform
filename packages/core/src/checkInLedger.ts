import { ledgerOnOf } from './ledgerCheck';
import type { Card, LedgerEntry } from './types';

/**
 * 后台入场扣次的那笔 check_in 流水（mvp/dashboard 任务 15）。从 checkIn.ts 挪出来，checkIn.ts 跟小程序分支保持一致。
 * 没扣次（期限卡、体验券、再次入场）不记，返回 null。
 * 注意：小程序那边用 ledger.ts 的 entryLedgerDelta，体验券用掉也记一笔 -1；这边沿用原来的做法不记（要不要统一等拍板，见 docs/core-unify.md）。
 */
export function checkInLedgerEntry(args: {
  id: string;
  card: Card;
  deducted: number;
  at: string;
  checkInId: string;
  operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>;
  note?: string;
}): LedgerEntry | null {
  const { card } = args;
  if (!args.deducted || !('remaining' in card)) return null;
  return {
    id: args.id,
    cardId: card.id,
    at: args.at,
    on: ledgerOnOf(args.at),
    delta: -args.deducted,
    remainingAfter: card.remaining,
    expiresOnAfter: card.expiresOn,
    reason: 'check_in',
    refType: 'check_in',
    refId: args.checkInId,
    ...args.operator,
    note: args.note ?? '',
  };
}
