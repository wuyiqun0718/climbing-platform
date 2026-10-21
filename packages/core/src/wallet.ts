import { daysBetween, type DateKey } from '@climb/utils';
import type { Card, LessonCard, PeriodCard } from './types';

/** 卡还能不能用：期限卡没到期（含还没生效的续卡），次卡/课时有剩余且没过期，体验券没用过且没过期 */
export function isCardLive(card: Card, today: DateKey): boolean {
  if (card.expiresOn < today) return false;
  if (card.kind === 'period') return true;
  if (card.kind === 'referral') return !card.usedOn;
  return card.remaining > 0;
}

/** 卡包里一张卡还剩多少，页面照这个显示 */
export type CardBalance =
  /** 期限卡：生效中是到期前还剩几天（含今天）；还没生效是总天数 */
  | { type: 'days'; left: number; total: number; startsOn?: DateKey }
  /** 次卡、好友送的次卡、私教课时、团课次数 */
  | { type: 'times'; left: number; total: number }
  /** 体验券：一张就一次 */
  | { type: 'voucher'; used: boolean };

export function cardBalance(card: Card, today: DateKey): CardBalance {
  if (card.kind === 'period') {
    const total = daysBetween(card.startsOn, card.expiresOn) + 1;
    if (card.startsOn > today) return { type: 'days', left: total, total, startsOn: card.startsOn };
    return { type: 'days', left: Math.max(0, daysBetween(today, card.expiresOn) + 1), total };
  }
  if (card.kind === 'referral') return { type: 'voucher', used: !!card.usedOn };
  return { type: 'times', left: card.remaining, total: card.total };
}

export interface WalletGroups {
  /** 期限卡（先生效中的，再续的），然后次卡、好友送的次卡、体验券 */
  entry: Card[];
  /** 私教课时、团课次数 */
  lessons: LessonCard[];
  /** 用完或过期的，默认折叠；最近到期的排前面 */
  done: Card[];
}

const ENTRY_ORDER: Record<Card['kind'], number> = { period: 0, count: 1, gift: 2, referral: 3, pt: 4, class: 5 };

/** 卡包分组：入场卡、课程、已用完或已过期 */
export function groupWallet(cards: Card[], today: DateKey): WalletGroups {
  const live = cards.filter(c => isCardLive(c, today));
  const byKind = (a: Card, b: Card) =>
    ENTRY_ORDER[a.kind] - ENTRY_ORDER[b.kind]
    || (a.kind === 'period' ? (a as PeriodCard).startsOn.localeCompare((b as PeriodCard).startsOn) : 0)
    || a.expiresOn.localeCompare(b.expiresOn);
  return {
    entry: live.filter(c => c.kind !== 'pt' && c.kind !== 'class').sort(byKind),
    lessons: live.filter((c): c is LessonCard => c.kind === 'pt' || c.kind === 'class').sort(byKind),
    done: cards.filter(c => !isCardLive(c, today)).sort((a, b) => b.expiresOn.localeCompare(a.expiresOn)),
  };
}
