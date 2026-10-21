import { MEMBER_SOURCES, type MemberSource, type Staff, type Store } from '@climb/api';
import { addDays, monthOf, type DateKey } from '@climb/utils';

/** 看板「新客从哪来」用到的会员字段（对应 members 表） */
export interface MockMember {
  id: string;
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

/** mock 后端的内存数据。每次 createMockDb() 都是一份新的，测试之间互不影响。 */
export interface MockDb {
  stores: Store[];
  staff: (Staff & { password: string; active: boolean })[];
  /** 每家店的看板数字（示例），全部门店 = 各店相加 */
  storeStats: Record<string, { monthRevenueCents: number; todayEntries: number; lastWeekSameTimeEntries: number; todayBookings: number; activeMembers: number }>;
  members: MockMember[];
  referrals: MockReferral[];
  today: DateKey;
}

export function createMockDb(today: DateKey): MockDb {
  return {
    today,
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
function sampleMembers(today: DateKey): Pick<MockDb, 'members' | 'referrals'> {
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

  // 老会员：本月以前第一次来，都办过卡，用来发邀请
  for (let i = 0; i < 30; i++) {
    const store = storeIds[i % 3];
    const first = addDays(monthStart, -30 - rand(300));
    members.push({ id: `m-old-${i}`, source: 'walkin', homeStoreId: store, firstVisitOn: first, firstVisitStoreId: store, firstCardOn: first });
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
      members.push({ id: `m-${source}-${i}`, source, homeStoreId: store, firstVisitOn: visit, firstVisitStoreId: store, firstCardOn: bought ? visit : null });
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
        members.push({ id: claimedByMemberId, source: 'referral', homeStoreId: store, firstVisitOn: usedOn, firstVisitStoreId: store, firstCardOn: rand(3) === 0 ? usedOn : null });
      }
    }
    referrals.push({ id: `r-${i}`, fromMemberId: from, createdOn, claimedByMemberId, usedOn });
  }
  return { members, referrals };
}
