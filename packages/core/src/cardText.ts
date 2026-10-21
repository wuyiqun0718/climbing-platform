import { daysBetween, formatDot, type DateKey } from '@climb/utils';
import type { Card, CardStatus } from './types';

/**
 * 卡在小程序卡包和后台会员详情里的展示文字，两端都用这里，不各写一份。
 */

export const CARD_KIND_TEXT: Record<Card['kind'], string> = {
  period: '期限卡',
  count: '次卡',
  gift: '好友赠送',
  referral: '老带新',
  pt: '私教课时',
  class: '团课次数',
};

/** 卡现在的状态：卡上存的四种（正常、冻结、作废、已退款），正常的再细分出没开始、过期、用完 */
export type CardState = CardStatus | 'not_started' | 'expired' | 'used_up';

export const CARD_STATE_TEXT: Record<CardState, string> = {
  normal: '正常',
  frozen: '冻结中',
  void: '已作废',
  refunded: '已退款',
  not_started: '还没开始',
  expired: '已过期',
  used_up: '已用完',
};

export function cardState(card: Card, today: DateKey): CardState {
  const status = card.status ?? 'normal';
  if (status !== 'normal') return status;
  if (card.expiresOn < today) return 'expired';
  if (card.kind === 'period') return card.startsOn > today ? 'not_started' : 'normal';
  if (card.kind === 'referral') return card.usedOn ? 'used_up' : 'normal';
  return card.remaining > 0 ? 'normal' : 'used_up';
}

export interface CardText {
  /** 卡的类别，比如「期限卡」 */
  kind: string;
  /** 大号数字或短词：剩几天、剩几次 */
  value: number | string;
  unit: string;
  /** 有效期 */
  meta: string;
}

/**
 * 卡的主要数字和有效期。
 * usable：老带新体验券现在能不能用（小程序入场时由 entryOptions 算出来）；不传就按用没用过显示。
 */
export function cardText(card: Card, today: DateKey, opts: { usable?: boolean } = {}): CardText {
  const kind = CARD_KIND_TEXT[card.kind];
  if (card.kind === 'period') {
    const meta = `${formatDot(card.startsOn)} – ${formatDot(card.expiresOn)}`;
    if (card.expiresOn < today) return { kind, value: '已到期', unit: '', meta };
    return { kind, value: daysBetween(today, card.expiresOn) + 1, unit: '天后到期', meta };
  }
  const meta = `${formatDot(card.expiresOn)} 前有效`;
  if (card.kind === 'referral') {
    const value = card.usedOn ? '已用' : opts.usable === false ? '等待' : '可用';
    return { kind, value, unit: '', meta };
  }
  const unit = card.kind === 'pt' ? `/ ${card.total} 节` : `/ ${card.total} 次`;
  return { kind, value: card.remaining, unit, meta };
}
