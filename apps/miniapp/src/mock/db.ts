import type { Card, CheckIn, Product, Share } from '@climb/core';
import { addDays, type DateKey } from '@climb/utils';

export interface MockMember {
  id: string;
  name: string;
  phone: string;
  /** 小程序登录后才有；从青橙导入的老会员一开始为空，第一次登录验证手机号时绑上 */
  openid: string | null;
  source: 'walkin' | 'legacy_import';
  /** 青橙里的会员 ID */
  legacyId?: string;
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

export const MOCK_MEMBERS = { ajie: 'm-ajie', xiaolu: 'm-xiaolu', laozhou: 'm-laozhou' } as const;

/** 从青橙导入、还没用过小程序的老会员老周的手机号；H5 登录时输入它就能认领老卡 */
export const MOCK_LEGACY_PHONE = '13800000003';

/** mock 的 token 就是 `mock:<会员 id>` */
export const mockToken = (memberId: string) => `mock:${memberId}`;

/** 微信登录了但还没验证手机号时的临时 token，只能用来调 `POST /auth/phone` */
export const mockWxToken = (openid: string) => `mock-wx:${openid}`;

/**
 * 示例数据，跟原型一致：年卡会员阿杰（还有一张 10 次卡），第一次来的小鹿什么卡都没有。
 * 另有一位从青橙导入的老会员老周（20 次卡剩 8 次），还没登录过小程序，没有 openid。
 * 价格是原型里的占位价（docs/project-context.md 第 7 节）。
 */
export function seedDb(today: DateKey): MockDb {
  const p = (id: string, category: Product['category'], name: string, yuan: number, extra: Partial<Product> = {}): Product => ({
    id, category, name, priceCents: yuan * 100, perks: [], onSale: true, ...extra,
  });
  return {
    members: [
      { id: MOCK_MEMBERS.ajie, name: '阿杰', phone: '13800000001', openid: 'wx-ajie', source: 'walkin' },
      { id: MOCK_MEMBERS.xiaolu, name: '小鹿', phone: '13800000002', openid: 'wx-xiaolu', source: 'walkin' },
      { id: MOCK_MEMBERS.laozhou, name: '老周', phone: MOCK_LEGACY_PHONE, openid: null, source: 'legacy_import', legacyId: 'qc-10086' },
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
      { id: 'card-laozhou-c20', kind: 'count', memberId: MOCK_MEMBERS.laozhou, productId: 'c20', name: '20 次卡', total: 20, remaining: 8, expiresOn: addDays(today, 200) },
    ],
    shares: [],
    checkIns: [],
    seq: 0,
  };
}

/** mock 数据存哪：小程序和 H5 里是 uni 本地存储，测试里用内存 */
export interface MockStorage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

const DB_KEY = 'mock:db';
const MEMBER_KEY = 'mock:member';
/** 示例数据的结构改了就加 1，存着的旧数据会被丢掉、重新生成 */
const DB_VERSION = 2;

/** 读存着的数据；没有或者版本不对就用示例数据重新生成 */
export function loadDb(storage: MockStorage, today: DateKey): MockDb {
  const saved = storage.get(DB_KEY) as { version?: number; db?: MockDb } | null | undefined;
  if (saved?.version === DB_VERSION && saved.db) return saved.db;
  const db = seedDb(today);
  saveDb(storage, db);
  return db;
}

export function saveDb(storage: MockStorage, db: MockDb) {
  storage.set(DB_KEY, { version: DB_VERSION, db: JSON.parse(JSON.stringify(db)) });
}

/** 开发时当前用哪位示例会员的身份，默认阿杰 */
export function loadCurrentMember(storage: MockStorage, db: MockDb): string {
  const id = storage.get(MEMBER_KEY);
  return typeof id === 'string' && db.members.some(m => m.id === id && m.openid) ? id : MOCK_MEMBERS.ajie;
}

export function saveCurrentMember(storage: MockStorage, memberId: string) {
  storage.set(MEMBER_KEY, memberId);
}
