import { shopSectionOf, type ShopSection } from './shop';
import type { RuleErrorCode } from './rules';
import type { Product, ProductCategory } from './types';

/**
 * 卡种与价格（任务 19）：新建、改价、改卖点、上下架、排序的校验，列表顺序，能不能买。后台卡种页、mock 和后端都按这里。
 *
 * 已定：
 * - 改价只影响以后的订单。订单下单时存商品快照（名称、品类、标价，小程序订单还有天数、次数、有效月数），卡在下单时按当时的卡种开好，
 *   以后改卡种不回头改订单和卡。
 * - 下架的不能再买：小程序 GET /products 不返回（productsForSale），前台开卡 422（productBlockedBy）。
 * - 卡种建好以后品类和规格（天数、次数、有效月数）不能改，要换规格就新建一个、把旧的下架；不然同一个卡种 ID 前后卖的是两种东西，
 *   报表和对账对不上。只能改名称、标价、卖点、上下架、排序。
 * - 谁能改价还在讨论，权限见 dashboard 的 permissions.ts（product.price，占位）；改别的是 product.edit。
 *
 * 等馆方的占位，确认后只改这几个常量：
 * 1. 名称最多 PRODUCT_NAME_MAX 个字；在售的卡种不能重名（前台开卡、小程序里分不清）。
 * 2. 卖点最多 PRODUCT_PERKS_MAX 条，每条最多 PRODUCT_PERK_MAX 个字。
 * 3. 标价大于 0（送卡走「调整」），最多 PRODUCT_PRICE_MAX_CENTS（防手滑多打一个 0）。
 * 4. 期限卡天数 1–PRODUCT_DAYS_MAX；次数、节数 1–PRODUCT_QUANTITY_MAX；有效月数 1–PRODUCT_VALID_MONTHS_MAX，
 *    不填按 order.ts 的规则（单次票当天有效，多次的 DEFAULT_VALID_MONTHS）。
 */

export const PRODUCT_NAME_MAX = 20;
export const PRODUCT_PERKS_MAX = 5;
export const PRODUCT_PERK_MAX = 30;
export const PRODUCT_PRICE_MAX_CENTS = 10_000_000;
export const PRODUCT_DAYS_MAX = 3650;
export const PRODUCT_QUANTITY_MAX = 999;
export const PRODUCT_VALID_MONTHS_MAX = 60;
export const PRODUCT_SORT_MAX = 9999;

export const PRODUCT_CATEGORIES: readonly ProductCategory[] = ['period', 'count', 'pt', 'class'];

export const PRODUCT_CATEGORY_TEXT: Record<ProductCategory, string> = { period: '期限卡', count: '次卡', pt: '私教课包', class: '团课包' };

/** 建好以后不能改的字段 */
export const PRODUCT_SPEC_FIELDS = ['category', 'days', 'quantity', 'validMonths'] as const;

/** 新建卡种 POST /admin/products 的内容；sort 不填排在最后 */
export interface ProductInput {
  category: ProductCategory;
  name: string;
  priceCents: number;
  days?: number;
  quantity?: number;
  validMonths?: number;
  perks: string[];
  onSale: boolean;
  sort?: number;
}

/** 修改卡种 PATCH /admin/products/:id：只传要改的 */
export type ProductPatch = Partial<Pick<Product, 'name' | 'priceCents' | 'perks' | 'onSale' | 'sort'>>;

export type ProductErrors = Partial<Record<keyof ProductInput, string>>;

const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const cleanName = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const cleanPerks = (v: string[]) => v.map(x => x.trim()).filter(Boolean);

/** 在售的卡种里有没有别的叫这个名字 */
const nameTaken = (products: readonly Product[], name: string, exceptId?: string) => products.some(p => p.onSale && p.id !== exceptId && p.name.trim() === name);

function commonErrors(errs: ProductErrors, input: Partial<Record<keyof ProductInput, unknown>>) {
  if ('name' in input) {
    const name = cleanName(input.name);
    if (!name) errs.name = '名称要填';
    else if (name.length > PRODUCT_NAME_MAX) errs.name = `名称最多 ${PRODUCT_NAME_MAX} 个字`;
  }
  if ('priceCents' in input) {
    if (!Number.isInteger(input.priceCents) || (input.priceCents as number) <= 0) errs.priceCents = '标价要大于 0，最多两位小数';
    else if ((input.priceCents as number) > PRODUCT_PRICE_MAX_CENTS) errs.priceCents = `标价最多 ${PRODUCT_PRICE_MAX_CENTS / 100} 元，看看是不是多打了 0`;
  }
  if ('perks' in input) {
    const v = input.perks;
    if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) errs.perks = '卖点格式不对';
    else {
      const perks = cleanPerks(v);
      if (perks.length > PRODUCT_PERKS_MAX) errs.perks = `卖点最多 ${PRODUCT_PERKS_MAX} 条`;
      else if (perks.some(x => x.length > PRODUCT_PERK_MAX)) errs.perks = `每条卖点最多 ${PRODUCT_PERK_MAX} 个字`;
    }
  }
  if ('onSale' in input && typeof input.onSale !== 'boolean') errs.onSale = '选一下上架还是下架';
  if ('sort' in input && input.sort !== undefined && !isInt(input.sort, 0, PRODUCT_SORT_MAX)) errs.sort = `排序填 0–${PRODUCT_SORT_MAX} 的整数`;
}

/** 新建卡种的校验，按字段给错误；全对返回 null。input 是接口收到的原样内容，products 是现有的卡种（查重名） */
export function newProductErrors(input: Partial<Record<keyof ProductInput, unknown>>, products: readonly Product[]): ProductErrors | null {
  const errs: ProductErrors = {};
  commonErrors(errs, { name: input.name, priceCents: input.priceCents, perks: input.perks ?? [], onSale: input.onSale, sort: input.sort });
  const cat = input.category as ProductCategory;
  if (!PRODUCT_CATEGORIES.includes(cat)) errs.category = '选一下品类';
  else if (cat === 'period') {
    if (!isInt(input.days, 1, PRODUCT_DAYS_MAX)) errs.days = `天数填 1–${PRODUCT_DAYS_MAX} 的整数`;
    if (input.quantity !== undefined) errs.quantity = '期限卡不填次数';
    if (input.validMonths !== undefined) errs.validMonths = '期限卡按天数算，不填有效月数';
  } else {
    if (input.days !== undefined) errs.days = '只有期限卡填天数';
    if (!isInt(input.quantity, 1, PRODUCT_QUANTITY_MAX)) errs.quantity = `次数填 1–${PRODUCT_QUANTITY_MAX} 的整数`;
    if (input.validMonths !== undefined && !isInt(input.validMonths, 1, PRODUCT_VALID_MONTHS_MAX)) errs.validMonths = `有效月数填 1–${PRODUCT_VALID_MONTHS_MAX} 的整数，或者不填`;
  }
  if (!errs.name && !errs.onSale && input.onSale && nameTaken(products, cleanName(input.name))) errs.name = '在售的卡种里已经有这个名字了';
  return Object.keys(errs).length ? errs : null;
}

/** 修改卡种的校验；全对返回 null。品类和规格不能改，传了且跟原来不一样就报错 */
export function productPatchErrors(product: Product, patch: Partial<Record<keyof ProductInput, unknown>>, products: readonly Product[]): ProductErrors | null {
  const errs: ProductErrors = {};
  for (const f of PRODUCT_SPEC_FIELDS) {
    if (f in patch && patch[f] !== product[f]) errs[f] = '建好以后不能改，要换就新建一个卡种、把这个下架';
  }
  commonErrors(errs, patch);
  if (!errs.name && !errs.onSale) {
    const after = applyProductPatch(product, patch as ProductPatch);
    if (after.onSale && (after.name !== product.name || !product.onSale) && nameTaken(products, after.name, product.id)) {
      errs.name = '在售的卡种里已经有这个名字了';
    }
  }
  return Object.keys(errs).length ? errs : null;
}

/** 按新建的内容建一个卡种（先用 newProductErrors 校验过）。sort 不填排在现有的最后 */
export function buildProduct(id: string, input: ProductInput, products: readonly Product[]): Product {
  const p: Product = {
    id,
    category: input.category,
    name: input.name.trim(),
    priceCents: input.priceCents,
    perks: cleanPerks(input.perks),
    onSale: input.onSale,
    sort: input.sort ?? products.reduce((max, x) => Math.max(max, x.sort ?? 0), 0) + 1,
  };
  if (input.category === 'period') p.days = input.days;
  else {
    p.quantity = input.quantity;
    if (input.validMonths !== undefined) p.validMonths = input.validMonths;
  }
  return p;
}

/** 改后的卡种（先用 productPatchErrors 校验过）；只取能改的字段，别的忽略 */
export function applyProductPatch(product: Product, patch: ProductPatch): Product {
  const next = { ...product };
  if (patch.name !== undefined) next.name = cleanName(patch.name);
  if (patch.priceCents !== undefined) next.priceCents = patch.priceCents;
  if (patch.perks !== undefined) next.perks = cleanPerks(patch.perks);
  if (patch.onSale !== undefined) next.onSale = patch.onSale;
  if (patch.sort !== undefined) next.sort = patch.sort;
  return next;
}

/** 这次修改有没有改价（要 product.price 权限） */
export const changesPrice = (product: Product, patch: ProductPatch) => patch.priceCents !== undefined && patch.priceCents !== product.priceCents;

/** 能不能买：下架的不能（小程序下单、前台开卡都查这个） */
export const productBlockedBy = (p: Pick<Product, 'onSale'>): RuleErrorCode | null => (p.onSale ? null : 'product-off-sale');

const SECTION_ORDER: ShopSection[] = ['period', 'count', 'single', 'pt', 'class'];

/**
 * 卡种列表的顺序：按组（期限卡、次卡、单次票、私教、团课；单次票是 1 次的次卡），组内按 sort 从小到大（没填的算 0），
 * 再按标价、ID。不改原数组。
 */
export function sortProducts<P extends Product>(products: readonly P[]): P[] {
  const rank = (p: Product) => SECTION_ORDER.indexOf(shopSectionOf(p));
  return [...products].sort((a, b) => rank(a) - rank(b) || (a.sort ?? 0) - (b.sort ?? 0) || a.priceCents - b.priceCents || a.id.localeCompare(b.id));
}

/** 小程序 GET /products 返回的：只有在售的，顺序同 sortProducts */
export const productsForSale = <P extends Product>(products: readonly P[]): P[] => sortProducts(products.filter(p => p.onSale));
