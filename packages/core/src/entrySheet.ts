import { ENTRY_BLOCKED_TEXT } from './checkIn';
import type { InsurancePolicy } from './insurance';
import type { EntryOption } from './rules';
import { isSingleTicket } from './shop';
import type { Product } from './types';

/**
 * 扫码后的入场确认页（小程序签到页）：默认选哪张卡、没卡时买单次票、保险怎么标。
 * 能用哪些卡、扣几次、排序（期限卡优先，再次入场今天用过的那张在前）在 checkInPlan 里定，这里只在它的结果上做选择。
 */
export interface EntrySheet {
  /** 全部列出；不能用的（体验券等邀请人）也列，禁用并显示原因 */
  options: EntryOption[];
  /** 默认选中的卡：排在最前的可用卡；没有可用的为 null */
  selected: string | null;
  /** 没有能用的卡，只能买单次票入场 */
  mustBuy: boolean;
  /** 买来入场的单次票（在售的里最便宜的一种）；没在卖为 null */
  singleTicket: Product | null;
  /** 有体验券因为邀请人今天还没入场被拦下 */
  waitingInviter: boolean;
  insurance: { tag: string; note: string };
}

/** 卡不能用的原因（显示在禁用的选项下面） */
export const entryBlockedText = (o: EntryOption): string | null => (o.blockedBy ? ENTRY_BLOCKED_TEXT[o.blockedBy] : null);

/** 在售的单次票里最便宜的一种；没有返回 null */
export function singleTicketOf(products: readonly Product[]): Product | null {
  const list = products.filter(p => p.onSale && isSingleTicket(p)).sort((a, b) => a.priceCents - b.priceCents);
  return list[0] ?? null;
}

/**
 * 当日保险的标签（mvp-plan 第 9 节已定：每次入场都含保险，不另收钱）。
 * 今天已经投过（同日再次入场）就复用那张，标「今天已投保」；否则这次入场新投，标「卡里含」。
 */
export function entryInsurance(todayPolicy: Pick<InsurancePolicy, 'status'> | null): EntrySheet['insurance'] {
  return todayPolicy
    ? { tag: '今天已投保', note: '今天入场时已经投过，这次不用再投。' }
    : { tag: '卡里含', note: '保险包含在卡里，不用另外付钱，入场后马上生效。' };
}

export function entrySheet(a: { options: EntryOption[]; products: readonly Product[]; todayPolicy: Pick<InsurancePolicy, 'status'> | null }): EntrySheet {
  const first = a.options.find(o => o.usable);
  return {
    options: a.options,
    selected: first?.card.id ?? null,
    mustBuy: !first,
    singleTicket: singleTicketOf(a.products),
    waitingInviter: a.options.some(o => o.blockedBy === 'inviter-not-checked-in'),
    insurance: entryInsurance(a.todayPolicy),
  };
}

/** 会员点了某张卡：能用才换过去，点到禁用的保持原来的选择 */
export function pickEntryCard(sheet: Pick<EntrySheet, 'options' | 'selected'>, cardId: string): string | null {
  return sheet.options.some(o => o.card.id === cardId && o.usable) ? cardId : sheet.selected;
}
