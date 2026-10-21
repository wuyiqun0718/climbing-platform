import { ledgerEntry, snapshotOf, type Card, type CheckIn, type ClassBooking, type ClassSession, type ClassType, type PtBooking, type PtSlotMark, type EntryQr, type InsurancePolicy, type LedgerEntry, type Order, type Product, type Share, type WaiverSignature, type WaiverVersion } from '@climb/core';
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

/** 入场记录：后端 check_ins 表里多存的是不是再次入场、幂等键、当天保单 */
export interface MockCheckIn extends CheckIn {
  reentry: boolean;
  idempotencyKey?: string;
  policyId: string;
}

/** 教练（员工），团课和私教用；后台员工账号和教练资料（mvp/dashboard 任务 22、28）建 */
export interface MockCoach {
  id: string;
  name: string;
  /** 擅长什么，教练列表上的小标签 */
  tags: string[];
  bio: string;
  /** 在哪几家店接私教；教练列表按门店筛 */
  storeIds: string[];
}

/** 私教预约：后端 pt_bookings 表里多存一个幂等键 */
export interface MockPtBooking extends PtBooking {
  idempotencyKey?: string;
}

/** 团课预约：后端 class_bookings 表里多存一个幂等键 */
export interface MockClassBooking extends ClassBooking {
  idempotencyKey?: string;
}

export interface MockDb {
  members: MockMember[];
  stores: MockStore[];
  products: Product[];
  cards: Card[];
  shares: Share[];
  checkIns: MockCheckIn[];
  /** 前台平板签发过的入场码 */
  entryQrs: EntryQr[];
  /** 入场保险，一人一天一张 */
  policies: InsurancePolicy[];
  /** 风险告知书的各个版本（后台上新版） */
  waiverVersions: WaiverVersion[];
  /** 会员签的告知书，只追加 */
  waivers: WaiverSignature[];
  /** 卡的流水，只追加 */
  ledger: LedgerEntry[];
  orders: Order[];
  coaches: MockCoach[];
  /** 团课课程种类、排好的课、预约；后台 /admin/class-types、/admin/classes 读写同一份 */
  classTypes: ClassType[];
  classSessions: ClassSession[];
  classBookings: MockClassBooking[];
  /** 私教：后台标的线下约、不接课，会员约的；后台私教时间轴（/admin/pt-slots）读写同一份 */
  ptSlotMarks: PtSlotMark[];
  ptBookings: MockPtBooking[];
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
 * 告知书第一版。条款是原型里编的示意文本（prototype/js/data.js 的 WAIVER_POINTS），
 * 正式文本要馆方提供或请律师看过（docs/project-context.md 第 6 节第 9 条），上线前在后台换成正式版。
 */
export const MOCK_WAIVER: WaiverVersion = {
  id: 'waiver-2026-01',
  version: '2026-01',
  title: '攀岩运动风险告知书',
  points: [
    '攀岩有坠落、扭伤、擦伤等风险，我会按自己的水平选择线路。',
    '第一次来会先听前台讲安全须知，抱石落地时屈膝、不往人多的地方跳。',
    '顶绳和先锋要用馆里认可的保护方式，没学过保护不给别人做保护。',
    '身体不舒服、喝过酒不上墙；未成年人要有监护人陪同。',
  ],
  effectiveFrom: '2026-01-01',
};

/**
 * 示例数据，跟原型一致：年卡会员阿杰（还有一张 10 次卡、一张团课 10 次、一张私教 5 节），第一次来的小鹿什么卡都没有。
 * 另有一位从青橙导入的老会员老周（20 次卡剩 8 次），还没登录过小程序，没有 openid。
 * 价格是原型里的占位价（docs/project-context.md 第 7 节）。
 */
export function seedDb(today: DateKey): MockDb {
  const year: Card = { id: 'card-ajie-year', kind: 'period', memberId: MOCK_MEMBERS.ajie, productId: 'year', name: '年卡', startsOn: addDays(today, -209), expiresOn: addDays(today, 155) };
  const c10: Card = { id: 'card-ajie-c10', kind: 'count', memberId: MOCK_MEMBERS.ajie, productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: addDays(today, 118) };
  const k10: Card = { id: 'card-ajie-class10', kind: 'class', memberId: MOCK_MEMBERS.ajie, productId: 'class10', name: '团课 10 次', total: 10, remaining: 10, expiresOn: addDays(today, 170) };
  const pt5: Card = { id: 'card-ajie-pt5', kind: 'pt', memberId: MOCK_MEMBERS.ajie, productId: 'pt5', name: '私教 5 节', total: 5, remaining: 5, expiresOn: addDays(today, 175) };
  const c20: Card = { id: 'card-laozhou-c20', kind: 'count', memberId: MOCK_MEMBERS.laozhou, productId: 'c20', name: '20 次卡', total: 20, remaining: 8, expiresOn: addDays(today, 200) };
  // 阿杰的 10 次卡：买了以后带朋友来用过 4 次，流水和入场记录对得上
  const c10Visits = [[-50, 'binggang'], [-36, 'huiju'], [-21, 'binggang'], [-7, 'huanqiugang']] as const;
  const checkIns: MockCheckIn[] = c10Visits.map(([d, storeId], i) => ({
    id: `ci-seed-${i + 1}`, memberId: MOCK_MEMBERS.ajie, cardId: c10.id, on: addDays(today, d), deducted: 1, storeId, reentry: false, policyId: `ip-seed-${i + 1}`,
  }));
  const policies: InsurancePolicy[] = checkIns.map(ci => ({ id: ci.policyId, memberId: ci.memberId, storeId: ci.storeId, on: ci.on, checkInId: ci.id, status: 'insured' }));
  const at = (on: DateKey) => `${on}T03:00:00.000Z`;
  const ledger: LedgerEntry[] = [
    ledgerEntry({ id: 'led-seed-1', card: year, delta: 0, reason: 'purchase', on: year.startsOn, at: at(year.startsOn) }),
    ledgerEntry({ id: 'led-seed-2', card: { ...c10, remaining: 10 }, delta: 10, reason: 'purchase', on: addDays(today, -62), at: at(addDays(today, -62)), ref: { type: 'order', id: 'order-seed-3' } }),
    ...checkIns.map((ci, i) => ledgerEntry({
      id: `led-seed-${i + 3}`, card: { ...c10, remaining: 9 - i }, delta: -1, reason: 'check_in', on: ci.on, at: at(ci.on), ref: { type: 'check_in', id: ci.id },
    })),
    ledgerEntry({ id: 'led-seed-8', card: k10, delta: 10, reason: 'purchase', on: addDays(today, -10), at: at(addDays(today, -10)), ref: { type: 'order', id: 'order-seed-4' } }),
    ledgerEntry({ id: 'led-seed-9', card: pt5, delta: 5, reason: 'purchase', on: addDays(today, -5), at: at(addDays(today, -5)), ref: { type: 'order', id: 'order-seed-5' } }),
    ledgerEntry({ id: 'led-seed-7', card: c20, delta: 8, reason: 'import', on: addDays(today, -3), at: at(addDays(today, -3)), note: '青橙导入' }),
  ];
  const p = (id: string, category: Product['category'], name: string, yuan: number, extra: Partial<Product> = {}): Product => ({
    id, category, name, priceCents: yuan * 100, perks: [], onSale: true, ...extra,
  });
  const products = [
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
  ];
  // 阿杰的订单：年卡在滨港店前台刷卡买的，10 次卡在小程序买的，还有一单私教体验课退了
  const order = (id: string, productId: string, on: DateKey, extra: Partial<Order>): Order => {
    const product = snapshotOf(products.find(x => x.id === productId)!);
    const createdAt = at(on);
    return {
      id, memberId: MOCK_MEMBERS.ajie, product, amountCents: product.priceCents, channel: 'wechat', status: 'paid',
      createdAt, expiresAt: new Date(Date.parse(createdAt) + 15 * 60_000).toISOString(), paidAt: createdAt, ...extra,
    };
  };
  const orders: Order[] = [
    order('order-seed-1', 'year', year.startsOn, { channel: 'desk_pos', storeId: 'binggang', cardId: year.id }),
    order('order-seed-2', 'pt-trial', addDays(today, -80), { status: 'refunded', wxTransactionId: 'mock-wx-order-seed-2' }),
    order('order-seed-3', 'c10', addDays(today, -62), { wxTransactionId: 'mock-wx-order-seed-3', cardId: c10.id }),
    order('order-seed-4', 'class10', addDays(today, -10), { wxTransactionId: 'mock-wx-order-seed-4', cardId: k10.id }),
    order('order-seed-5', 'pt5', addDays(today, -5), { wxTransactionId: 'mock-wx-order-seed-5', cardId: pt5.id }),
  ];
  const { classTypes, classSessions } = seedClasses(today);
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
    products,
    cards: [year, c10, k10, pt5, c20],
    shares: [],
    checkIns,
    entryQrs: [],
    policies,
    waiverVersions: [MOCK_WAIVER],
    // 阿杰来过几次，签过告知书；小鹿第一次来、老周还没用过小程序，都没签
    waivers: [{ id: 'waiver-sign-seed-1', memberId: MOCK_MEMBERS.ajie, waiverVersionId: MOCK_WAIVER.id, signedAt: at(addDays(today, -62)) }],
    ledger,
    orders,
    coaches: MOCK_COACHES,
    classTypes,
    classSessions,
    classBookings: [],
    ptSlotMarks: seedPtMarks(today),
    ptBookings: [],
    seq: 0,
  };
}

export const MOCK_COACHES: MockCoach[] = [
  { id: 'coach-max', name: 'Max', tags: ['抱石', '力量训练'], bio: '前省队抱石选手，课上会拍视频逐帧拆动作。', storeIds: ['binggang', 'huiju'] },
  { id: 'coach-kiki', name: 'Kiki', tags: ['零基础', '柔韧'], bio: '第一次摸岩点也不用紧张，从站姿开始教。', storeIds: ['huanqiugang', 'huiju'] },
  { id: 'coach-may', name: 'May', tags: ['先锋攀登', '保护技术'], bio: '持证先锋保护教练，想从抱石转先锋从她这里开始。', storeIds: ['binggang'] },
];

/** 私教示例：明天 Max 15 点线下约了学员、19 点有事不接课，May 后天上午不接课 */
function seedPtMarks(today: DateKey): PtSlotMark[] {
  const tomorrow = addDays(today, 1);
  return [
    { id: 'ptm-seed-1', coachId: 'coach-max', on: tomorrow, hour: 15, kind: 'offline', note: '小王' },
    { id: 'ptm-seed-2', coachId: 'coach-max', on: tomorrow, hour: 19, kind: 'off', note: '带队比赛' },
    { id: 'ptm-seed-3', coachId: 'coach-may', on: addDays(today, 2), hour: 10, kind: 'off' },
    { id: 'ptm-seed-4', coachId: 'coach-may', on: addDays(today, 2), hour: 11, kind: 'off' },
  ];
}

/**
 * 团课示例：跟原型的课表一样，从今天起 7 天，每种课按星期几开。
 * 后天滨港店的「先锋攀登体验」被岩馆取消了，用来看取消的样子。
 */
function seedClasses(today: DateKey) {
  const t = (id: string, name: string, minutes: number, capacity: number, coachId: string): ClassType => ({ id, name, minutes, capacity, credits: 1, coachId, active: true });
  const classTypes = [
    t('ct-bouldering', '抱石入门', 90, 8, 'coach-kiki'),
    t('ct-lead', '先锋攀登体验', 120, 6, 'coach-may'),
    t('ct-core', '核心与指力', 60, 10, 'coach-max'),
    t('ct-stretch', '拉伸与灵活性', 60, 12, 'coach-kiki'),
  ];
  const plan: { type: string; storeId: string; startTime: string; weekdays: number[] }[] = [
    { type: 'ct-bouldering', storeId: 'huanqiugang', startTime: '19:00', weekdays: [1, 3, 5, 0] },
    { type: 'ct-lead', storeId: 'binggang', startTime: '14:00', weekdays: [6, 0, 3] },
    { type: 'ct-core', storeId: 'binggang', startTime: '20:00', weekdays: [1, 2, 4, 5] },
    { type: 'ct-stretch', storeId: 'huiju', startTime: '18:30', weekdays: [2, 4, 6] },
  ];
  const classSessions: ClassSession[] = [];
  for (let i = 0; i < 7; i++) {
    const on = addDays(today, i);
    const weekday = new Date(`${on}T00:00:00`).getDay();
    for (const p of plan) {
      if (!p.weekdays.includes(weekday)) continue;
      const type = classTypes.find(x => x.id === p.type)!;
      classSessions.push({
        id: `cls-${on}-${p.type.slice(3)}`, classTypeId: type.id, name: type.name, storeId: p.storeId, on, startTime: p.startTime,
        minutes: type.minutes, capacity: type.capacity, credits: type.credits, coachId: type.coachId, status: 'scheduled',
      });
    }
  }
  const lead = classSessions.find(c => c.classTypeId === 'ct-lead' && c.on > addDays(today, 1));
  if (lead) Object.assign(lead, { status: 'cancelled', cancelReason: '教练临时有事，这节停一次' });
  return { classTypes, classSessions };
}

/** mock 数据存哪：小程序和 H5 里是 uni 本地存储，测试里用内存 */
export interface MockStorage {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

const DB_KEY = 'mock:db';
const WX_KEY = 'mock:wx';
/** 示例数据的结构改了就加 1，存着的旧数据会被丢掉、重新生成 */
const DB_VERSION = 10;

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

/** 开发时当前用哪个微信（openid），默认阿杰的 */
export function loadCurrentWx(storage: MockStorage): string {
  const openid = storage.get(WX_KEY);
  return typeof openid === 'string' && openid ? openid : 'wx-ajie';
}

export function saveCurrentWx(storage: MockStorage, openid: string) {
  storage.set(WX_KEY, openid);
}
