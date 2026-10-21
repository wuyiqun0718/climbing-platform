import type { Cents, DateKey } from '@climb/utils';

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
}

/** 卡的状态：正常、冻结、作废、已退款。只有正常的卡能入场、转赠、发老带新 */
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

/** returned：次卡转赠过期没人领，次数退回原卡（退不退等馆方定，见 mvp-plan 第 9 节问题 4） */
export type ShareStatus = 'pending' | 'claimed' | 'used' | 'returned';

/** 发到微信里的分享：次卡转赠或老带新邀请 */
export interface Share {
  id: string;
  kind: 'count' | 'referral';
  /** 放在分享路径里，领取和查看都按它（@climb/core shareToken.ts）；不对外暴露 id */
  token: string;
  fromMemberId: string;
  /** 次卡转赠：从哪张卡里拆出来的（到期退回时用） */
  fromCardId?: string;
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
  /** 在哪家店入的场（卡三店通用，入场记录带门店） */
  storeId: string;
  on: DateKey;
  /** 扣了几次（期限卡和同日再次入场为 0） */
  deducted: number;
}

/** 流水原因，和后端 card_ledger.reason 一致 */
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
  | 'unfreeze'
  | 'class_book'
  | 'class_cancel'
  | 'class_void';

/** 卡的流水：次数或有效期每变一次记一笔，只追加不修改 */
export interface LedgerEntry {
  id: string;
  cardId: string;
  /** 次数变化，比如 -1；只改有效期（或期限卡）时为 0 */
  delta: number;
  /** 变化后还剩几次；期限卡没有 */
  remainingAfter?: number;
  expiresOnAfter: DateKey;
  reason: LedgerReason;
  refType?: 'check_in' | 'order' | 'share' | 'class_booking';
  refId?: string;
  /** 业务日期 */
  on: DateKey;
  /** 记录时间（ISO） */
  at: string;
  note?: string;
}
