import { describe, expect, it } from 'vitest';
import { groupProducts, INSURANCE_PERK, productPerks, shopSectionOf } from './shop';
import type { Product } from './types';

const p = (id: string, category: Product['category'], priceCents: number, extra: Partial<Product> = {}): Product => ({
  id, category, name: id, priceCents, perks: [], onSale: true, ...extra,
});

const year = p('year', 'period', 499900, { days: 365 });
const month = p('month', 'period', 59900, { days: 30 });
const c10 = p('c10', 'count', 89900, { quantity: 10 });
const single = p('single', 'count', 10800, { quantity: 1, perks: ['含当日保险'] });
const pt5 = p('pt5', 'pt', 198000, { quantity: 5 });
const class10 = p('class10', 'class', 108000, { quantity: 10 });

describe('购卡页分组', () => {
  it('1 次的次卡算单次票，单独一组', () => {
    expect(shopSectionOf(single)).toBe('single');
    expect(shopSectionOf(c10)).toBe('count');
  });

  it('按期限卡、次卡、单次票、私教、团课排，组内按价格从低到高', () => {
    const groups = groupProducts([class10, pt5, single, c10, year, month]);
    expect(groups.map(g => g.section)).toEqual(['period', 'count', 'single', 'pt', 'class']);
    expect(groups[0].products.map(x => x.id)).toEqual(['month', 'year']);
  });

  it('下架的不显示，空组不返回', () => {
    const groups = groupProducts([year, { ...c10, onSale: false }, single]);
    expect(groups.map(g => g.section)).toEqual(['period', 'single']);
  });

  it('岩馆没开私教/团课时不显示对应课包', () => {
    const groups = groupProducts([year, pt5, class10], { personalTraining: false, groupClasses: true });
    expect(groups.map(g => g.section)).toEqual(['period', 'class']);
  });
});

describe('卖点', () => {
  it('入场类商品补上当日保险', () => {
    expect(productPerks({ ...year, perks: ['不限次入场'] })).toEqual(['不限次入场', INSURANCE_PERK]);
  });

  it('已经写了保险的不重复', () => {
    expect(productPerks(single)).toEqual(['含当日保险']);
    expect(productPerks({ ...c10, perks: [INSURANCE_PERK] })).toEqual([INSURANCE_PERK]);
  });

  it('课包不加保险', () => {
    expect(productPerks(pt5)).toEqual([]);
  });
});
