import { MEMBER_SOURCES, type DeskCheckInResult, type DeskOrderResult, type RefundResult, type EntryMethod, type VoidCheckInResult, type MemberSource, type Staff, type Store } from '@climb/api';
import { REFUND_METHOD_BY_CHANNEL, type AuditLogEntry, type ClassBooking, type ClassSession, type ClassType, defaultRules, insuranceForEntry, newPolicy, type Card, type RefundMethod, type RefundStatus, type InsurancePolicy, type CountCard, type GiftCard, type Share, type GymRules, type LedgerEntry, type Product, type RevenueCategory, type RevenueOrder, type RevenueRefund } from '@climb/core';
import { addDays, addMonths, daysBetween, endOfMonth, fromDateKey, monthOf, type DateKey } from '@climb/utils';

/** 会员（对应 members 表），目前放了看板「新客从哪来」和会员列表用到的字段 */
export interface MockMember {
  id: string;
  name: string;
  phone: string;
  source: MemberSource;
  /** 归属门店（按办卡门店，等馆方） */
  homeStoreId: string;
  /** 第一次到店；后台建档后还没来过的为 null */
  firstVisitOn: DateKey | null;
  firstVisitStoreId: string | null;
  /** 第一次买期限卡或次卡的日期，没买过为 null */
  firstCardOn: DateKey | null;
  /** 最近一次入场（撤销的不算），跟 checkIns 里最晚的一条一致：示例数据生成时对齐，前台登记入场、撤销入场时更新 */
  lastEntryOn: DateKey | null;
  /** 签风险告知书的日期（第一次入场时签），没签为 null */
  waiverSignedOn: DateKey | null;
}

/** 入场记录（对应 check_ins 表） */
export interface MockCheckIn {
  id: string;
  memberId: string;
  storeId: string;
  on: DateKey;
  /** 没卡（单次票、美团券直接入场）为 null */
  cardId: string | null;
  cardName: string;
  deducted: number;
  method: EntryMethod;
  voided: boolean;
  /** 这次入场的保单（当天第一次入场投的，或同日再次入场沿用的），对应 check_ins.policy_id；没有保单记录的为 null */
  policyId: string | null;
  /** 撤销的才有（对应 voided_at、voided_by_staff_id、void_reason） */
  void: { at: string; staffId: string; reason: string } | null;
}

/** 老带新邀请（对应 shares 表 kind = referral） */
export interface MockReferral {
  id: string;
  fromMemberId: string;
  createdOn: DateKey;
  /** 体验券当月底前有效（同小程序 createReferral） */
  expiresOn: DateKey;
  claimedByMemberId: string | null;
  /** 领取人用体验券入场的日期 */
  usedOn: DateKey | null;
}

/** 订单（对应 orders 表，商品名和品类是下单时的快照） */
export interface MockOrder extends RevenueOrder {
  memberId: string;
  productName: string;
  /** 前台开的单才有：卡种、下单时的标价、改价原因、开单员工、发的卡（示例订单没有） */
  productId?: string;
  listPriceCents?: number;
  priceReason?: string;
  createdByStaffId?: string;
  cardId?: string;
}

/** 退款（对应 refunds 表）。示例退款没有发起时间和操作人 */
export interface MockRefund extends RevenueRefund {
  reason: string;
  method: RefundMethod;
  status: RefundStatus;
  at?: string;
  staffId?: string;
}

/** 员工账号（对应 staff 表）。密码只存哈希（mockPasswordHash）；tokenVersion 在停用、重置密码时加 1，旧 token 立即失效 */
export interface MockStaff extends Staff {
  passwordHash: string;
  active: boolean;
  tokenVersion: number;
  createdAt: string;
}

/** 操作日志（对应 audit_logs 表），字段和写法见 @climb/core 的 audit.ts；只追加 */
export type MockAuditLog = AuditLogEntry;

/**
 * mock 里的密码哈希：加盐（员工 ID）的 FNV-1a，只是为了内存里不放明文，不安全，不能拿到正式环境；
 * 后端用 bcrypt / argon2。
 */
export function mockPasswordHash(staffId: string, password: string): string {
  let h = 0x811c9dc5;
  for (const ch of `${staffId}:${password}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a:${h.toString(16).padStart(8, '0')}`;
}

/** 示例数据生成时的会员：都到过店 */
type SeedMember = Omit<MockMember, 'phone' | 'lastEntryOn' | 'waiverSignedOn'> & { firstVisitOn: DateKey; firstVisitStoreId: string };

/** mock 后端的内存数据。每次 createMockDb() 都是一份新的，测试之间互不影响。 */
export interface MockDb {
  stores: Store[];
  staff: MockStaff[];
  auditLogs: MockAuditLog[];
  /** 团课课程种类（对应 class_types 表）；有一个停用的 */
  classTypes: ClassType[];
  /** 团课课表（对应 class_sessions 表），小程序 GET /classes 读同一份；示例：上周和这周两家店的课 */
  classSessions: ClassSession[];
  /** 团课预约（对应 class_bookings 表），小程序约课写这里；示例数据没有 */
  classBookings: ClassBooking[];
  /** mock 的「现在」几点（HH:mm:ss），测试里固定；不填用本机时间。日期用 today */
  clock?: string;
  /** 每家店的看板数字（示例），全部门店 = 各店相加 */
  storeStats: Record<string, { monthRevenueCents: number; todayEntries: number; lastWeekSameTimeEntries: number; todayBookings: number; activeMembers: number }>;
  members: MockMember[];
  referrals: MockReferral[];
  /** 次卡转赠（对应 shares 表 kind = count）；领了的在 cards 里有一张好友送的次卡（shareId 指回来） */
  shares: Share[];
  /** 会员的卡：老会员的期限卡（给「7 天内到期」用）和本月新客办的次卡 */
  cards: Card[];
  /** 卡种（对应 products 表），示例卡和示例订单的价格照这里 */
  products: Product[];
  /** 前台开单的幂等记录：requestId → 第一次的结果 */
  deskOrderRequests: Record<string, DeskOrderResult>;
  /** 前台登记入场的幂等记录：requestId → 第一次的结果 */
  deskCheckInRequests: Record<string, DeskCheckInResult>;
  /** 退款的幂等记录：requestId → 第一次的结果 */
  refundRequests: Record<string, RefundResult>;
  /** 撤销入场的结果：入场 ID → 第一次撤销的结果，重复撤销原样返回 */
  checkInVoids: Record<string, VoidCheckInResult>;
  /** 订单和退款（财务页用；看板的营收目前还是 storeStats 里的示例数字） */
  orders: MockOrder[];
  refunds: MockRefund[];
  /** 入场记录：每个到过店的会员最近几次；次卡扣的次数记在 ledger 里，跟卡上的剩余对得上 */
  checkIns: MockCheckIn[];
  /** 入场保单（对应 insurance_policies），一人一天一张；示例入场记录按 @climb/core 的 insuranceForEntry 配好（以前的已投保，撤销的那条已退保） */
  policies: InsurancePolicy[];
  /** 卡流水（对应 card_ledger），按写入顺序；改卡的地方都要在这里追加一笔 */
  ledger: LedgerEntry[];
  /** 当前的告知书版本（对应 waiver_versions 里最新的一版） */
  waiverVersion: string;
  /** 岩馆规则，mock 判断规则时传给 @climb/core */
  rules: GymRules;
  today: DateKey;
}

export function createMockDb(today: DateKey, rules: GymRules = defaultRules): MockDb {
  // 示例账号，密码都是 123456
  const account = (s: Staff): MockStaff => ({ ...s, passwordHash: mockPasswordHash(s.id, '123456'), active: true, tokenVersion: 0, createdAt: '2026-01-05T10:00:00+08:00' });
  const staff: MockDb['staff'] = [
    account({ id: 's-owner', name: '馆长', phone: '13800000001', role: 'owner', storeIds: [] }),
    account({ id: 's-manager', name: '店长阿凯', phone: '13800000002', role: 'manager', storeIds: ['bingang'] }),
    account({ id: 's-desk', name: '前台小葵', phone: '13800000003', role: 'desk', storeIds: ['bingang'] }),
  ];
  return {
    today,
    rules,
    stores: [
      { id: 'bingang', name: '滨港店' },
      { id: 'huiju', name: '汇聚店' },
      { id: 'huanqiu', name: '环球港店' },
    ],
    staff,
    auditLogs: [],
    classTypes: [
      { id: 'ct-intro', name: '入门抱石', minutes: 60, capacity: 12, credits: 1, active: true },
      { id: 'ct-rope', name: '顶绳进阶', minutes: 90, capacity: 8, credits: 2, coachId: 's-manager', active: true },
      { id: 'ct-kids', name: '亲子攀岩', minutes: 60, capacity: 10, credits: 1, active: false },
    ],
    classSessions: sampleClassSessions(today),
    classBookings: [],
    ...withShares(withLedger(withCheckIns(sampleMembers(today), staff, today), staff, today), today),
    ...sampleOrders(today),
    products: sampleProducts(),
    deskOrderRequests: {},
    deskCheckInRequests: {},
    checkInVoids: {},
    refundRequests: {},
    waiverVersion: '2026-01',
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
  const members: SeedMember[] = [];
  const referrals: MockReferral[] = [];
  const cards: Card[] = [];
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
    referrals.push({ id: `r-${i}`, fromMemberId: from, createdOn, expiresOn: endOfMonth(createdOn), claimedByMemberId, usedOn });
  }
  return { members: withContact(members, today), referrals, cards: [...cards, ...newcomerCountCards(members)] };
}

/**
 * 会员列表要的手机号和最近入场，单独用一个伪随机数生成，不影响上面看板示例数字。
 * 手机号前 4 位后面接序号，保证不重复；青橙导入的有一半还没来过。
 */
function withContact(members: SeedMember[], today: DateKey): MockMember[] {
  let seed = 23;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  return members.map((m, i) => {
    const phone = `1${[39, 58, 86, 37][i % 4]}${String(i).padStart(4, '0')}${String(rand(10000)).padStart(4, '0')}`;
    const never = m.source === 'legacy_import' && i % 2 === 0;
    const lastEntryOn = never ? null : addDays(m.firstVisitOn, rand(daysBetween(m.firstVisitOn, today) + 1));
    return { ...m, phone, lastEntryOn, waiverSignedOn: never ? null : m.firstVisitOn };
  });
}

/** 本月办了卡的新客每人一张 10 次卡，用掉几次；有一张已经用完、一张冻结了（都不算有效卡） */
function newcomerCountCards(members: SeedMember[]): CountCard[] {
  const bought = members.filter(m => !m.id.startsWith('m-old-') && m.firstCardOn);
  return bought.map((m, i): CountCard => ({
    id: `c-${m.id}`,
    kind: 'count',
    memberId: m.id,
    productId: 'p-10x',
    name: '10 次卡',
    total: 10,
    remaining: i === 0 ? 0 : 10 - (i % 4),
    expiresOn: addMonths(m.firstCardOn!, 6),
    ...(i === 1 ? { status: 'frozen' as const } : {}),
  }));
}

/**
 * 示例入场记录：每个到过店的会员在第一次到店到最近入场之间有 1–5 次，最晚的一次就是 lastEntryOn。
 * 用当天能用的卡（期限卡优先，其次次卡），没有就记单次票（美团来的记美团券）；
 * 大约十分之一是前台登记，有一条撤销了的（撤销的那条不是最晚的那次，lastEntryOn 不受影响）。
 */
function withCheckIns<T extends Pick<MockDb, 'members' | 'cards'>>(data: T, staff: MockDb['staff'], today: DateKey): T & Pick<MockDb, 'checkIns' | 'policies'> {
  let seed = 31;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const checkIns: MockCheckIn[] = [];
  let n = 0;
  for (const m of data.members) {
    if (!m.lastEntryOn || !m.firstVisitOn) continue;
    const span = daysBetween(m.firstVisitOn, m.lastEntryOn);
    const days = new Set([m.lastEntryOn, m.firstVisitOn]);
    for (let k = rand(4); k > 0; k--) days.add(addDays(m.firstVisitOn, rand(span + 1)));
    const sorted = [...days].filter(d => d <= today).sort();
    for (const on of sorted) {
      const mine = data.cards.filter(c => c.memberId === m.id);
      const period = mine.find(c => c.kind === 'period' && c.startsOn <= on && c.expiresOn >= on);
      const count = mine.find(c => c.kind === 'count' && (c.status ?? 'normal') === 'normal' && c.expiresOn >= on && m.firstCardOn !== null && m.firstCardOn <= on);
      const card = period ?? count;
      checkIns.push({
        id: `ci-${++n}`,
        memberId: m.id,
        storeId: m.homeStoreId,
        on,
        cardId: card?.id ?? null,
        cardName: card?.name ?? (m.source === 'platform' ? '美团单次票' : m.source === 'referral' && on === m.firstVisitOn ? '老带新体验券' : '单次票'),
        deducted: card?.kind === 'count' ? 1 : 0,
        method: rand(10) === 0 ? 'desk' : 'scan',
        voided: false,
        policyId: null,
        void: null,
      });
    }
  }
  // 撤销一条：找一个入场两次以上的老会员，撤销其中较早的一次
  const twice = checkIns.find((c, i) => c.memberId.startsWith('m-old-') && checkIns[i + 1]?.memberId === c.memberId);
  if (twice) {
    const desk = (staff.find(s => s.role === 'desk' && s.storeIds.includes(twice.storeId)) ?? staff.find(s => s.role === 'owner')!).id;
    twice.voided = true;
    twice.void = { at: `${twice.on}T22:00:00+08:00`, staffId: desk, reason: '扫错了卡' };
  }
  // 保单：一人一天一张，以前的都投保成功、今天的还在投保中；撤销的那条当天没有别的入场，保单已退保
  const policies: InsurancePolicy[] = [];
  for (const c of checkIns) {
    const ins = insuranceForEntry(policies, c.memberId, c.on);
    const policy = ins.policy ?? { ...newPolicy({ id: `ip-${policies.length + 1}`, memberId: c.memberId, storeId: c.storeId, on: c.on, checkInId: c.id }), status: c.on < today ? 'insured' as const : 'pending' as const };
    if (ins.needed) policies.push(policy);
    c.policyId = policy.id;
    if (c.voided) policy.status = 'refunded';
  }
  return { ...data, checkIns, policies };
}

/**
 * 示例卡流水，跟卡和入场记录对得上：每张卡先记一笔买卡（期限卡次数记 0）；次卡每次扣次的入场 -1，撤销的再 +1；
 * 示例里已用完的那张把剩下的送给了朋友，冻结的那张记一笔冻结。次卡的剩余以流水算出来的为准（覆盖 newcomerCountCards 里的示例数）。
 * 前台登记、撤销的操作人用这家店的前台，冻结用店长（没有就记馆长）。
 */
function withLedger<T extends Pick<MockDb, 'members' | 'cards' | 'checkIns'>>(data: T, staff: MockDb['staff'], today: DateKey): T & Pick<MockDb, 'ledger'> {
  let seed = 41;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const at = (on: DateKey, h: number) => `${on}T${pad(h)}:${pad(rand(60))}:00+08:00`;
  const staffOf = (role: 'desk' | 'manager', storeId: string) => (staff.find(s => s.role === role && s.storeIds.includes(storeId)) ?? staff.find(s => s.role === 'owner')!).id;
  const deskStaff = (storeId: string) => staffOf('desk', storeId);
  const members = new Map(data.members.map(m => [m.id, m]));
  const ledger: LedgerEntry[] = [];
  let n = 0;

  const cards = data.cards.map((card): Card => {
    const add = (e: Omit<LedgerEntry, 'id' | 'cardId' | 'expiresOnAfter' | 'ref' | 'note'> & Partial<Pick<LedgerEntry, 'ref' | 'note'>>) =>
      ledger.push({ id: `l-${++n}`, cardId: card.id, expiresOnAfter: card.expiresOn, ref: null, note: '', ...e });
    const m = members.get(card.memberId)!;
    if (card.kind === 'period') {
      const on = card.startsOn <= today ? card.startsOn : today;
      add({ at: at(on, 10), delta: 0, remainingAfter: null, reason: 'purchase', operatorType: 'member', operatorId: m.id });
      return card;
    }
    if (card.kind !== 'count') return card;
    let remaining = card.total;
    let lastOn = m.firstCardOn!;
    add({ at: at(lastOn, 10), delta: card.total, remainingAfter: remaining, reason: 'purchase', operatorType: 'member', operatorId: m.id });
    for (const ci of data.checkIns.filter(c => c.cardId === card.id && c.deducted > 0)) {
      const op = ci.method === 'desk' ? { operatorType: 'staff' as const, operatorId: deskStaff(ci.storeId) } : { operatorType: 'member' as const, operatorId: m.id };
      remaining -= ci.deducted;
      add({ at: at(ci.on, 12 + rand(10)), delta: -ci.deducted, remainingAfter: remaining, reason: 'check_in', ref: { type: 'check_in', id: ci.id }, ...op });
      if (ci.voided) {
        remaining += ci.deducted;
        const ref = { type: 'check_in' as const, id: ci.id };
        const v = ci.void!;
        add({ at: v.at, delta: ci.deducted, remainingAfter: remaining, reason: 'check_in_void', ref, operatorType: 'staff', operatorId: v.staffId, note: v.reason });
      }
      lastOn = ci.on;
    }
    if (card.remaining === 0 && remaining > 0) {
      add({ at: at(lastOn, 23), delta: -remaining, remainingAfter: 0, reason: 'share_out', operatorType: 'member', operatorId: m.id });
      remaining = 0;
    }
    if (card.status === 'frozen') {
      const on = addDays(today, -3) > lastOn ? addDays(today, -3) : lastOn;
      add({ at: at(on, 20), delta: 0, remainingAfter: remaining, reason: 'freeze', operatorType: 'staff', operatorId: staffOf('manager', m.homeStoreId), note: '手腕受伤，先停一段' });
    }
    return { ...card, remaining };
  });
  return { ...data, cards, ledger };
}

/**
 * 示例次卡转赠，跟卡、流水、入场记录对得上：
 * 1. 已用完的那张次卡最后送出去的那几次（withLedger 里的 share_out）补上分享记录，一位「好友送的」新客领了还没用；
 * 2. 另一张次卡送 2 次，领取人后来用它入场了一次（把他那天的单次票入场改成用这张卡）；
 * 3. 再一张今天送 2 次，还没人领。
 * 分享的有效期跟原卡一致；送出、领取、入场各记一笔流水。
 */
function withShares<T extends Pick<MockDb, 'members' | 'cards' | 'checkIns' | 'ledger'>>(data: T, today: DateKey): T & Pick<MockDb, 'shares'> {
  const { ledger, checkIns } = data;
  const cards = [...data.cards];
  const shares: Share[] = [];
  const add = (e: Omit<LedgerEntry, 'id' | 'note' | 'operatorType'> & { operatorId: string }) => ledger.push({ id: `l-${ledger.length + 1}`, note: '', operatorType: 'member', ...e });
  const dayOf = (at: string) => at.slice(0, 10);
  const lastOn = (cardId: string) => ledger.filter(e => e.cardId === cardId).reduce((max, e) => (dayOf(e.at) > max ? dayOf(e.at) : max), '');
  const gifts = data.members.filter(m => m.source === 'gift');
  const taken = new Set<string>();
  const countCards = () => cards.filter((c): c is CountCard => c.kind === 'count' && (c.status ?? 'normal') === 'normal' && c.remaining >= 3);

  const share = (card: CountCard, quantity: number, on: DateKey): Share => {
    const sh: Share = { id: `sh-${shares.length + 1}`, kind: 'count', fromMemberId: card.memberId, quantity, createdOn: on, expiresOn: card.expiresOn, status: 'pending' };
    shares.push(sh);
    return sh;
  };
  const sendOut = (card: CountCard, quantity: number, on: DateKey) => {
    const sh = share(card, quantity, on);
    const next = { ...card, remaining: card.remaining - quantity };
    cards[cards.findIndex(c => c.id === card.id)] = next;
    add({ cardId: card.id, at: `${on}T23:10:00+08:00`, delta: -quantity, remainingAfter: next.remaining, expiresOnAfter: card.expiresOn, reason: 'share_out', ref: { type: 'share', id: sh.id }, operatorId: card.memberId });
    return sh;
  };
  const claim = (sh: Share, memberId: string): GiftCard => {
    sh.status = 'claimed';
    sh.claimedBy = memberId;
    taken.add(memberId);
    const gift: GiftCard = { id: `c-gift-${sh.id}`, kind: 'gift', memberId, fromMemberId: sh.fromMemberId, shareId: sh.id, name: '好友送的次卡', total: sh.quantity!, remaining: sh.quantity!, expiresOn: sh.expiresOn };
    cards.push(gift);
    add({ cardId: gift.id, at: `${sh.createdOn}T23:30:00+08:00`, delta: gift.total, remainingAfter: gift.total, expiresOnAfter: gift.expiresOn, reason: 'claim', ref: { type: 'share', id: sh.id }, operatorId: memberId });
    return gift;
  };

  // 1. 已用完那张送出去的
  const out = ledger.find(e => e.reason === 'share_out' && !e.ref);
  const recipient1 = gifts[0];
  if (out && recipient1) {
    const card = cards.find(c => c.id === out.cardId) as CountCard;
    const sh = share(card, -out.delta, dayOf(out.at));
    out.ref = { type: 'share', id: sh.id };
    claim(sh, recipient1.id);
  }

  // 2. 送出后朋友用它来过：找一张次卡和一位好友送的新客，新客在送出那天以后有一次没用卡的入场
  outer: for (const card of countCards()) {
    const on = lastOn(card.id);
    for (const g of gifts.filter(x => !taken.has(x.id))) {
      const ci = checkIns.find(c => c.memberId === g.id && !c.voided && !c.cardId && c.on >= on && c.on <= card.expiresOn);
      if (!ci) continue;
      const gift = claim(sendOut(card, 2, on), g.id);
      gift.remaining -= 1;
      Object.assign(ci, { cardId: gift.id, cardName: gift.name, deducted: 1 });
      add({ cardId: gift.id, at: `${ci.on}T23:45:00+08:00`, delta: -1, remainingAfter: gift.remaining, expiresOnAfter: gift.expiresOn, reason: 'check_in', ref: { type: 'check_in', id: ci.id }, operatorId: g.id });
      break outer;
    }
  }

  // 3. 今天送出、还没人领
  const pendingCard = countCards().find(c => !shares.some(sh => sh.fromMemberId === c.memberId));
  if (pendingCard) sendOut(pendingCard, 2, today);

  return { ...data, cards, shares };
}

/**
 * 示例课表：上周和这周，滨港店每周二、四晚上入门抱石，周六上午顶绳进阶（店长阿凯带）；汇聚店周三晚上入门抱石；
 * 上周还有一节亲子攀岩（这个课程后来停用了，复制上周时会跳过）。
 */
function sampleClassSessions(today: DateKey): ClassSession[] {
  const day = fromDateKey(today).getDay();
  const monday = addDays(today, day === 0 ? -6 : 1 - day);
  const plan: [string, string, number, string, string, number, number, number, string?][] = [
    // 课程 ID、课名、星期（周一 = 0）、门店、开始、时长、人数、扣次、教练
    ['ct-intro', '入门抱石', 1, 'bingang', '19:30', 60, 12, 1],
    ['ct-intro', '入门抱石', 3, 'bingang', '19:30', 60, 12, 1],
    ['ct-rope', '顶绳进阶', 5, 'bingang', '10:00', 90, 8, 2, 's-manager'],
    ['ct-intro', '入门抱石', 2, 'huiju', '19:00', 60, 10, 1],
  ];
  const sessions: ClassSession[] = [];
  for (const week of [addDays(monday, -7), monday]) {
    for (const [classTypeId, name, dow, storeId, startTime, minutes, capacity, credits, coachId] of plan) {
      sessions.push({ id: `cs-${sessions.length + 1}`, classTypeId, name, storeId, on: addDays(week, dow), startTime, minutes, capacity, credits, ...(coachId ? { coachId } : {}), status: 'scheduled' });
    }
  }
  sessions.push({ id: `cs-${sessions.length + 1}`, classTypeId: 'ct-kids', name: '亲子攀岩', storeId: 'bingang', on: addDays(monday, -2), startTime: '15:00', minutes: 60, capacity: 10, credits: 1, status: 'scheduled' });
  return sessions;
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
    const processing = i === 7; // 最后一笔还在处理中（微信退款等回调）
    refunds.push({
      id: `rf-${i + 1}`,
      orderId: o.id,
      // 一半全退，一半退一部分（用过一部分的次卡，金额手填）
      amountCents: i % 2 ? o.amountCents : Math.round(o.amountCents / 2),
      refundedOn: processing ? null : after > today ? today : after,
      reason: i % 2 ? '买错了，没用过' : '搬家了，退剩下的次数',
      method: REFUND_METHOD_BY_CHANNEL[o.channel]!,
      status: processing ? 'processing' : 'succeeded',
    });
  }
  return { orders, refunds };
}

/** 示例卡种：ID 跟示例卡上的 productId 对得上，价格跟示例订单一致；有一个下架的；排序按这里的顺序 */
function sampleProducts(): Product[] {
  return [
    { id: 'p-30', category: 'period', name: '月卡', priceCents: 59_900, days: 30, perks: ['每月 1 次老带新'], onSale: true, sort: 1 },
    { id: 'p-90', category: 'period', name: '季卡', priceCents: 159_900, days: 90, perks: ['每月 1 次老带新'], onSale: true, sort: 2 },
    { id: 'p-365', category: 'period', name: '年卡', priceCents: 499_900, days: 365, perks: ['每月 1 次老带新'], onSale: true, sort: 3 },
    { id: 'p-10x', category: 'count', name: '10 次卡', priceCents: 128_000, quantity: 10, validMonths: 6, perks: ['可以分次送给朋友'], onSale: true, sort: 4 },
    { id: 'p-20x', category: 'count', name: '20 次卡', priceCents: 229_900, quantity: 20, validMonths: 12, perks: ['可以分次送给朋友'], onSale: true, sort: 5 },
    { id: 'p-pt5', category: 'pt', name: '私教 5 节', priceCents: 199_900, quantity: 5, validMonths: 3, perks: ['可约任意教练'], onSale: true, sort: 6 },
    { id: 'p-class10', category: 'class', name: '团课 10 次', priceCents: 98_000, quantity: 10, validMonths: 4, perks: ['满员时优先候补'], onSale: true, sort: 7 },
    { id: 'p-summer', category: 'count', name: '暑期 5 次卡', priceCents: 49_900, quantity: 5, validMonths: 2, perks: [], onSale: false, sort: 8 },
  ];
}

const SURNAMES = ['林', '陈', '王', '赵', '周', '吴', '郑', '孙', '李', '何', '许', '高', '宋', '唐', '韩', '曹', '彭', '苏'];
const GIVEN = ['小满', '一鸣', '朵朵', '子轩', '舟', '越', '好', '婷', '想', '夕', '多', '远'];
const PERIODS: [string, number][] = [['月卡', 30], ['季卡', 90], ['年卡', 365]];
