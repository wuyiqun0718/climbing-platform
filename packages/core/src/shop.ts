import type { GymFeatures } from './gym';
import type { Product } from './types';

/** 购卡页的分组：单次票在数据里是 1 次的次卡，单独成一组 */
export type ShopSection = 'period' | 'count' | 'single' | 'pt' | 'class';

export const SHOP_SECTION_LABELS: Record<ShopSection, string> = {
  period: '期限卡',
  count: '次卡',
  single: '单次票',
  pt: '私教课',
  class: '团课',
};

const SECTION_ORDER: ShopSection[] = ['period', 'count', 'single', 'pt', 'class'];

/** 每次入场都单独投当日保险，所有入场方式都含（mvp-plan 第 9 节，2026-10-21 已定） */
export const INSURANCE_PERK = '每次入场含当日保险';

export function isSingleTicket(p: Product): boolean {
  return p.category === 'count' && p.quantity === 1;
}

export function shopSectionOf(p: Product): ShopSection {
  return isSingleTicket(p) ? 'single' : p.category;
}

/** 能用来入场的商品（期限卡、次卡、单次票） */
export function isEntryProduct(p: Product): boolean {
  return p.category === 'period' || p.category === 'count';
}

/** 卖点：入场类商品没写保险的补上一条，写过（比如「含当日保险」）的不重复 */
export function productPerks(p: Product): string[] {
  if (!isEntryProduct(p) || p.perks.some(x => x.includes('当日保险'))) return p.perks;
  return [...p.perks, INSURANCE_PERK];
}

export interface ShopGroup {
  section: ShopSection;
  products: Product[];
}

/**
 * 购卡页分组：只放在售的；岩馆没开团课/私教就不显示对应课包；空的组不返回。
 * 组按 期限卡、次卡、单次票、私教、团课 排，组内按价格从低到高。
 */
export function groupProducts(products: Product[], features?: Pick<GymFeatures, 'groupClasses' | 'personalTraining'>): ShopGroup[] {
  const shown = products.filter(p => p.onSale
    && !(p.category === 'pt' && features && !features.personalTraining)
    && !(p.category === 'class' && features && !features.groupClasses));
  return SECTION_ORDER
    .map(section => ({
      section,
      products: shown.filter(p => shopSectionOf(p) === section).sort((a, b) => a.priceCents - b.priceCents),
    }))
    .filter(g => g.products.length > 0);
}
