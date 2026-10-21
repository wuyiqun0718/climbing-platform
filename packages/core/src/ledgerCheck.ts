import { formatDot } from '@climb/utils';
import { remainingOf } from './ledger';
import type { Card, LedgerEntry } from './types';

/**
 * 后台卡流水（mvp/dashboard 任务 12）：对账、变化量和变化后的文字。流水的类型、原因文字（LEDGER_REASON_LABELS）、
 * 记一笔（ledgerEntry）在 ledger.ts / types.ts，跟小程序分支一致；这里只放后台另外要的。
 * 卡上的 remaining / expiresOn 只是缓存，必须等于最后一笔的「变化后」，每天对账用 ledgerMismatch 查。
 */

/** 流水的业务日期：记录时间（ISO，带 +08:00）的日期部分 */
export const ledgerOnOf = (at: string) => at.slice(0, 10);

/** 这张卡记不记次数：期限卡不记（remainingOf 为 undefined），其余记 */
const hasCount = (card: Card) => remainingOf(card) !== undefined;

/**
 * 对账：流水按时间排好后，每一笔的剩余 = 上一笔剩余 + 变化量，最后一笔的剩余和到期日 = 卡上的（次数按 ledger.ts 的 remainingOf）。
 * 一致返回 null，否则返回第一处不一致的说明。
 */
export function ledgerMismatch(card: Card, entries: LedgerEntry[]): string | null {
  const mine = entries.filter(e => e.cardId === card.id);
  if (!mine.length) return '没有流水';
  let prev: number | null = null;
  for (const e of mine) {
    if (!hasCount(card)) {
      if (e.remainingAfter !== undefined || e.delta !== 0) return `${e.id}：这种卡不记次数`;
      continue;
    }
    if (e.remainingAfter === undefined || e.remainingAfter < 0) return `${e.id}：剩余次数不对`;
    if ((prev ?? 0) + e.delta !== e.remainingAfter) return `${e.id}：${prev ?? 0} ${e.delta >= 0 ? '+' : ''}${e.delta} ≠ ${e.remainingAfter}`;
    prev = e.remainingAfter;
  }
  const last = mine[mine.length - 1]!;
  if (hasCount(card) && last.remainingAfter !== remainingOf(card)) return `最后一笔剩 ${last.remainingAfter}，卡上剩 ${remainingOf(card)}`;
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
  return e.remainingAfter === undefined ? exp : `剩 ${e.remainingAfter} ${unitOf(card)}，${exp}`;
}
