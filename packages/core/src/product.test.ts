import { describe, expect, it } from 'vitest';
import { issueCard } from './order';
import {
  PRODUCT_NAME_MAX,
  PRODUCT_PERKS_MAX,
  PRODUCT_PRICE_MAX_CENTS,
  applyProductPatch,
  buildProduct,
  changesPrice,
  newProductErrors,
  productBlockedBy,
  productPatchErrors,
  productsForSale,
  sortProducts,
  type ProductInput,
} from './product';
import type { Product } from './types';

const p = (id: string, category: Product['category'], priceCents: number, extra: Partial<Product> = {}): Product => ({
  id, category, name: id, priceCents, perks: [], onSale: true, ...extra,
});
const month = p('月卡', 'period', 59_900, { days: 30, sort: 1 });
const ten = p('10 次卡', 'count', 128_000, { quantity: 10, validMonths: 6 });
const all = [month, ten];

const input = (extra: Partial<ProductInput> = {}): ProductInput => ({ category: 'period', name: '半年卡', priceCents: 299_900, days: 180, perks: [], onSale: true, ...extra });

describe('新建卡种', () => {
  it('期限卡要天数，不填次数和有效月数；别的品类要次数，有效月数可以不填', () => {
    expect(newProductErrors(input(), all)).toBeNull();
    expect(newProductErrors(input({ days: undefined }), all)?.days).toBeTruthy();
    expect(newProductErrors(input({ quantity: 10 }), all)?.quantity).toBeTruthy();
    expect(newProductErrors(input({ validMonths: 6 }), all)?.validMonths).toBeTruthy();
    const count = input({ category: 'count', name: '单次票', priceCents: 9_900, days: undefined, quantity: 1 });
    expect(newProductErrors(count, all)).toBeNull();
    expect(newProductErrors({ ...count, days: 1 }, all)?.days).toBeTruthy();
    expect(newProductErrors({ ...count, quantity: 0 }, all)?.quantity).toBeTruthy();
    expect(newProductErrors({ ...count, validMonths: 0 }, all)?.validMonths).toBeTruthy();
    expect(newProductErrors({ ...count, category: 'pt' as const, quantity: 5, validMonths: 3 }, all)).toBeNull();
    expect(newProductErrors({ ...count, category: 'gift' as never }, all)?.category).toBeTruthy();
  });

  it('名称必填、有长度上限；标价大于 0、整数分、有上限', () => {
    expect(newProductErrors(input({ name: '  ' }), all)?.name).toBe('名称要填');
    expect(newProductErrors(input({ name: '啊'.repeat(PRODUCT_NAME_MAX + 1) }), all)?.name).toBeTruthy();
    expect(newProductErrors(input({ priceCents: 0 }), all)?.priceCents).toBeTruthy();
    expect(newProductErrors(input({ priceCents: 1.5 }), all)?.priceCents).toBeTruthy();
    expect(newProductErrors(input({ priceCents: PRODUCT_PRICE_MAX_CENTS }), all)).toBeNull();
    expect(newProductErrors(input({ priceCents: PRODUCT_PRICE_MAX_CENTS + 1 }), all)?.priceCents).toBeTruthy();
  });

  it('卖点去掉空的，条数有上限；排序是 0 以上的整数', () => {
    expect(newProductErrors(input({ perks: Array(PRODUCT_PERKS_MAX).fill('x').concat(' ') }), all)).toBeNull();
    expect(newProductErrors(input({ perks: Array(PRODUCT_PERKS_MAX + 1).fill('x') }), all)?.perks).toBeTruthy();
    expect(newProductErrors(input({ sort: -1 }), all)?.sort).toBeTruthy();
    expect(newProductErrors(input({ sort: 0 }), all)).toBeNull();
  });

  it('在售的卡种不能重名；下架的同名不算，新建成下架的也不查', () => {
    expect(newProductErrors(input({ name: ' 月卡 ' }), all)?.name).toBe('在售的卡种里已经有这个名字了');
    expect(newProductErrors(input({ name: '月卡' }), [{ ...month, onSale: false }])).toBeNull();
    expect(newProductErrors(input({ name: '月卡', onSale: false }), all)).toBeNull();
  });

  it('建出来的卡种只带这个品类的规格，名称和卖点去掉空格，排序默认排在最后', () => {
    const made = buildProduct('p-new', input({ name: ' 半年卡 ', perks: [' 含保险 ', ''] }), all);
    expect(made).toEqual({ id: 'p-new', category: 'period', name: '半年卡', priceCents: 299_900, days: 180, perks: ['含保险'], onSale: true, sort: 2 });
    const single = buildProduct('p-1x', input({ category: 'count', days: undefined, quantity: 1, sort: 0 }), all);
    expect(single).not.toHaveProperty('days');
    expect(single).not.toHaveProperty('validMonths');
    expect(single.sort).toBe(0);
  });
});

describe('修改卡种', () => {
  it('能改名称、标价、卖点、上下架、排序；品类和规格传了原值可以，改了不行', () => {
    expect(productPatchErrors(month, { priceCents: 49_900, perks: ['a'], onSale: false, sort: 3, name: '新月卡' }, all)).toBeNull();
    expect(productPatchErrors(month, { days: 30, category: 'period' }, all)).toBeNull();
    const errs = productPatchErrors(month, { days: 31, category: 'count' }, all);
    expect(Object.keys(errs ?? {}).sort()).toEqual(['category', 'days']);
    expect(productPatchErrors(ten, { validMonths: 12 }, all)?.validMonths).toBeTruthy();
    expect(productPatchErrors(ten, { quantity: 20 }, all)?.quantity).toBeTruthy();
    expect(productPatchErrors(month, { priceCents: 0 }, all)?.priceCents).toBeTruthy();
    expect(productPatchErrors(month, { name: '' }, all)?.name).toBeTruthy();
    expect(productPatchErrors(month, { onSale: 'yes' }, all)?.onSale).toBeTruthy();
  });

  it('改名或重新上架时不能跟别的在售卡种重名；不改名、改成下架不查', () => {
    const old = { ...month, id: 'p-old', onSale: false };
    const list = [...all, old];
    expect(productPatchErrors(ten, { name: '月卡' }, list)?.name).toBeTruthy();
    expect(productPatchErrors(old, { onSale: true }, list)?.name).toBeTruthy();
    expect(productPatchErrors(old, { onSale: true, name: '月卡（旧）' }, list)).toBeNull();
    expect(productPatchErrors(ten, { name: '月卡', onSale: false }, list)).toBeNull();
    expect(productPatchErrors(month, { priceCents: 1 }, [...list, { ...month, id: 'dup' }])).toBeNull();
  });

  it('只改能改的字段，原卡种不变；只有标价变了才算改价', () => {
    const next = applyProductPatch(month, { priceCents: 49_900, name: ' 月卡 ', days: 99 } as never);
    expect(next).toEqual({ ...month, priceCents: 49_900, name: '月卡' });
    expect(month.priceCents).toBe(59_900);
    expect(changesPrice(month, { priceCents: 49_900 })).toBe(true);
    expect(changesPrice(month, { priceCents: 59_900, name: 'x' })).toBe(false);
    expect(changesPrice(month, { perks: [] })).toBe(false);
  });

  it('改价不影响已经开出去的卡：卡在下单时按当时的卡种开好，跟以后的卡种没关系', () => {
    const card = issueCard({ id: 'c1', product: ten, memberId: 'm', cards: [], today: '2026-10-21' });
    applyProductPatch(ten, { priceCents: 1, name: '改名' });
    expect(card).toMatchObject({ name: '10 次卡', total: 10, expiresOn: '2027-04-20' });
  });
});

describe('上下架和列表顺序', () => {
  it('下架的不能买', () => {
    expect(productBlockedBy(month)).toBeNull();
    expect(productBlockedBy({ onSale: false })).toBe('product-off-sale');
  });

  it('按 期限卡、次卡、单次票、私教、团课 分组；组内按排序，再按标价', () => {
    const list = [
      p('团课', 'class', 98_000, { quantity: 10 }),
      p('单次', 'count', 9_900, { quantity: 1 }),
      p('20 次', 'count', 229_900, { quantity: 20, sort: 1 }),
      p('10 次', 'count', 128_000, { quantity: 10, sort: 2 }),
      p('私教', 'pt', 199_900, { quantity: 5 }),
      p('年卡', 'period', 499_900, { days: 365 }),
      p('季卡', 'period', 159_900, { days: 90 }),
    ];
    expect(sortProducts(list).map(x => x.id)).toEqual(['季卡', '年卡', '20 次', '10 次', '单次', '私教', '团课']);
    expect(list[0]!.id).toBe('团课');
  });

  it('小程序只看到在售的', () => {
    expect(productsForSale([ten, { ...month, onSale: false }]).map(x => x.id)).toEqual(['10 次卡']);
  });
});
