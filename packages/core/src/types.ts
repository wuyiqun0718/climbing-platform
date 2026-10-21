import type { Cents, DateKey } from '@climb/utils';

/** 跟小程序分支一样，从 types 也能拿到 LedgerReason（classes.ts 从这里引） */
export type { LedgerReason } from './ledger';

export type ProductCategory = 'period' | 'count' | 'pt' | 'class';

/** 在售商品：期限卡、次卡、私教课包、团课包 */
export interface Product {
  id: string;
  category: ProductCategory;
  name: string;
  priceCents: Cents;
  /** 期限卡的天数 */
  days?: number;
  /** 次卡次数 / 课包节数 */
  quantity?: number;
  /** 次卡和课包的有效期（月） */
  validMonths?: number;
  perks: string[];
  onSale: boolean;
  /** 列表里的顺序，同一组里小的在前；没填算 0（见 product.ts 的 sortProducts） */
  sort?: number;
}

/** 卡的状态：正常、冻结、作废、已退款。冻结和解冻的规则见任务 17 */
export type CardStatus = 'normal' | 'frozen' | 'void' | 'refunded';

interface CardBase {
  id: string;
  memberId: string;
  name: string;
  /** 最后可用的那一天（含） */
  expiresOn: DateKey;
  /** 不填为 normal */
  status?: CardStatus;
}

/** 期限卡：有效期内不限次入场，每月可以发老带新邀请 */
export interface PeriodCard extends CardBase {
  kind: 'period';
  productId: string;
  startsOn: DateKey;
  /** 冻结中（status 为 frozen）才有：从哪天开始冻结、计划冻结到哪天（含）。到期日要到解冻时才按实际冻结天数顺延 */
  frozenFrom?: DateKey;
  frozenUntil?: DateKey;
}

/** 次卡：入场扣次，可以拆几次送给朋友 */
export interface CountCard extends CardBase {
  kind: 'count';
  productId: string;
  total: number;
  remaining: number;
}

/** 朋友送的次卡：从对方次卡里拆出来，有效期跟原卡一致，不能再转送 */
export interface GiftCard extends CardBase {
  kind: 'gift';
  fromMemberId: string;
  shareId: string;
  total: number;
  remaining: number;
}

/** 老带新体验券：邀请人当天入场后，领取人当天可以免费入场一次 */
export interface ReferralVoucher extends CardBase {
  kind: 'referral';
  fromMemberId: string;
  shareId: string;
  usedOn?: DateKey;
}

/** 私教课时 / 团课次数 */
export interface LessonCard extends CardBase {
  kind: 'pt' | 'class';
  productId: string;
  total: number;
  remaining: number;
}

export type Card = PeriodCard | CountCard | GiftCard | ReferralVoucher | LessonCard;
export type EntryCard = PeriodCard | CountCard | GiftCard | ReferralVoucher;

export type ShareStatus = 'pending' | 'claimed' | 'used';

/** 发到微信里的分享：次卡转赠或老带新邀请 */
export interface Share {
  id: string;
  kind: 'count' | 'referral';
  fromMemberId: string;
  /** 次卡转赠的次数 */
  quantity?: number;
  createdOn: DateKey;
  expiresOn: DateKey;
  status: ShareStatus;
  claimedBy?: string;
}

export interface CheckIn {
  id: string;
  memberId: string;
  cardId: string;
  on: DateKey;
  /** 扣了几次（期限卡和同日再次入场为 0） */
  deducted: number;
}
