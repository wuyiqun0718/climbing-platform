import type { Card, CheckIn, Product, Share } from '@climb/core';
import { addDays, type DateKey } from '@climb/utils';

export interface MockMember {
  id: string;
  name: string;
  phone: string;
}

export interface MockStore {
  id: string;
  name: string;
}

export interface MockDb {
  members: MockMember[];
  stores: MockStore[];
  products: Product[];
  cards: Card[];
  shares: Share[];
  checkIns: (CheckIn & { storeId: string })[];
  /** 自增序号，用来生成 id */
  seq: number;
}

export const MOCK_MEMBERS = { ajie: 'm-ajie', xiaolu: 'm-xiaolu' } as const;

/** mock 的 token 就是 `mock:<会员 id>`，登录做好之前先这样 */
export const mockToken = (memberId: string) => `mock:${memberId}`;

/**
 * 示例数据，跟原型一致：年卡会员阿杰（还有一张 10 次卡），第一次来的小鹿什么卡都没有。
 * 价格是原型里的占位价（docs/project-context.md 第 7 节）。
 */
export function seedDb(today: DateKey): MockDb {
  const p = (id: string, category: Product['category'], name: string, yuan: number, extra: Partial<Product> = {}): Product => ({
    id, category, name, priceCents: yuan * 100, perks: [], onSale: true, ...extra,
  });
  return {
    members: [
      { id: MOCK_MEMBERS.ajie, name: '阿杰', phone: '13800000001' },
      { id: MOCK_MEMBERS.xiaolu, name: '小鹿', phone: '13800000002' },
    ],
    stores: [
      { id: 'binggang', name: '滨港店' },
      { id: 'huiju', name: '汇聚店' },
      { id: 'huanqiugang', name: '环球港店' },
    ],
    products: [
      p('month', 'period', '月卡', 599, { days: 30, perks: ['不限次入场', '每次入场含当日保险'] }),
      p('quarter', 'period', '季卡', 1599, { days: 90, perks: ['不限次入场', '每次入场含当日保险'] }),
      p('year', 'period', '年卡', 4999, { days: 365, perks: ['不限次入场', '每次入场含当日保险', '送 2 节私教体验'] }),
      p('c10', 'count', '10 次卡', 899, { quantity: 10, validMonths: 6, perks: ['三店通用', '可以分给朋友', '每次入场含当日保险'] }),
      p('c20', 'count', '20 次卡', 1599, { quantity: 20, validMonths: 12, perks: ['三店通用', '可以分给朋友', '每次入场含当日保险'] }),
      p('single', 'count', '单次票', 108, { quantity: 1, perks: ['当天有效', '含租鞋', '含当日保险'] }),
      p('pt-trial', 'pt', '私教体验课', 299, { quantity: 1, validMonths: 3 }),
      p('pt5', 'pt', '私教 5 节', 1980, { quantity: 5, validMonths: 6 }),
      p('pt10', 'pt', '私教 10 节', 3680, { quantity: 10, validMonths: 12 }),
      p('class1', 'class', '团课单节', 128, { quantity: 1, validMonths: 1 }),
      p('class10', 'class', '团课 10 次', 1080, { quantity: 10, validMonths: 6 }),
      p('class20', 'class', '团课 20 次', 1980, { quantity: 20, validMonths: 12 }),
    ],
    cards: [
      { id: 'card-ajie-year', kind: 'period', memberId: MOCK_MEMBERS.ajie, productId: 'year', name: '年卡', startsOn: addDays(today, -209), expiresOn: addDays(today, 155) },
      { id: 'card-ajie-c10', kind: 'count', memberId: MOCK_MEMBERS.ajie, productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: addDays(today, 118) },
    ],
    shares: [],
    checkIns: [],
    seq: 0,
  };
}
