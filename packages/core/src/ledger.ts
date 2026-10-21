import { formatDot, type DateKey } from '@climb/utils';
import type { Card } from './types';

/**
 * 卡的流水（card_ledger）：次数或有效期每变一次记一笔，只追加不修改。
 * 卡上的 remaining / expiresOn 只是缓存，必须等于最后一笔的「变化后」，每天对账用 ledgerMismatch 查。
 * 后台卡流水和小程序「使用记录」的文字都用这里。
 */

export type LedgerReason =
  | 'purchase'
  | 'check_in'
  | 'check_in_void'
  | 'share_out'
  | 'share_return'
  | 'claim'
  | 'adjust'
  | 'refund'
  | 'import'
  | 'freeze'
  | 'unfreeze';

export const LEDGER_REASON_TEXT: Record<LedgerReason, string> = {
  purchase: '买卡',
  check_in: '入场',
  check_in_void: '撤销入场',
  share_out: '送给朋友',
  share_return: '朋友没领，退回',
  claim: '领取朋友送的',
  adjust: '手动调整',
  refund: '退款',
  import: '青橙导入',
  freeze: '冻结',
  unfreeze: '解冻',
};

export type LedgerOperatorType = 'member' | 'staff' | 'system';

export interface LedgerEntry {
  id: string;
  cardId: string;
  /** 发生时间，ISO 8601 带时区，比如 2026-10-21T14:05:00+08:00 */
  at: string;
  /** 次数变化，比如 -1；只改有效期或状态时为 0 */
  delta: number;
  /** 变化后剩余次数；期限卡、体验券为 null */
  remainingAfter: number | null;
  expiresOnAfter: DateKey;
  reason: LedgerReason;
  /** 关联的入场记录、订单、分享 */
  ref: { type: 'check_in' | 'order' | 'share' | 'import'; id: string } | null;
  operatorType: LedgerOperatorType;
  /** 会员 ID 或员工 ID；system 为 null */
  operatorId: string | null;
  note: string;
}

const hasCount = (card: Card) => card.kind !== 'period' && card.kind !== 'referral';

/**
 * 对账：流水按时间排好后，每一笔的剩余 = 上一笔剩余 + 变化量，最后一笔的剩余和到期日 = 卡上的。
 * 一致返回 null，否则返回第一处不一致的说明。
 */
export function ledgerMismatch(card: Card, entries: LedgerEntry[]): string | null {
  const mine = entries.filter(e => e.cardId === card.id);
  if (!mine.length) return '没有流水';
  let prev: number | null = null;
  for (const e of mine) {
    if (!hasCount(card)) {
      if (e.remainingAfter !== null || e.delta !== 0) return `${e.id}：这种卡不记次数`;
      continue;
    }
    if (e.remainingAfter === null || e.remainingAfter < 0) return `${e.id}：剩余次数不对`;
    if ((prev ?? 0) + e.delta !== e.remainingAfter) return `${e.id}：${prev ?? 0} ${e.delta >= 0 ? '+' : ''}${e.delta} ≠ ${e.remainingAfter}`;
    prev = e.remainingAfter;
  }
  const last = mine[mine.length - 1]!;
  if (hasCount(card) && 'remaining' in card && last.remainingAfter !== card.remaining) return `最后一笔剩 ${last.remainingAfter}，卡上剩 ${card.remaining}`;
  if (last.expiresOnAfter !== card.expiresOn) return `最后一笔到期 ${last.expiresOnAfter}，卡上 ${card.expiresOn}`;
  return null;
}

const unitOf = (card: Card) => (card.kind === 'pt' ? '节' : '次');

/** 变化量的文字：+10 次、-1 次；次数没变的写有效期变了没有 */
export function ledgerDeltaText(card: Card, e: LedgerEntry, prev: LedgerEntry | undefined): string {
  if (e.delta) return `${e.delta > 0 ? '+' : '−'}${Math.abs(e.delta)} ${unitOf(card)}`;
  if (prev && prev.expiresOnAfter !== e.expiresOnAfter) return '改有效期';
  return '—';
}

/** 变化后的文字：剩 6 次，2027.02.06 到期；期限卡只写到期日 */
export function ledgerAfterText(card: Card, e: LedgerEntry): string {
  const exp = `${formatDot(e.expiresOnAfter)} 到期`;
  return e.remainingAfter === null ? exp : `剩 ${e.remainingAfter} ${unitOf(card)}，${exp}`;
}
