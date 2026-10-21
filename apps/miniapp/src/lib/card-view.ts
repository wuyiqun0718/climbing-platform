import { cardBalance, shareBlockedBy, type Card } from '@climb/core';
import { formatDot, formatMonthDay, type DateKey } from '@climb/utils';
import gym from '@gym';

export type CardTone = 'brand' | 'accent' | 'neutral' | 'surface';
export type CardAction = { key: string; label: string; dark?: boolean };

export interface CardView {
  kind: string;
  name: string;
  value: number | string;
  unit: string;
  meta: string;
  tone: CardTone;
  acts: CardAction[];
  /** 进度条：剩余天数 / 总天数，或剩余次数 / 总次数；体验券没有 */
  progress?: number;
}

/** 把一张卡翻成 MemberCard 要的文字和按钮；剩多少由 cardBalance 算。卡包列表和卡详情共用 */
export function cardView(card: Card, today: DateKey, done: boolean): CardView {
  const b = cardBalance(card, today);
  const until = `${formatDot(card.expiresOn)} 前有效`;
  const acts: CardAction[] = [];
  const ratio = (left: number, total: number) => (total > 0 ? left / total : 0);
  if (card.kind === 'period' && b.type === 'days' && b.frozenUntil) {
    return {
      kind: '期限卡 · 冻结中',
      name: card.name,
      value: b.left,
      unit: '天，冻结中',
      meta: `冻结到 ${formatDot(b.frozenUntil)}，解冻后到期日顺延`,
      tone: 'neutral',
      acts,
      progress: ratio(b.left, b.total),
    };
  }
  if (card.kind === 'period' && b.type === 'days') {
    const future = !!b.startsOn;
    if (!done && !future) acts.push({ key: 'scan', label: '入场', dark: true });
    return {
      kind: future ? `期限卡 · ${formatMonthDay(b.startsOn!)}生效` : '期限卡',
      name: card.name,
      value: done ? 0 : b.left,
      unit: done ? '天，已到期' : future ? '天' : '天后到期',
      meta: `${formatDot(card.startsOn)} – ${formatDot(card.expiresOn)}`,
      tone: 'brand',
      acts,
      progress: done ? 0 : ratio(b.left, b.total),
    };
  }
  if (b.type === 'voucher') {
    const hint = b.used ? '已使用，欢迎常来'
      : gym.rules.referralRequiresInviterSameDay ? '邀请你的朋友当天到馆扫码后，这张券当天就能用' : '到馆扫码就能免费入场一次';
    if (!done) acts.push({ key: 'scan', label: '扫码入场', dark: true });
    return { kind: '老带新', name: '免费体验券', value: b.used ? '已用' : 1, unit: b.used ? '' : '次', meta: `${hint}\n${until}`, tone: 'neutral', acts };
  }
  const lesson = card.kind === 'pt' || card.kind === 'class';
  if (!done && gym.features.countCardSharing && !shareBlockedBy(card, today)) acts.push({ key: 'share', label: '送给朋友' });
  acts.push({ key: 'ledger', label: '记录' });
  if (!done) acts.push(lesson ? { key: card.kind === 'pt' ? 'pt' : 'classes', label: '去约课', dark: true } : { key: 'scan', label: '入场', dark: true });
  return {
    kind: card.kind === 'gift' ? '好友赠送' : card.kind === 'pt' ? '私教课时' : card.kind === 'class' ? '团课次数' : '次卡',
    name: card.kind === 'gift' ? '攀岩次卡' : card.name,
    value: b.left,
    unit: `/ ${b.total} ${card.kind === 'pt' ? '节' : '次'}`,
    meta: until,
    tone: lesson ? 'surface' : 'accent',
    acts,
    progress: ratio(b.left, b.total),
  };
}
