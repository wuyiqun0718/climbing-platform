import { MEMBER_SOURCES, type MemberSource, type Staff, type Store } from '@climb/api';
import { defaultRules, type GymRules, type PeriodCard, type RevenueCategory, type RevenueOrder, type RevenueRefund } from '@climb/core';
import { addDays, monthOf, type DateKey } from '@climb/utils';

/** 看板「新客从哪来」用到的会员字段（对应 members 表） */
export interface MockMember {
  id: string;
  name: string;
  source: MemberSource;
  /** 归属门店（按办卡门店，等馆方） */
  homeStoreId: string;
  firstVisitOn: DateKey;
  firstVisitStoreId: string;
  /** 第一次买期限卡或次卡的日期，没买过为 null */
  firstCardOn: DateKey | null;
}

/** 老带新邀请（对应 shares 表 kind = referral） */
export interface MockReferral {
  id: string;
  fromMemberId: string;
  createdOn: DateKey;
  claimedByMemberId: string | null;
  /** 领取人用体验券入场的日期 */
  usedOn: DateKey | null;
}

/** 订单（对应 orders 表，商品名和品类是下单时的快照） */
export interface MockOrder extends RevenueOrder {
  memberId: string;
  productName: string;
}

/** 退款（对应 refunds 表） */
export interface MockRefund extends RevenueRefund {
  reason: string;
}

/** mock 后端的内存数据。每次 createMockDb() 都是一份新的，测试之间互不影响。 */
export interface MockDb {
  stores: Store[];
  staff: (Staff & { password: string; active: boolean })[];
  /** 每家店的看板数字（示例），全部门店 = 各店相加 */
  storeStats: Record<string, { monthRevenueCents: number; todayEntries: number; lastWeekSameTimeEntries: number; todayBookings: number; activeMembers: number }>;
  members: MockMember[];
  referrals: MockReferral[];
  /** 会员的卡（目前只放了期限卡，给「7 天内到期」用） */
  cards: PeriodCard[];
  /** 订单和退款（财务页用；看板的营收目前还是 storeStats 里的示例数字） */
  orders: MockOrder[];
  refunds: MockRefund[];
  /** 岩馆规则，mock 判断规则时传给 @climb/core */
  rules: GymRules;
  today: DateKey;
}

export function createMockDb(today: DateKey, rules: GymRules = defaultRules): MockDb {
  return {
    today,
    rules,
    stores: [
      { id: 'bingang', name: '滨港店' },
      { id: 'huiju', name: '汇聚店' },
      { id: 'huanqiu', name: '环球港店' },
    ],
    // 示例账号，密码都是 123456
    staff: [
      { id: 's-owner', name: '馆长', phone: '13800000001', role: 'owner', storeIds: [], password: '123456', active: true },
      { id: 's-manager', name: '店长阿凯', phone: '13800000002', role: 'manager', storeIds: ['bingang'], password: '123456', active: true },
      { id: 's-desk', name: '前台小葵', phone: '13800000003', role: 'desk', storeIds: ['bingang'], password: '123456', active: true },
    ],
    ...sampleMembers(today),
    ...sampleOrders(today),
    storeStats: {
      bingang: { monthRevenueCents: 6_194_200, todayEntries: 45, lastWeekSameTimeEntries: 41, todayBookings: 9, activeMembers: 138 },
      huiju: { monthRevenueCents: 4_504_900, todayEntries: 33, lastWeekSameTimeEntries: 35, todayBookings: 7, activeMembers: 101 },
      huanqiu: { monthRevenueCents: 3_378_700, todayEntries: 25, lastWeekSameTimeEntries: 22, todayBookings: 5, activeMembers: 73 },
    },
  };
}

/**
 * 示例会员和老带新邀请：老会员（上个月以前来的）发邀请，本月的新客按来源、门店铺开。
 * 用固定的伪随机数，同一个 today 每次生成的都一样。
 */
function sampleMembers(today: DateKey): Pick<MockDb, 'members' | 'referrals' | 'cards'> {
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const storeIds = ['bingang', 'huiju', 'huanqiu'];
  const monthStart = `${monthOf(today)}-01`;
  const daysSoFar = Number(today.slice(8, 10));
  const members: MockMember[] = [];
  const referrals: MockReferral[] = [];
  const cards: PeriodCard[] = [];
  let named = 0;
  const nextName = () => `${SURNAMES[named % SURNAMES.length]}${GIVEN[Math.floor(named++ / SURNAMES.length) % GIVEN.length]}`;

  // 老会员：本月以前第一次来，都办过卡，用来发邀请
  for (let i = 0; i < 30; i++) {
    const store = storeIds[i % 3];
    const first = addDays(monthStart, -30 - rand(300));
    members.push({ id: `m-old-${i}`, name: nextName(), source: 'walkin', homeStoreId: store, firstVisitOn: first, firstVisitStoreId: store, firstCardOn: first });
    // 期限卡：前 12 位在今天前后几天到期（有的今天、有的超过 7 天、有的昨天过期），其余的还早；第 3 位已经续了一张
    const [name, days] = PERIODS[i % PERIODS.length];
    const expiresOn = i < 12 ? addDays(today, i - 2) : addDays(today, 20 + i * 9);
    cards.push({ id: `c-old-${i}`, kind: 'period', memberId: `m-old-${i}`, productId: `p-${days}`, name, startsOn: addDays(expiresOn, 1 - days), expiresOn });
    if (i === 3) cards.push({ id: `c-old-${i}-renew`, kind: 'period', memberId: `m-old-${i}`, productId: `p-${days}`, name, startsOn: addDays(expiresOn, 1), expiresOn: addDays(expiresOn, days) });
  }

  // 本月新客：每种来源的人数和办卡比例大致照原型
  const plan: Record<MemberSource, { n: number; buyOneIn: number }> = {
    walkin: { n: 44, buyOneIn: 4 },
    referral: { n: 0, buyOneIn: 3 }, // 老带新的新客由下面的邀请生成
    gift: { n: 24, buyOneIn: 3 },
    platform: { n: 47, buyOneIn: 5 },
    legacy_import: { n: 3, buyOneIn: 1 },
  };
  for (const source of MEMBER_SOURCES) {
    for (let i = 0; i < plan[source].n; i++) {
      const visit = addDays(monthStart, rand(daysSoFar));
      const store = storeIds[rand(3)];
      const bought = rand(plan[source].buyOneIn) === 0;
      members.push({ id: `m-${source}-${i}`, name: nextName(), source, homeStoreId: store, firstVisitOn: visit, firstVisitStoreId: store, firstCardOn: bought ? visit : null });
    }
  }

  // 老带新：上个月发的几个（不算进本月漏斗）和本月发的；领了、用了的领取人是本月新客
  for (let i = 0; i < 60; i++) {
    const lastMonth = i < 8;
    const from = `m-old-${rand(30)}`;
    const createdOn = lastMonth ? addDays(monthStart, -1 - rand(10)) : addDays(monthStart, rand(daysSoFar));
    const claimed = rand(6) !== 0;
    const used = claimed && rand(10) < 7;
    let claimedByMemberId: string | null = null;
    let usedOn: DateKey | null = null;
    if (claimed) {
      claimedByMemberId = `m-ref-${i}`;
      usedOn = used ? createdOn : null; // 体验券当月有效，这里简化成发出当天就用
      // 没用券就没到店，还算不上新客，不建 first_visit；这里简化成用了券才有会员档案
      if (usedOn) {
        const store = members.find(m => m.id === from)!.homeStoreId;
        members.push({ id: claimedByMemberId, name: nextName(), source: 'referral', homeStoreId: store, firstVisitOn: usedOn, firstVisitStoreId: store, firstCardOn: rand(3) === 0 ? usedOn : null });
      }
    }
    referrals.push({ id: `r-${i}`, fromMemberId: from, createdOn, claimedByMemberId, usedOn });
  }
  return { members, referrals, cards };
}

/** 示例订单：三家店最近 70 天，每天几笔，渠道和品类照原型的比例大致铺开；再放几笔退款 */
function sampleOrders(today: DateKey): Pick<MockDb, 'orders' | 'refunds'> {
  let seed = 11;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const storeIds = ['bingang', 'huiju', 'huanqiu'];
  const items: [string, RevenueCategory, number][] = [
    ['月卡', 'period', 59_900], ['季卡', 'period', 159_900], ['年卡', 'period', 499_900],
    ['10 次卡', 'count', 128_000], ['20 次卡', 'count', 229_900],
    ['单次票', 'single', 9_900], ['私教 5 节', 'pt', 199_900], ['私教单节', 'pt', 41_000],
    ['团课 10 次', 'class', 98_000], ['团课单节', 'class', 12_800], ['夜攀活动', 'event', 12_000],
  ];
  const orders: MockOrder[] = [];
  let n = 0;
  for (let d = -70; d <= 0; d++) {
    const on = addDays(today, d);
    for (const storeId of storeIds) {
      for (let k = rand(5); k > 0; k--) {
        const [productName, category, amountCents] = items[rand(items.length)];
        // 美团只卖单次票；线下单在前台收；其余走微信
        const r = rand(100);
        const channel = category === 'single' && r < 60 ? 'meituan' : r < 78 ? 'wechat' : r < 88 ? 'desk_pos' : r < 95 ? 'desk_cash' : 'desk_transfer';
        orders.push({ id: `o-${++n}`, storeId, memberId: `m-old-${rand(30)}`, productName, channel, category, amountCents, paidOn: on });
      }
    }
  }
  // 一笔没付款的、一笔青橙导入的，都不算营收
  orders.push({ id: 'o-pending', storeId: 'bingang', memberId: 'm-old-0', productName: '月卡', channel: 'wechat', category: 'period', amountCents: 59_900, paidOn: null });
  orders.push({ id: 'o-legacy', storeId: 'bingang', memberId: 'm-old-1', productName: '20 次卡', channel: 'legacy', category: 'count', amountCents: 229_900, paidOn: addDays(today, -3) });

  const refunds: MockRefund[] = [];
  const refundable = orders.filter(o => o.paidOn && o.channel !== 'legacy' && o.category !== 'single');
  for (let i = 0; i < 8; i++) {
    const o = refundable[Math.floor((refundable.length * (i + 0.5)) / 8)]; // 每笔退不同的订单
    const after = addDays(o.paidOn!, 1 + rand(10));
    refunds.push({
      id: `rf-${i + 1}`,
      orderId: o.id,
      // 一半全退，一半退一部分（用过一部分的次卡，金额手填）
      amountCents: i % 2 ? o.amountCents : Math.round(o.amountCents / 2),
      refundedOn: i === 7 ? null : after > today ? today : after, // 最后一笔还在处理中
      reason: i % 2 ? '买错了，没用过' : '搬家了，退剩下的次数',
    });
  }
  return { orders, refunds };
}

const SURNAMES = ['林', '陈', '王', '赵', '周', '吴', '郑', '孙', '李', '何', '许', '高', '宋', '唐', '韩', '曹', '彭', '苏'];
const GIVEN = ['小满', '一鸣', '朵朵', '子轩', '舟', '越', '好', '婷', '想', '夕', '多', '远'];
const PERIODS: [string, number][] = [['月卡', 30], ['季卡', 90], ['年卡', 365]];
