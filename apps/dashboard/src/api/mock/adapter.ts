import {
  MEMBER_SOURCES,
  MEMBERS_PAGE_SIZE,
  MEMBER_RECENT_LIMIT,
  type ApiRequest,
  type ApiResponse,
  type CardAdjustBody,
  type CardChangeResult,
  type CardLedger,
  type CardLedgerRow,
  type CheckInList,
  type CheckInListRow,
  type CheckInPreview,
  type CreateDeskCheckInBody,
  type CreateDeskOrderBody,
  type CreateMemberBody,
  type CreateProductBody,
  type DashboardSummary,
  type DeskCheckInResult,
  type DeskFreezeBody,
  type DeskFreezeOptions,
  type DeskFreezeResult,
  type DeskUnfreezeBody,
  type DeskUnfreezeResult,
  type DeskOrderResult,
  type ExpiringCardRow,
  type FinanceRefundRow,
  type FinanceSummary,
  type LoginResult,
  type MemberDetail,
  type MemberEntryRow,
  type MemberExistsError,
  type MemberListRow,
  type MemberOrderRow,
  type NewcomerRow,
  type PageOf,
  type ReferralFunnel,
  type RefundBody,
  type RefundPreview,
  type RefundResult,
  type RefundRow,
  type RequestAdapter,
  type ShareList,
  type ShareRow,
  type Staff,
  type StoreCompareRow,
  type UpdateProductBody,
  type VoidCheckInBody,
  type VoidCheckInResult,
} from '@climb/api';
import {
  PRODUCT_REVENUE_CATEGORY,
  RuleError,
  applyProductPatch,
  buildProduct,
  changesPrice,
  newProductErrors,
  productBlockedBy,
  productPatchErrors,
  productsForSale,
  sortProducts,
  adjustCard,
  cardChangeLedgerEntry,
  deskFreezeCheck,
  deskFreezePeriodCard,
  freezeHistory,
  freezeQuotaLeft,
  settleFreeze,
  unfreezePeriodCard,
  checkInLedgerEntry,
  checkInPlan,
  checkInWith,
  checkInVoidLedgerEntry,
  voidCheckIn,
  insuranceForEntry,
  entryPolicy,
  shareRecordState,
  type ClaimedCard,
  newPolicy,
  countsAsCardPurchase,
  deskOrderErrors,
  expiringPeriodCards,
  freezeRulesErrors,
  pickFreezeRules,
  financeRangeError,
  findMemberByPhone,
  isCardValid,
  issueCard,
  newMemberErrors,
  normalizePhone,
  purchaseLedgerEntry,
  summarizeRevenue,
  orderStatus,
  pastFrozenDays,
  planRefund,
  refundBlockedBy,
  refundLedgerEntry,
  refundableCents,
  suggestedRefund,
  REFUND_METHOD_BY_CHANNEL,
  type Card,
  type CheckInArgs,
  type EntryCard,
  type MemberSource,
  type PeriodCard,
  type RevenueChannel,
} from '@climb/core';
import { addDays, formatYuan, isDateKey, maskPhone, monthOf } from '@climb/utils';
import { MEMBERS_VISIBLE_ACROSS_STORES, canDo, canSeePage, canSeeStore } from '../../permissions';
import type { MockCheckIn, MockDb, MockMember, MockOrder } from './db';

/**
 * 后端没好之前用的假后端：实现 @climb/api 里后台接口的契约，数据放在内存里。
 * 新加接口时在 routes 里加一条，并在 adapter.test.ts 里加单测。
 */

interface Ctx {
  db: MockDb;
  body: any;
  query: URLSearchParams;
  params: string[];
  /** 登录的员工；公开接口为空 */
  staff: Staff | null;
}

type Handler = (ctx: Ctx) => ApiResponse;

const ok = (data: unknown): ApiResponse => ({ status: 200, data });
const fail = (status: number, code: string, message: string): ApiResponse => ({ status, data: { code, message } });

const TOKEN_PREFIX = 'mock-';

function toStaff({ password: _p, active: _a, ...s }: MockDb['staff'][number]): Staff {
  return s;
}

/** 本月 1 日到今天第一次到店的新客，按来源；口径见 @climb/api 的 NewcomerRow */
function newcomerRows(db: MockDb, storeIds: string[]): NewcomerRow[] {
  const month = monthOf(db.today);
  const hasCard = (on: string | null) => on !== null && on <= db.today;
  const fresh = db.members.filter(
    m => m.firstVisitOn && monthOf(m.firstVisitOn) === month && m.firstVisitOn <= db.today && storeIds.includes(m.firstVisitStoreId ?? ''),
  );
  return MEMBER_SOURCES.map(source => {
    const ms = fresh.filter(m => m.source === source);
    return { source, visitors: ms.length, bought: ms.filter(m => hasCard(m.firstCardOn)).length };
  });
}

/** 本月发出的老带新邀请的漏斗，按邀请人的归属门店；口径见 @climb/api 的 ReferralFunnel */
function referralFunnel(db: MockDb, storeIds: string[]): ReferralFunnel {
  const month = monthOf(db.today);
  const member = (id: string | null) => (id ? db.members.find(m => m.id === id) : undefined);
  const sent = db.referrals.filter(
    r => monthOf(r.createdOn) === month && r.createdOn <= db.today && storeIds.includes(member(r.fromMemberId)?.homeStoreId ?? ''),
  );
  const claimed = sent.filter(r => r.claimedByMemberId);
  const visited = claimed.filter(r => r.usedOn && r.usedOn <= db.today);
  const bought = visited.filter(r => {
    const on = member(r.claimedByMemberId)?.firstCardOn;
    return on != null && on <= db.today;
  });
  return { sent: sent.length, claimed: claimed.length, visited: visited.length, bought: bought.length };
}

/** 快到期的期限卡，按会员归属门店；哪些卡算「快到期」由 @climb/core 决定 */
function expiringRows(db: MockDb, storeIds: string[]): ExpiringCardRow[] {
  const byId = new Map(db.members.map(m => [m.id, m]));
  return expiringPeriodCards(db.cards, db.today, db.rules).flatMap(c => {
    const m = byId.get(c.memberId);
    if (!m || !storeIds.includes(m.homeStoreId)) return [];
    return [{ cardId: c.id, cardName: c.name, memberId: m.id, memberName: m.name, storeId: m.homeStoreId, expiresOn: c.expiresOn }];
  });
}

type StoreStat = keyof MockDb['storeStats'][string];
const sumStats = (db: MockDb, ids: string[], k: StoreStat) => ids.reduce((n, id) => n + (db.storeStats[id]?.[k] ?? 0), 0);

function storeCompare(db: MockDb): StoreCompareRow[] {
  return db.stores.map(st => {
    const nc = newcomerRows(db, [st.id]);
    return {
      storeId: st.id,
      monthRevenueCents: sumStats(db, [st.id], 'monthRevenueCents'),
      todayEntries: sumStats(db, [st.id], 'todayEntries'),
      activeMembers: sumStats(db, [st.id], 'activeMembers'),
      newcomers: nc.reduce((n, r) => n + r.visitors, 0),
      newcomersBought: nc.reduce((n, r) => n + r.bought, 0),
    };
  });
}

/** 门店参数：没有这家店 404；只能看部分门店的员工必须指定自己的店，否则 403。返回要算的门店 ID */
function storeScope(db: MockDb, staff: Staff, storeId: string | null): string[] | ApiResponse {
  if (storeId && !db.stores.some(st => st.id === storeId)) return fail(404, 'store-not-found', '没有这家店');
  if (storeId ? !canSeeStore(staff, storeId) : staff.storeIds.length > 0) return fail(403, 'forbidden', '没有这家店的权限');
  return storeId ? [storeId] : db.stores.map(st => st.id);
}

/** 会员列表：搜索、排序和分页的口径见 @climb/api 的 MemberListRow */
function memberList(db: MockDb, staff: Staff, q: string, page: number): PageOf<MemberListRow> {
  const visible = MEMBERS_VISIBLE_ACROSS_STORES ? db.members : db.members.filter(m => canSeeStore(staff, m.homeStoreId));
  const matched = !q ? visible : /^\d+$/.test(q) ? visible.filter(m => m.phone.includes(q)) : visible.filter(m => m.name.includes(q));
  const sorted = [...matched].sort(
    (a, b) =>
      (b.lastEntryOn ?? '').localeCompare(a.lastEntryOn ?? '') || (b.firstVisitOn ?? '').localeCompare(a.firstVisitOn ?? '') || a.id.localeCompare(b.id),
  );
  const pageSize = MEMBERS_PAGE_SIZE;
  const last = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(Math.max(1, page), last);
  const items = sorted.slice((cur - 1) * pageSize, cur * pageSize).map((m): MemberListRow => ({
    id: m.id,
    name: m.name,
    phoneMasked: maskPhone(m.phone),
    source: m.source,
    firstVisitOn: m.firstVisitOn,
    validCards: db.cards.filter(c => c.memberId === m.id && isCardValid(c, db.today)).length,
    lastEntryOn: m.lastEntryOn,
  }));
  return { items, total: sorted.length, page: cur, pageSize };
}

/** 会员详情：口径见 @climb/api 的 MemberDetail */
function memberDetail(db: MockDb, staff: Staff, id: string): ApiResponse {
  const m = db.members.find(x => x.id === id);
  if (!m) return fail(404, 'member-not-found', '没有这个会员');
  if (!MEMBERS_VISIBLE_ACROSS_STORES && !canSeeStore(staff, m.homeStoreId)) return fail(403, 'forbidden', '没有这家店的权限');
  const valid = (c: Card) => (isCardValid(c, db.today) ? 0 : 1);
  const cards = db.cards
    .filter(c => c.memberId === id)
    .sort((a, b) => valid(a) - valid(b) || b.expiresOn.localeCompare(a.expiresOn) || a.id.localeCompare(b.id));
  // 没付款的排最前（刚下的单），其余按付款日倒序，同一天后下的在前
  const recentOrders = db.orders
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => o.memberId === id)
    .sort((a, b) => (b.o.paidOn ?? '9999').localeCompare(a.o.paidOn ?? '9999') || b.i - a.i)
    .slice(0, MEMBER_RECENT_LIMIT)
    .map(({ o }) => orderRow(db, o));
  const recentEntries = db.checkIns
    .filter(c => c.memberId === id)
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id, undefined, { numeric: true }))
    .slice(0, MEMBER_RECENT_LIMIT)
    .map(c => entryRow(db, c));
  const res: MemberDetail = {
    id: m.id,
    name: m.name,
    phone: m.phone,
    source: m.source,
    homeStoreId: m.homeStoreId,
    firstVisitOn: m.firstVisitOn,
    firstVisitStoreId: m.firstVisitStoreId,
    waiver: m.waiverSignedOn ? { signedOn: m.waiverSignedOn, version: db.waiverVersion } : null,
    cards,
    recentOrders,
    recentEntries,
  };
  return ok(res);
}

/** 新建会员：校验、判重的口径见 @climb/api 的 CreateMemberBody */
function createMember(db: MockDb, staff: Staff, body: Partial<CreateMemberBody> | null): ApiResponse {
  if (!canDo(staff.role, 'member.create')) return fail(403, 'forbidden', '没有建档权限');
  const input = { phone: String(body?.phone ?? ''), name: String(body?.name ?? ''), source: String(body?.source ?? '') };
  const errs = newMemberErrors(input);
  if (errs) {
    const field = Object.keys(errs)[0] as keyof typeof errs;
    return { status: 400, data: { code: 'bad-input', field, message: errs[field] } };
  }
  const storeId = String(body?.storeId ?? '');
  if (!db.stores.some(st => st.id === storeId)) return fail(404, 'store-not-found', '没有这家店');
  if (!canSeeStore(staff, storeId)) return fail(403, 'forbidden', '没有这家店的权限');
  const phone = normalizePhone(input.phone);
  const dup = findMemberByPhone(db.members, phone);
  if (dup) {
    const data: MemberExistsError = { code: 'member-exists', message: `这个手机号已经有档案了：${dup.name || '没填名字'}`, memberId: dup.id, memberName: dup.name };
    return { status: 409, data };
  }
  let n = db.members.length + 1;
  while (db.members.some(m => m.id === `m-new-${n}`)) n++;
  const m: MockMember = {
    id: `m-new-${n}`,
    name: input.name.trim(),
    phone,
    source: input.source as MemberSource,
    homeStoreId: storeId,
    firstVisitOn: null,
    firstVisitStoreId: null,
    firstCardOn: null,
    lastEntryOn: null,
    waiverSignedOn: null,
  };
  db.members.push(m);
  return memberDetail(db, staff, m.id);
}

/** 会员详情、入场记录、登记和撤销结果里的入场行：撤销人换成员工名字，保单按 @climb/core 的 entryPolicy */
function entryRow(db: MockDb, { memberId: _m, void: v, policyId, ...c }: MockCheckIn): MemberEntryRow {
  const policy = entryPolicy(db.policies, { policyId });
  return {
    ...c,
    insurance: policy ? { policyId: policy.id, status: policy.status } : null,
    voidInfo: v ? { at: v.at, byName: db.staff.find(s => s.id === v.staffId)?.name ?? '', reason: v.reason } : null,
  };
}

/** 分享记录：口径见 @climb/api 的 ShareList，状态按 @climb/core 的 shareRecordState */
function shareList(db: MockDb, staff: Staff, storeId: string | null, kind: string | null): ApiResponse {
  if (kind !== null && kind !== 'count' && kind !== 'referral') return badInput('kind', '分享类型不对');
  const scope = storeScope(db, staff, storeId);
  if (!Array.isArray(scope)) return scope;
  const member = (id: string | null | undefined) => (id ? db.members.find(m => m.id === id) : undefined);
  const firstUse = (cardId: string) =>
    db.checkIns.filter(c => c.cardId === cardId && !c.voided).reduce<string | null>((min, c) => (!min || c.on < min ? c.on : min), null);
  const rows: (ShareRow & { order: number })[] = [];
  if (kind !== 'referral') {
    db.shares.forEach((sh, order) => {
      const gift = db.cards.find(c => c.kind === 'gift' && c.shareId === sh.id);
      const state = shareRecordState(sh, gift && gift.kind === 'gift' ? gift : null, db.today);
      rows.push({
        order, id: sh.id, kind: 'count', storeId: member(sh.fromMemberId)?.homeStoreId ?? '', fromMemberId: sh.fromMemberId, fromMemberName: member(sh.fromMemberId)?.name ?? '',
        claimerId: sh.claimedBy ?? null, claimerName: sh.claimedBy ? (member(sh.claimedBy)?.name ?? '') : null, quantity: sh.quantity ?? null,
        createdOn: sh.createdOn, expiresOn: sh.expiresOn, state, usedOn: state === 'used' && gift ? firstUse(gift.id) : null,
      });
    });
  }
  if (kind !== 'count') {
    db.referrals.forEach((r, order) => {
      // 示例数据里体验券没有建卡，用没用记在邀请上（usedOn，前台登记、撤销时跟着改）
      const voucher: ClaimedCard | null = r.claimedByMemberId ? { kind: 'referral', usedOn: r.usedOn ?? undefined } : null;
      const state = shareRecordState({ status: r.claimedByMemberId ? 'claimed' : 'pending', expiresOn: r.expiresOn }, voucher, db.today);
      rows.push({
        order, id: r.id, kind: 'referral', storeId: member(r.fromMemberId)?.homeStoreId ?? '', fromMemberId: r.fromMemberId, fromMemberName: member(r.fromMemberId)?.name ?? '',
        claimerId: r.claimedByMemberId, claimerName: r.claimedByMemberId ? (member(r.claimedByMemberId)?.name ?? '') : null, quantity: null,
        createdOn: r.createdOn, expiresOn: r.expiresOn, state, usedOn: state === 'used' ? r.usedOn : null,
      });
    });
  }
  const items = rows
    .filter(r => r.createdOn <= db.today && scope.includes(r.storeId))
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn) || b.order - a.order)
    .map(({ order: _o, ...r }) => r);
  const res: ShareList = { storeId, items };
  return ok(res);
}

/** 入场记录：口径见 @climb/api 的 CheckInList */
function checkInList(db: MockDb, staff: Staff, date: string | null, storeId: string | null): ApiResponse {
  const on = date ?? db.today;
  if (!isDateKey(on)) return badInput('date', '日期格式不对');
  const scope = storeScope(db, staff, storeId);
  if (!Array.isArray(scope)) return scope;
  const names = new Map(db.members.map(m => [m.id, m.name]));
  const items = db.checkIns
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.on === on && scope.includes(c.storeId))
    .sort((a, b) => b.i - a.i)
    .map(({ c }): CheckInListRow => ({ ...entryRow(db, c), memberId: c.memberId, memberName: names.get(c.memberId) ?? '' }));
  const res: CheckInList = { storeId, date: on, items };
  return ok(res);
}

/** 会员详情、开卡、退款结果里的订单行；已退和状态只算退成功的 */
function orderRow(db: MockDb, o: MockOrder): MemberOrderRow {
  const refunds = db.refunds.filter(r => r.orderId === o.id);
  const refundedCents = refunds.filter(r => r.status === 'succeeded').reduce((n, r) => n + r.amountCents, 0);
  return {
    id: o.id,
    storeId: o.storeId,
    productName: o.productName,
    category: o.category,
    channel: o.channel,
    amountCents: o.amountCents,
    paidOn: o.paidOn,
    refundedCents,
    status: orderStatus(o, refunds),
    cardId: o.cardId ?? null,
  };
}

/** 新记录的 ID：前缀 + 序号，跳过已经有的 */
function nextId(prefix: string, taken: { id: string }[]): string {
  const ids = new Set(taken.map(x => x.id));
  let n = taken.length + 1;
  while (ids.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** 现在的时间，日期用 mock 的 today（测试里固定），时分秒用本机时间 */
function nowAt(db: MockDb): string {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${db.today}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}+08:00`;
}

const badInput = (field: string, message: string): ApiResponse => ({ status: 400, data: { code: 'bad-input', field, message } });

/** 线下收款开卡：口径见 @climb/api 的 CreateDeskOrderBody，规则都在 @climb/core 的 order.ts */
function createDeskOrder(db: MockDb, staff: Staff, body: Partial<CreateDeskOrderBody> | null): ApiResponse {
  if (!canDo(staff.role, 'order.create')) return fail(403, 'forbidden', '没有开卡权限');
  const requestId = String(body?.requestId ?? '');
  if (!requestId) return badInput('requestId', '缺少 requestId');
  const done = db.deskOrderRequests[requestId];
  if (done) return ok(done);

  const m = db.members.find(x => x.id === body?.memberId);
  if (!m) return fail(404, 'member-not-found', '没有这个会员');
  if (!MEMBERS_VISIBLE_ACROSS_STORES && !canSeeStore(staff, m.homeStoreId)) return fail(403, 'forbidden', '没有这家店的权限');
  const product = db.products.find(p => p.id === body?.productId);
  if (!product) return fail(404, 'product-not-found', '没有这个卡种');
  const storeId = String(body?.storeId ?? '');
  if (!db.stores.some(st => st.id === storeId)) return fail(404, 'store-not-found', '没有这家店');
  if (!canSeeStore(staff, storeId)) return fail(403, 'forbidden', '没有这家店的权限');
  if (productBlockedBy(product)) return fail(422, 'product-off-sale', `${product.name}已经下架了`);

  const input = { channel: String(body?.channel ?? ''), amountCents: Number(body?.amountCents), priceReason: String(body?.priceReason ?? '') };
  const errs = deskOrderErrors(product, input);
  if (errs) {
    const field = Object.keys(errs)[0] as keyof typeof errs;
    return badInput(field, errs[field]!);
  }

  const reason = input.priceReason.trim();
  const repriced = input.amountCents !== product.priceCents;
  const order: MockOrder = {
    id: nextId('o-desk-', db.orders),
    storeId,
    memberId: m.id,
    productName: product.name,
    category: PRODUCT_REVENUE_CATEGORY[product.category],
    channel: input.channel as CreateDeskOrderBody['channel'],
    amountCents: input.amountCents,
    paidOn: db.today,
    productId: product.id,
    listPriceCents: product.priceCents,
    priceReason: repriced ? reason : '',
    createdByStaffId: staff.id,
  };
  const card = issueCard({ id: nextId('c-desk-', db.cards), product, memberId: m.id, cards: db.cards.filter(c => c.memberId === m.id), today: db.today });
  order.cardId = card.id;
  const note = repriced ? `标价 ${formatYuan(product.priceCents)}，实收 ${formatYuan(input.amountCents)}：${reason}` : '';
  const entry = purchaseLedgerEntry({ id: nextId('l-', db.ledger), card, at: nowAt(db), orderId: order.id, operator: { operatorType: 'staff', operatorId: staff.id }, note });

  db.orders.push(order);
  db.cards.push(card);
  db.ledger.push(entry);
  if (countsAsCardPurchase(product.category) && !m.firstCardOn) {
    m.firstCardOn = db.today;
    m.homeStoreId = storeId;
  }
  const res: DeskOrderResult = { order: orderRow(db, order), card };
  db.deskOrderRequests[requestId] = res;
  return ok(res);
}

/** 前台登记入场的会员、门店校验；通过返回 @climb/core 判断要的参数 */
function checkInScope(db: MockDb, staff: Staff, body: { memberId?: unknown; storeId?: unknown } | null): { m: MockMember; args: CheckInArgs } | ApiResponse {
  if (!canDo(staff.role, 'checkIn.create')) return fail(403, 'forbidden', '没有登记入场的权限');
  const m = db.members.find(x => x.id === body?.memberId);
  if (!m) return fail(404, 'member-not-found', '没有这个会员');
  if (!MEMBERS_VISIBLE_ACROSS_STORES && !canSeeStore(staff, m.homeStoreId)) return fail(403, 'forbidden', '没有这家店的权限');
  const storeId = String(body?.storeId ?? '');
  if (!db.stores.some(st => st.id === storeId)) return fail(404, 'store-not-found', '没有这家店');
  if (!canSeeStore(staff, storeId)) return fail(403, 'forbidden', '没有这家店的权限');
  const hasCheckedIn = (memberId: string, on: string) => db.checkIns.some(c => c.memberId === memberId && c.on === on && !c.voided);
  const args: CheckInArgs = {
    memberId: m.id,
    storeId,
    cards: db.cards.filter(c => c.memberId === m.id),
    past: db.checkIns.filter(c => c.memberId === m.id),
    ctx: { today: db.today, rules: db.rules, hasCheckedIn },
  };
  return { m, args };
}

/** 登记入场前列出能用的卡：口径见 @climb/api 的 CheckInPreview */
function checkInPreview(db: MockDb, staff: Staff, body: Partial<CreateDeskCheckInBody> | null): ApiResponse {
  const scope = checkInScope(db, staff, body);
  if ('status' in scope) return scope;
  const { m, args } = scope;
  const plan = checkInPlan(args);
  const ins = insuranceForEntry(db.policies, m.id, db.today);
  const res: CheckInPreview = {
    memberId: m.id,
    memberName: m.name,
    storeId: args.storeId,
    reentry: plan.reentry,
    waiverSigned: !!m.waiverSignedOn,
    insurance: { needed: ins.needed, policyId: ins.policy?.id ?? null, status: ins.policy?.status ?? null },
    options: plan.options,
  };
  return ok(res);
}

/** 前台登记入场：口径见 @climb/api 的 CreateDeskCheckInBody，规则都在 @climb/core 的 checkIn.ts */
function createDeskCheckIn(db: MockDb, staff: Staff, body: Partial<CreateDeskCheckInBody> | null): ApiResponse {
  if (!canDo(staff.role, 'checkIn.create')) return fail(403, 'forbidden', '没有登记入场的权限');
  const requestId = String(body?.requestId ?? '');
  if (!requestId) return badInput('requestId', '缺少 requestId');
  const done = db.deskCheckInRequests[requestId];
  if (done) return ok(done);

  const scope = checkInScope(db, staff, body);
  if ('status' in scope) return scope;
  const { m, args } = scope;
  const cardId = String(body?.cardId ?? '');
  const idx = db.cards.findIndex(c => c.id === cardId && c.memberId === m.id);
  if (idx < 0) return fail(404, 'card-not-found', '这个会员没有这张卡');

  let used: { card: EntryCard; deducted: number; reentry: boolean };
  try {
    used = checkInWith({ ...args, cardId, waiverSigned: !!m.waiverSignedOn });
  } catch (e) {
    if (e instanceof RuleError) return fail(422, e.code, e.message);
    throw e;
  }
  const { card, deducted, reentry } = used;
  const checkIn: MockCheckIn = {
    id: nextId('ci-', db.checkIns),
    memberId: m.id,
    storeId: args.storeId,
    on: db.today,
    cardId: card.id,
    cardName: card.name,
    deducted,
    method: 'desk',
    voided: false,
    policyId: null,
    void: null,
  };
  const ins = insuranceForEntry(db.policies, m.id, db.today);
  const policy = ins.policy ?? newPolicy({ id: nextId('ip-', db.policies), memberId: m.id, storeId: args.storeId, on: db.today, checkInId: checkIn.id });
  checkIn.policyId = policy.id;
  const entry = checkInLedgerEntry({ id: nextId('l-', db.ledger), card, deducted, at: nowAt(db), checkInId: checkIn.id, operator: { operatorType: 'staff', operatorId: staff.id } });

  db.checkIns.push(checkIn);
  db.cards[idx] = card;
  if (entry) db.ledger.push(entry);
  if (ins.needed) db.policies.push(policy);
  if (card.kind === 'referral') {
    const r = db.referrals.find(x => x.id === card.shareId);
    if (r && !r.usedOn) r.usedOn = card.usedOn ?? db.today;
  }
  if (!m.lastEntryOn || m.lastEntryOn < db.today) m.lastEntryOn = db.today;
  if (!m.firstVisitOn) {
    m.firstVisitOn = db.today;
    m.firstVisitStoreId = args.storeId;
  }
  const res: DeskCheckInResult = {
    checkIn: entryRow(db, checkIn),
    card,
    deducted,
    reentry,
    waiverSigned: !!m.waiverSignedOn,
    insurance: { needed: ins.needed, policyId: policy.id, status: policy.status },
  };
  db.deskCheckInRequests[requestId] = res;
  return ok(res);
}

/** 撤销入场：口径见 @climb/api 的 VoidCheckInBody，规则都在 @climb/core 的 voidCheckIn.ts */
function voidDeskCheckIn(db: MockDb, staff: Staff, id: string, body: Partial<VoidCheckInBody> | null): ApiResponse {
  if (!canDo(staff.role, 'checkIn.void')) return fail(403, 'forbidden', '没有撤销入场的权限');
  const checkIn = db.checkIns.find(c => c.id === id);
  if (!checkIn) return fail(404, 'check-in-not-found', '没有这条入场记录');
  if (!canSeeStore(staff, checkIn.storeId)) return fail(403, 'forbidden', '没有这家店的权限');
  if (checkIn.voided) {
    const done = db.checkInVoids[id];
    if (done) return ok(done);
    // 示例数据里本来就撤销了的：没有第一次的结果，按现在的样子返回
    const card = db.cards.find(c => c.id === checkIn.cardId) ?? null;
    const res: VoidCheckInResult = { checkIn: entryRow(db, checkIn), card, restored: checkIn.deducted, moved: null, voucherRestored: false, insurance: null };
    return ok(res);
  }

  const reason = String(body?.reason ?? '').trim();
  const cardIdx = db.cards.findIndex(c => c.id === checkIn.cardId);
  const mine = db.checkIns.filter(c => c.memberId === checkIn.memberId);
  let r: ReturnType<typeof voidCheckIn<Card, MockDb['policies'][number]>>;
  try {
    r = voidCheckIn({ checkIn, card: db.cards[cardIdx] ?? null, past: mine, cards: db.cards.filter(c => c.memberId === checkIn.memberId), policies: db.policies.filter(p => p.memberId === checkIn.memberId), reason });
  } catch (e) {
    if (e instanceof RuleError && e.code === 'reason-required') return badInput('reason', e.message);
    if (e instanceof RuleError) return fail(422, e.code, e.message);
    throw e;
  }

  const at = nowAt(db);
  checkIn.voided = true;
  checkIn.void = { at, staffId: staff.id, reason };
  const operator = { operatorType: 'staff' as const, operatorId: staff.id };
  const card = r.card;
  const moved = r.moved;
  if (card) {
    db.cards[cardIdx] = card;
    const movedTo = moved && !moved.card ? moved.checkIn.id : undefined;
    const entry = checkInVoidLedgerEntry({ id: nextId('l-', db.ledger), card, restored: r.restored, movedTo, at, checkInId: checkIn.id, operator, note: reason });
    if (entry) db.ledger.push(entry);
    if (r.voucherRestored && card.kind === 'referral') {
      const ref = db.referrals.find(x => x.id === card.shareId);
      if (ref && ref.usedOn === checkIn.on) ref.usedOn = null;
    }
  }
  let movedRow: MockCheckIn | undefined;
  if (moved) {
    movedRow = db.checkIns.find(c => c.id === moved.checkIn.id)!;
    movedRow.deducted = moved.checkIn.deducted;
    if (moved.card) {
      const i = db.cards.findIndex(c => c.id === moved.card!.id);
      db.cards[i] = moved.card;
      const note = `撤销同一天的入场 ${checkIn.id}，扣次转到这次`;
      const entry = checkInLedgerEntry({ id: nextId('l-', db.ledger), card: moved.card, deducted: moved.checkIn.deducted, at, checkInId: movedRow.id, operator, note });
      if (entry) db.ledger.push(entry);
    }
  }
  if (r.policy) {
    const i = db.policies.findIndex(p => p.id === r.policy!.id);
    db.policies[i] = r.policy;
  }
  const m = db.members.find(x => x.id === checkIn.memberId);
  if (m) m.lastEntryOn = mine.filter(c => !c.voided).reduce<string | null>((last, c) => (!last || c.on > last ? c.on : last), null);

  const res: VoidCheckInResult = {
    checkIn: entryRow(db, checkIn),
    card: r.card,
    restored: r.restored,
    moved: movedRow ? { checkIn: entryRow(db, movedRow), card: moved!.card } : null,
    voucherRestored: r.voucherRestored,
    insurance: r.policy ? { policyId: r.policy.id, status: r.policy.status, checkInId: r.policy.checkInId } : null,
  };
  db.checkInVoids[id] = res;
  return ok(res);
}

/** 卡流水：口径见 @climb/api 的 CardLedger */
function cardLedger(db: MockDb, staff: Staff, id: string): ApiResponse {
  const card = db.cards.find(c => c.id === id);
  if (!card) return fail(404, 'card-not-found', '没有这张卡');
  const m = db.members.find(x => x.id === card.memberId);
  if (!m) return fail(404, 'member-not-found', '没有这个会员');
  if (!MEMBERS_VISIBLE_ACROSS_STORES && !canSeeStore(staff, m.homeStoreId)) return fail(403, 'forbidden', '没有这家店的权限');
  const operatorName = (type: CardLedgerRow['operatorType'], opId: string | null) =>
    type === 'system' ? '系统' : type === 'staff' ? (db.staff.find(s => s.id === opId)?.name ?? '') : (db.members.find(x => x.id === opId)?.name ?? '');
  // 写入顺序就是同一时刻的先后
  const entries = db.ledger
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.cardId === id)
    .sort((a, b) => a.e.at.localeCompare(b.e.at) || a.i - b.i)
    .map(({ e }): CardLedgerRow => ({ ...e, operatorName: operatorName(e.operatorType, e.operatorId) }));
  const res: CardLedger = { card, memberName: m.name, entries };
  return ok(res);
}

type Operator = { operatorType: 'staff' | 'system'; operatorId: string | null };

/** 改卡后存回去并记流水；跟着挪了日期的期限卡各记一笔 adjust */
function saveCardChange(db: MockDb, card: Card, followers: PeriodCard[], entry: { reason: 'adjust' | 'freeze' | 'unfreeze'; delta?: number; note: string; followerNote: string }, operator: Operator, at = nowAt(db)) {
  db.cards[db.cards.findIndex(c => c.id === card.id)] = card;
  db.ledger.push(cardChangeLedgerEntry({ id: nextId('l-', db.ledger), card, reason: entry.reason, delta: entry.delta, at, operator, note: entry.note }));
  for (const f of followers) {
    db.cards[db.cards.findIndex(c => c.id === f.id)] = f;
    db.ledger.push(cardChangeLedgerEntry({ id: nextId('l-', db.ledger), card: f, reason: 'adjust', at, operator, note: entry.followerNote }));
  }
}

/** 冻满了还没解冻的期限卡自动解冻（core 的 settleFreeze），流水的时间记恢复能用的那天 */
function settleFrozenCards(db: MockDb) {
  for (const card of [...db.cards]) {
    const cur = db.cards.find(c => c.id === card.id)!;
    const r = settleFreeze(cur, db.cards.filter(c => c.memberId === cur.memberId), db.today);
    if (!r) continue;
    const on = addDays((cur as PeriodCard).frozenUntil!, 1);
    const note = `冻满 ${r.days} 天，自动解冻，到期日顺延 ${r.days} 天`;
    saveCardChange(db, r.card, r.followers, { reason: 'unfreeze', note, followerNote: '前一张期限卡解冻，开始日跟着调整' }, { operatorType: 'system', operatorId: null }, `${on}T00:00:00+08:00`);
  }
}

/** 后台改卡的权限、卡和会员校验 */
function cardScope(db: MockDb, staff: Staff, id: string, action: 'card.adjust' | 'card.freeze'): { card: Card; cards: Card[] } | ApiResponse {
  if (!canDo(staff.role, action)) return fail(403, 'forbidden', action === 'card.adjust' ? '店长以上才能调整卡' : '店长以上才能冻结、解冻');
  const card = db.cards.find(c => c.id === id);
  if (!card) return fail(404, 'card-not-found', '没有这张卡');
  const m = db.members.find(x => x.id === card.memberId);
  if (!m) return fail(404, 'member-not-found', '没有这个会员');
  if (!MEMBERS_VISIBLE_ACROSS_STORES && !canSeeStore(staff, m.homeStoreId)) return fail(403, 'forbidden', '没有这家店的权限');
  return { card, cards: db.cards.filter(c => c.memberId === card.memberId) };
}

const ruleFail = (e: unknown): ApiResponse => {
  if (e instanceof RuleError && e.code === 'reason-required') return badInput('reason', e.message);
  if (e instanceof RuleError) return fail(422, e.code, e.message);
  throw e;
};

/** 调次数、改到期日：口径见 @climb/api 的 CardAdjustBody，规则在 @climb/core 的 adjustCard */
function adjustDeskCard(db: MockDb, staff: Staff, id: string, body: Partial<CardAdjustBody> | null): ApiResponse {
  const scope = cardScope(db, staff, id, 'card.adjust');
  if ('status' in scope) return scope;
  const reason = String(body?.reason ?? '').trim();
  const input = { reason, ...(body?.remaining !== undefined && { remaining: Number(body.remaining) }), ...(body?.expiresOn !== undefined && { expiresOn: body.expiresOn }) };
  let r: ReturnType<typeof adjustCard>;
  try {
    r = adjustCard({ card: scope.card, cards: scope.cards, input, today: db.today });
  } catch (e) {
    return ruleFail(e);
  }
  saveCardChange(db, r.card, r.followers, { reason: 'adjust', delta: r.delta, note: reason, followerNote: '前一张期限卡改了到期日，开始日跟着调整' }, { operatorType: 'staff', operatorId: staff.id });
  const res: CardChangeResult = { card: r.card, followers: r.followers };
  return ok(res);
}

const memberFreezeHistory = (db: MockDb, cards: Card[]) => freezeHistory(db.ledger, cards.map(c => c.id));

/** 后台帮冻前看规则和剩余次数：口径见 @climb/api 的 DeskFreezeOptions */
function deskFreezeOptions(db: MockDb, staff: Staff, id: string): ApiResponse {
  const scope = cardScope(db, staff, id, 'card.freeze');
  if ('status' in scope) return scope;
  const rules = db.rules.freezeRules;
  const history = memberFreezeHistory(db, scope.cards);
  const quota = freezeQuotaLeft(history, db.today, rules);
  const res: DeskFreezeOptions = { ...deskFreezeCheck({ card: scope.card, history, today: db.today, rules }), rules, monthLeft: quota.month, yearLeft: quota.year };
  return ok(res);
}

/** 后台帮会员冻结：口径见 @climb/api 的 DeskFreezeBody，规则在 @climb/core 的 deskFreezePeriodCard */
function deskFreeze(db: MockDb, staff: Staff, id: string, body: Partial<DeskFreezeBody> | null): ApiResponse {
  const scope = cardScope(db, staff, id, 'card.freeze');
  if ('status' in scope) return scope;
  const overrideReason = String(body?.overrideReason ?? '').trim();
  if (overrideReason && !canDo(staff.role, 'card.freezeOverride')) return fail(403, 'forbidden', '没有破例冻结的权限');
  const days = Number(body?.days);
  let r: ReturnType<typeof deskFreezePeriodCard>;
  try {
    r = deskFreezePeriodCard({ card: scope.card, cards: scope.cards, days, history: memberFreezeHistory(db, scope.cards), today: db.today, rules: db.rules.freezeRules, overrideReason });
  } catch (e) {
    return ruleFail(e);
  }
  const extra = String(body?.note ?? '').trim();
  const note = [`前台代办冻结 ${days} 天，到 ${r.card.frozenUntil}`, extra, r.overridden.length ? `破例：${overrideReason}` : ''].filter(Boolean).join('；');
  saveCardChange(db, r.card, r.followers, { reason: 'freeze', note, followerNote: '前一张期限卡冻结，开始日往后挪' }, { operatorType: 'staff', operatorId: staff.id });
  const res: DeskFreezeResult = r;
  return ok(res);
}

/** 后台解冻（会员自助冻的也能提前解）：口径见 @climb/api 的 DeskUnfreezeBody */
function deskUnfreeze(db: MockDb, staff: Staff, id: string, body: Partial<DeskUnfreezeBody> | null): ApiResponse {
  const scope = cardScope(db, staff, id, 'card.freeze');
  if ('status' in scope) return scope;
  let r: ReturnType<typeof unfreezePeriodCard>;
  try {
    r = unfreezePeriodCard({ card: scope.card, cards: scope.cards, on: db.today });
  } catch (e) {
    return ruleFail(e);
  }
  const note = [`前台办理提前解冻，到期日顺延 ${r.days} 天`, String(body?.note ?? '').trim()].filter(Boolean).join('；');
  saveCardChange(db, r.card, r.followers, { reason: 'unfreeze', note, followerNote: '前一张期限卡解冻，开始日跟着调整' }, { operatorType: 'staff', operatorId: staff.id });
  const res: DeskUnfreezeResult = r;
  return ok(res);
}

/** 退款的权限、订单和门店校验；通过返回订单、它开的卡和以前的退款 */
function refundScope(db: MockDb, staff: Staff, id: string): { order: MockOrder; card: Card | null; refunds: MockDb['refunds'] } | ApiResponse {
  if (!canDo(staff.role, 'order.refund')) return fail(403, 'forbidden', '店长以上才能退款');
  const order = db.orders.find(o => o.id === id);
  if (!order) return fail(404, 'order-not-found', '没有这个订单');
  if (!canSeeStore(staff, order.storeId)) return fail(403, 'forbidden', '没有这家店的权限');
  const card = db.cards.find(c => c.id === order.cardId) ?? null;
  return { order, card, refunds: db.refunds.filter(r => r.orderId === order.id) };
}

function refundRow(db: MockDb, r: MockDb['refunds'][number]): RefundRow {
  const byName = r.staffId ? (db.staff.find(s => s.id === r.staffId)?.name ?? '') : '';
  return { id: r.id, orderId: r.orderId, amountCents: r.amountCents, method: r.method, status: r.status, refundedOn: r.refundedOn, reason: r.reason, at: r.at ?? '', byName };
}

/** 退款前看能退多少、建议退多少：口径见 @climb/api 的 RefundPreview */
function refundPreview(db: MockDb, staff: Staff, id: string): ApiResponse {
  const scope = refundScope(db, staff, id);
  if ('status' in scope) return scope;
  const { order, card, refunds } = scope;
  const blockedBy = refundBlockedBy(order, refunds);
  const frozenDays = card ? pastFrozenDays(db.ledger, card.id) : 0;
  const s = suggestedRefund({ order, refunds, card, frozenDays, today: db.today });
  const res: RefundPreview = {
    order: orderRow(db, order),
    memberName: db.members.find(m => m.id === order.memberId)?.name ?? '',
    card,
    blockedBy,
    method: blockedBy ? null : REFUND_METHOD_BY_CHANNEL[order.channel],
    refundableCents: refundableCents(order, refunds),
    suggestedCents: blockedBy ? 0 : s.cents,
    basis: s.basis,
    refunds: refunds.map(r => refundRow(db, r)),
  };
  return ok(res);
}

/** 退款：口径见 @climb/api 的 RefundBody，规则都在 @climb/core 的 refund.ts */
function refundOrder(db: MockDb, staff: Staff, id: string, body: Partial<RefundBody> | null): ApiResponse {
  const scope = refundScope(db, staff, id);
  if ('status' in scope) return scope;
  const requestId = String(body?.requestId ?? '');
  if (!requestId) return badInput('requestId', '缺少 requestId');
  const done = db.refundRequests[requestId];
  if (done) return ok(done);

  const { order, card, refunds } = scope;
  const reason = String(body?.reason ?? '').trim();
  const amountCents = Number(body?.amountCents);
  let r: ReturnType<typeof planRefund>;
  try {
    r = planRefund({ order, refunds, card, cards: db.cards.filter(c => c.memberId === order.memberId), amountCents, reason, today: db.today });
  } catch (e) {
    if (e instanceof RuleError && e.code === 'refund-amount-invalid') return badInput('amountCents', e.message);
    return ruleFail(e);
  }

  const at = nowAt(db);
  const refund: MockDb['refunds'][number] = {
    id: nextId('rf-', db.refunds),
    orderId: order.id,
    amountCents,
    refundedOn: r.status === 'succeeded' ? db.today : null,
    reason,
    method: r.method,
    status: r.status,
    at,
    staffId: staff.id,
  };
  db.refunds.push(refund);
  // 微信原路退：mock 当场模拟微信回调退款成功
  if (refund.method === 'wechat_original') {
    refund.status = 'succeeded';
    refund.refundedOn = db.today;
  }
  const operator = { operatorType: 'staff' as const, operatorId: staff.id };
  if (r.card && card && r.card !== card) {
    db.cards[db.cards.findIndex(c => c.id === card.id)] = r.card;
    db.ledger.push(refundLedgerEntry({ id: nextId('l-', db.ledger), card: r.card, delta: r.delta, at, orderId: order.id, operator, note: reason }));
    for (const f of r.followers) {
      db.cards[db.cards.findIndex(c => c.id === f.id)] = f;
      db.ledger.push(cardChangeLedgerEntry({ id: nextId('l-', db.ledger), card: f, reason: 'adjust', at, operator, note: '前一张期限卡退款，开始日往前挪' }));
    }
  }
  const res: RefundResult = { refund: refundRow(db, refund), order: orderRow(db, order), card: r.card, followers: r.followers };
  db.refundRequests[requestId] = res;
  return ok(res);
}

/** 冻结规则 PUT /admin/settings/freeze-rules；存在 db.rules 里，小程序冻结接口和后台冻结都读这一份 */
function saveFreezeRules(db: MockDb, staff: Staff, body: any): ApiResponse {
  if (!canDo(staff.role, 'settings.freezeRules')) return fail(403, 'forbidden', '只有老板能改冻结规则');
  const errs = freezeRulesErrors(body ?? {});
  if (errs) {
    const field = Object.keys(errs)[0] as keyof typeof errs;
    return badInput(field, errs[field]!);
  }
  db.rules = { ...db.rules, freezeRules: pickFreezeRules(body) };
  return ok(db.rules.freezeRules);
}

/** 新建卡种：口径见 @climb/api 的 CreateProductBody，规则都在 @climb/core 的 product.ts */
function createProduct(db: MockDb, staff: Staff, body: Partial<CreateProductBody> | null): ApiResponse {
  if (!canDo(staff.role, 'product.edit') || !canDo(staff.role, 'product.price')) return fail(403, 'forbidden', '没有新建卡种的权限');
  const errs = newProductErrors(body ?? {}, db.products);
  if (errs) {
    const field = Object.keys(errs)[0] as keyof typeof errs;
    return badInput(field, errs[field]!);
  }
  const product = buildProduct(nextId('p-new-', db.products), body as CreateProductBody, db.products);
  db.products.push(product);
  return ok(product);
}

/** 修改卡种：只改卡种本身，订单（快照）和已经开出去的卡不动 */
function updateProduct(db: MockDb, staff: Staff, id: string, body: UpdateProductBody | null): ApiResponse {
  if (!canDo(staff.role, 'product.edit')) return fail(403, 'forbidden', '没有修改卡种的权限');
  const i = db.products.findIndex(p => p.id === id);
  if (i < 0) return fail(404, 'product-not-found', '没有这个卡种');
  const product = db.products[i]!;
  const patch = body ?? {};
  if (changesPrice(product, patch) && !canDo(staff.role, 'product.price')) return fail(403, 'forbidden', '没有改价的权限');
  const errs = productPatchErrors(product, patch, db.products);
  if (errs) {
    const field = Object.keys(errs)[0] as keyof typeof errs;
    return badInput(field, errs[field]!);
  }
  db.products[i] = applyProductPatch(product, patch);
  return ok(db.products[i]);
}

const routes: { method: ApiRequest['method']; path: RegExp; auth: boolean; handle: Handler }[] = [
  {
    method: 'POST',
    path: /^\/admin\/auth\/login$/,
    auth: false,
    handle: ({ db, body }) => {
      const s = db.staff.find(x => x.phone === body?.phone);
      if (!s || s.password !== body?.password) return fail(401, 'bad-credentials', '手机号或密码不对');
      if (!s.active) return fail(403, 'staff-inactive', '这个账号已停用，找馆长开通');
      const res: LoginResult = { token: TOKEN_PREFIX + s.id, staff: toStaff(s) };
      return ok(res);
    },
  },
  { method: 'GET', path: /^\/admin\/auth\/me$/, auth: true, handle: ({ staff }) => ok(staff) },
  {
    method: 'GET',
    path: /^\/admin\/stores$/,
    auth: true,
    handle: ({ db, staff }) => ok(db.stores.filter(st => canSeeStore(staff!, st.id))),
  },
  {
    method: 'GET',
    path: /^\/admin\/dashboard$/,
    auth: true,
    handle: ({ db, query, staff }) => {
      const storeId = query.get('store');
      const ids = storeScope(db, staff!, storeId);
      if (!Array.isArray(ids)) return ids;
      const sum = (k: StoreStat) => sumStats(db, ids, k);
      const res: DashboardSummary = {
        storeId,
        today: db.today,
        monthRevenueCents: sum('monthRevenueCents'),
        todayEntries: sum('todayEntries'),
        lastWeekSameTimeEntries: sum('lastWeekSameTimeEntries'),
        todayBookings: sum('todayBookings'),
        activeMembers: sum('activeMembers'),
        newcomers: newcomerRows(db, ids),
        referral: referralFunnel(db, ids),
        expiring: expiringRows(db, ids),
        stores: storeId ? null : storeCompare(db),
      };
      return ok(res);
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/finance$/,
    auth: true,
    handle: ({ db, query, staff }) => {
      if (!canSeePage(staff!.role, 'finance')) return fail(403, 'forbidden', '没有财务权限');
      const from = query.get('from') ?? '';
      const to = query.get('to') ?? '';
      const bad = financeRangeError(from, to);
      if (bad) return fail(400, 'bad-range', bad);
      const storeId = query.get('store');
      const ids = storeScope(db, staff!, storeId);
      if (!Array.isArray(ids)) return ids;
      const orders = db.orders.filter(o => ids.includes(o.storeId));
      const s = summarizeRevenue(orders, db.refunds, from, to);
      const orderById = new Map(orders.map(o => [o.id, o]));
      const memberName = (id: string) => db.members.find(m => m.id === id)?.name ?? '';
      const refunds = s.refunds.map((r): FinanceRefundRow => {
        const o = orderById.get(r.orderId)!;
        const full = db.refunds.find(x => x.id === r.id)!;
        return {
          refundId: r.id,
          orderId: o.id,
          memberId: o.memberId,
          memberName: memberName(o.memberId),
          storeId: o.storeId,
          channel: o.channel as RevenueChannel,
          category: o.category,
          productName: o.productName,
          orderAmountCents: o.amountCents,
          amountCents: r.amountCents,
          refundedOn: r.refundedOn!,
          reason: full.reason,
          method: full.method,
        };
      });
      const res: FinanceSummary = { ...s, storeId, from, to, refunds };
      return ok(res);
    },
  },
  {
    method: 'GET',
    path: /^\/admin\/members$/,
    auth: true,
    handle: ({ db, query, staff }) => {
      const page = Number(query.get('page') ?? '1');
      if (!Number.isInteger(page) || page < 1) return fail(400, 'bad-page', '页码不对');
      return ok(memberList(db, staff!, (query.get('q') ?? '').trim(), page));
    },
  },
  {
    method: 'POST',
    path: /^\/admin\/members$/,
    auth: true,
    handle: ({ db, body, staff }) => createMember(db, staff!, body),
  },
  {
    method: 'GET',
    path: /^\/admin\/members\/([^/]+)$/,
    auth: true,
    handle: ({ db, params, staff }) => memberDetail(db, staff!, decodeURIComponent(params[0]!)),
  },
  {
    method: 'GET',
    path: /^\/admin\/products$/,
    auth: true,
    handle: ({ db }) => ok(sortProducts(db.products)),
  },
  {
    method: 'POST',
    path: /^\/admin\/products$/,
    auth: true,
    handle: ({ db, body, staff }) => createProduct(db, staff!, body),
  },
  {
    method: 'PATCH',
    path: /^\/admin\/products\/([^/]+)$/,
    auth: true,
    handle: ({ db, params, body, staff }) => updateProduct(db, staff!, decodeURIComponent(params[0]!), body),
  },
  // 小程序的在售卡种（@climb/api 的 createApi）。小程序 mock 合并过来后读同一份 db.products；会员登录这里先不查
  {
    method: 'GET',
    path: /^\/products$/,
    auth: false,
    handle: ({ db }) => ok(productsForSale(db.products)),
  },
  {
    method: 'POST',
    path: /^\/admin\/orders$/,
    auth: true,
    handle: ({ db, body, staff }) => createDeskOrder(db, staff!, body),
  },
  {
    method: 'GET',
    path: /^\/admin\/orders\/([^/]+)\/refund$/,
    auth: true,
    handle: ({ db, params, staff }) => refundPreview(db, staff!, decodeURIComponent(params[0]!)),
  },
  {
    method: 'POST',
    path: /^\/admin\/orders\/([^/]+)\/refund$/,
    auth: true,
    handle: ({ db, params, body, staff }) => refundOrder(db, staff!, decodeURIComponent(params[0]!), body),
  },
  {
    method: 'GET',
    path: /^\/admin\/shares$/,
    auth: true,
    handle: ({ db, query, staff }) => shareList(db, staff!, query.get('store'), query.get('kind')),
  },
  {
    method: 'GET',
    path: /^\/admin\/check-ins$/,
    auth: true,
    handle: ({ db, query, staff }) => checkInList(db, staff!, query.get('date'), query.get('store')),
  },
  {
    method: 'POST',
    path: /^\/admin\/check-ins\/preview$/,
    auth: true,
    handle: ({ db, body, staff }) => checkInPreview(db, staff!, body),
  },
  {
    method: 'POST',
    path: /^\/admin\/check-ins$/,
    auth: true,
    handle: ({ db, body, staff }) => createDeskCheckIn(db, staff!, body),
  },
  {
    method: 'POST',
    path: /^\/admin\/check-ins\/([^/]+)\/void$/,
    auth: true,
    handle: ({ db, params, body, staff }) => voidDeskCheckIn(db, staff!, decodeURIComponent(params[0]!), body),
  },
  {
    method: 'GET',
    path: /^\/admin\/settings\/freeze-rules$/,
    auth: true,
    handle: ({ db }) => ok(db.rules.freezeRules),
  },
  {
    method: 'PUT',
    path: /^\/admin\/settings\/freeze-rules$/,
    auth: true,
    handle: ({ db, body, staff }) => saveFreezeRules(db, staff!, body),
  },
  {
    method: 'GET',
    path: /^\/admin\/cards\/([^/]+)\/ledger$/,
    auth: true,
    handle: ({ db, params, staff }) => cardLedger(db, staff!, decodeURIComponent(params[0]!)),
  },
  {
    method: 'POST',
    path: /^\/admin\/cards\/([^/]+)\/adjust$/,
    auth: true,
    handle: ({ db, params, body, staff }) => adjustDeskCard(db, staff!, decodeURIComponent(params[0]!), body),
  },
  {
    method: 'GET',
    path: /^\/admin\/cards\/([^/]+)\/freeze$/,
    auth: true,
    handle: ({ db, params, staff }) => deskFreezeOptions(db, staff!, decodeURIComponent(params[0]!)),
  },
  {
    method: 'POST',
    path: /^\/admin\/cards\/([^/]+)\/freeze$/,
    auth: true,
    handle: ({ db, params, body, staff }) => deskFreeze(db, staff!, decodeURIComponent(params[0]!), body),
  },
  {
    method: 'POST',
    path: /^\/admin\/cards\/([^/]+)\/unfreeze$/,
    auth: true,
    handle: ({ db, params, body, staff }) => deskUnfreeze(db, staff!, decodeURIComponent(params[0]!), body),
  },
];

export function createMockAdapter(db: MockDb, opts: { delayMs?: number } = {}): RequestAdapter {
  return async req => {
    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs));
    const url = new URL(req.url, 'http://mock.local');
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.path);
      if (!m) continue;
      let staff: Staff | null = null;
      if (r.auth) {
        const token = req.headers.Authorization?.replace(/^Bearer /, '') ?? '';
        const s = token.startsWith(TOKEN_PREFIX) ? db.staff.find(x => x.id === token.slice(TOKEN_PREFIX.length) && x.active) : undefined;
        if (!s) return fail(401, 'unauthorized', '登录已过期，请重新登录');
        staff = toStaff(s);
        settleFrozenCards(db);
      }
      // 返回深拷贝，避免页面改到 mock 里的数据
      const res = r.handle({ db, body: req.body, query: url.searchParams, params: m.slice(1), staff });
      return { status: res.status, data: structuredClone(res.data) };
    }
    return fail(404, 'not-found', `mock 还没实现 ${req.method} ${url.pathname}`);
  };
}
