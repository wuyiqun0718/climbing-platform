import { formatDot, formatYuan } from '@climb/utils';
import type { AuditAction, AuditLogEntry } from './audit';
import { CARD_STATE_TEXT } from './cardText';
import type { ClassBookingStatus, ClassSessionStatus } from './classes';
import { POLICY_STATUS_TEXT } from './insurance';
import { ORDER_CHANNEL_LABELS, ORDER_STATUS_LABELS } from './orders';
import type { PtBookingStatus } from './pt';
import { PRODUCT_CATEGORY_TEXT } from './product';
import { STAFF_ROLE_TEXT } from './staff';

/**
 * 操作日志页「改前 → 改后」给人看的文字：字段换中文名，金额（分）按元带 ¥ 和千分位，日期 2026.10.12，状态这类枚举换中文。
 * 字段按动作查（同名字段在不同动作里意思不一样，比如 status、kind、refunded）；会员、卡这类 id 不列（「对象」列已经有了）。
 * 没收录的字段原样列字段名，至少不丢信息。
 */

export interface AuditTextContext {
  /** 门店 id → 名字；不给就显示 id */
  storeName?: (id: string) => string;
  /** 员工（教练）id → 名字；不给就显示 id */
  staffName?: (id: string) => string;
}

type Fmt = (v: unknown, ctx: AuditTextContext) => string;
/** 一个字段：中文名和怎么显示；fields 是嵌套对象（卡、保单、退款单……）里的字段，列成「卡·剩余次数」；hide 不列 */
interface Field {
  label: string;
  fmt?: Fmt;
  fields?: Record<string, Field>;
  hide?: boolean;
}

const plain: Fmt = v => (v === null || v === undefined || v === '' ? '—' : String(v));
const money: Fmt = v => (typeof v === 'number' ? formatYuan(v) : plain(v, {}));
const date: Fmt = v => (typeof v === 'string' && v ? formatDot(v) : '—');
const unit = (u: string, nullText = '—'): Fmt => v => (v === null ? nullText : typeof v === 'number' ? `${v} ${u}` : plain(v, {}));
const yesNo = (yes: string, no: string): Fmt => v => (v === true ? yes : v === false ? no : '—');
const oneOf = (map: Record<string, string>): Fmt => v => (typeof v === 'string' ? (map[v] ?? v) : plain(v, {}));
const list: Fmt = v => (Array.isArray(v) ? (v.length ? v.join('、') : '没有') : plain(v, {}));
/** 一组 id（补上的预约、退掉的预约、复制出来的课），只说多少个 */
const howMany = (u: string): Fmt => v => (Array.isArray(v) ? `${v.length} ${u}` : plain(v, {}));
const store: Fmt = (v, ctx) => (typeof v === 'string' && v ? (ctx.storeName?.(v) ?? v) : '—');
const stores: Fmt = (v, ctx) => (Array.isArray(v) ? (v.length ? v.map(id => store(id, ctx)).join('、') : '全部门店') : plain(v, ctx));
const staff: Fmt = (v, ctx) => (typeof v === 'string' && v ? (ctx.staffName?.(v) ?? v) : '没指定');
const hour = (h: unknown) => (typeof h === 'number' ? `${String(h).padStart(2, '0')}:00` : '—');
const hourSlot: Fmt = v => (typeof v === 'number' ? `${hour(v)}–${hour(v + 1)}` : '—');

const HIDDEN: Field = { label: '', hide: true };

const CLASS_BOOKING_STATUS_TEXT: Record<ClassBookingStatus, string> = { booked: '已约', waitlisted: '候补', attended: '到了', absent: '缺席', cancelled: '已取消', voided: '课取消了' };
const PT_BOOKING_STATUS_TEXT: Record<PtBookingStatus, string> = { pending: '等教练确认', booked: '已约', attended: '上完了', absent: '缺席', cancelled: '已取消', voided: '教练取消了' };
const SESSION_STATUS_TEXT: Record<ClassSessionStatus, string> = { scheduled: '正常', cancelled: '已取消' };
const REFUND_METHOD_TEXT: Record<string, string> = { wechat_original: '微信原路退回', offline: '线下退' };
const REFUND_STATUS_TEXT: Record<string, string> = { processing: '退款中', succeeded: '已退', failed: '退款失败' };
const EXPORT_KIND_TEXT: Record<string, string> = { members: '会员', cards: '卡', orders: '订单', 'check-ins': '入场记录' };

/** 卡的样子（mock / 后端的 cardAuditFields） */
const CARD_FIELDS: Record<string, Field> = {
  status: { label: '状态', fmt: oneOf(CARD_STATE_TEXT) },
  remaining: { label: '剩余次数', fmt: unit('次') },
  total: { label: '总次数', fmt: unit('次') },
  startsOn: { label: '开始日期', fmt: date },
  frozenFrom: { label: '冻结开始', fmt: date },
  frozenUntil: { label: '冻结到', fmt: date },
  usedOn: { label: '用掉那天', fmt: date },
  expiresOn: { label: '到期日', fmt: date },
};

/** 期限卡顺延（冻结、退款带出来的后面几张），只说几张 */
const FOLLOWERS: Field = { label: '后面的期限卡跟着顺延', fmt: howMany('张') };

const COACH_FIELDS: Record<string, Field> = {
  tags: { label: '擅长', fmt: list },
  bio: { label: '介绍', fmt: plain },
  avatarUrl: { label: '头像', fmt: v => (v ? '有' : '没有') },
  priceCents: { label: '私教单价', fmt: money },
  storeIds: { label: '接课门店', fmt: stores },
};

const SHARED: Record<string, Field> = {
  id: HIDDEN,
  memberId: HIDDEN,
  cardId: HIDDEN,
  productId: HIDDEN,
  policyId: HIDDEN,
  sessionId: HIDDEN,
  classTypeId: HIDDEN,
  checkInId: HIDDEN,
  name: { label: '名称', fmt: plain },
  storeId: { label: '门店', fmt: store },
  on: { label: '日期', fmt: date },
  coachId: { label: '教练', fmt: staff },
  card: { label: '卡', fields: CARD_FIELDS },
  followers: FOLLOWERS,
  ...CARD_FIELDS,
};

const PRODUCT: Record<string, Field> = {
  name: { label: '名称', fmt: plain },
  category: { label: '类型', fmt: oneOf(PRODUCT_CATEGORY_TEXT) },
  priceCents: { label: '标价', fmt: money },
  days: { label: '天数', fmt: unit('天') },
  quantity: { label: '次数 / 节数', fmt: unit('次') },
  validMonths: { label: '有效期', fmt: unit('个月') },
  perks: { label: '卖点', fmt: list },
  onSale: { label: '在卖', fmt: yesNo('上架', '下架') },
  sort: { label: '排序', fmt: plain },
};

const STAFF: Record<string, Field> = {
  phone: { label: '手机号', fmt: plain },
  name: { label: '姓名', fmt: plain },
  role: { label: '角色', fmt: oneOf(STAFF_ROLE_TEXT) },
  storeIds: { label: '门店', fmt: stores },
  active: { label: '状态', fmt: yesNo('在职', '停用') },
  coach: { label: '教练资料', fields: COACH_FIELDS },
};

const CLASS_TYPE: Record<string, Field> = {
  name: { label: '课名', fmt: plain },
  minutes: { label: '时长', fmt: unit('分钟') },
  capacity: { label: '人数上限', fmt: unit('人') },
  credits: { label: '每节扣', fmt: unit('次') },
  active: { label: '状态', fmt: yesNo('在用', '停用') },
};

const CLASS_SESSION: Record<string, Field> = {
  ...CLASS_TYPE,
  startTime: { label: '开始时间', fmt: plain },
  status: { label: '状态', fmt: oneOf(SESSION_STATUS_TEXT) },
  cancelReason: { label: '取消原因', fmt: plain },
  promoted: { label: '候补补上', fmt: howMany('人') },
};

const CANCEL_BEFORE: Field = { label: '截止自助取消', fmt: unit('分钟前') };

const FIELDS_BY_ACTION: Partial<Record<AuditAction, Record<string, Field>>> = {
  'order.create': {
    productName: { label: '卡种', fmt: plain },
    listPriceCents: { label: '标价', fmt: money },
    amountCents: { label: '实收', fmt: money },
    channel: { label: '收款方式', fmt: oneOf(ORDER_CHANNEL_LABELS) },
  },
  'order.refund': {
    refundedCents: { label: '已退', fmt: money },
    status: { label: '订单状态', fmt: oneOf(ORDER_STATUS_LABELS) },
    refund: {
      label: '退款',
      fields: {
        id: HIDDEN,
        amountCents: { label: '金额', fmt: money },
        method: { label: '怎么退', fmt: oneOf(REFUND_METHOD_TEXT) },
        status: { label: '状态', fmt: oneOf(REFUND_STATUS_TEXT) },
      },
    },
  },
  'check_in.create': {
    cardName: { label: '用的卡', fmt: plain },
    deducted: { label: '扣了', fmt: unit('次') },
    reentry: { label: '当天再次进场', fmt: yesNo('是（不再扣）', '否') },
    remaining: { label: '卡上还剩', fmt: unit('次') },
  },
  'check_in.void': {
    voided: { label: '入场', fmt: yesNo('已撤销', '有效') },
    deducted: { label: '这次扣了', fmt: unit('次') },
    restored: { label: '退回', fmt: unit('次') },
    voucherRestored: { label: '入场券', fmt: yesNo('退回了', '没退') },
    policy: { label: '保险', fields: { checkInId: HIDDEN, status: { label: '状态', fmt: oneOf(POLICY_STATUS_TEXT) } } },
    movedTo: { label: '当天改记到另一次入场', fields: { checkInId: HIDDEN, cardId: HIDDEN, deducted: { label: '扣了', fmt: unit('次') } } },
  },
  'product.create': PRODUCT,
  'product.update': PRODUCT,
  'staff.create': STAFF,
  'staff.update': STAFF,
  'settings.freeze_rules': {
    memberSelfService: { label: '会员自己在小程序冻结', fmt: yesNo('可以', '不行，只能前台办') },
    perMonth: { label: '每月最多冻结', fmt: unit('次', '不限') },
    perYear: { label: '每年最多冻结', fmt: unit('次', '不限') },
    minDays: { label: '每次最少', fmt: unit('天') },
    maxDays: { label: '每次最多', fmt: unit('天') },
  },
  'data.export': {
    kind: { label: '导出', fmt: oneOf(EXPORT_KIND_TEXT) },
    filters: {
      label: '条件',
      fields: { q: { label: '搜索', fmt: plain }, from: { label: '从', fmt: date }, to: { label: '到', fmt: date }, date: { label: '日期', fmt: date }, store: { label: '门店', fmt: store } },
    },
    rows: { label: '行数', fmt: unit('行') },
    fullPhone: { label: '手机号', fmt: yesNo('完整', '打码') },
  },
  'class_type.create': CLASS_TYPE,
  'class_type.update': CLASS_TYPE,
  'settings.class_rules': {
    cancelBeforeMinutes: { label: '开课前截止自助取消', fmt: unit('分钟') },
    waitlist: { label: '满员候补', fmt: yesNo('开', '关') },
    waitlistMax: { label: '候补最多', fmt: unit('人', '不限') },
    lateGraceMinutes: { label: '迟到多久算缺席', fmt: unit('分钟') },
  },
  'class.create': CLASS_SESSION,
  'class.update': CLASS_SESSION,
  'class.cancel': {
    status: { label: '这节课', fmt: oneOf(SESSION_STATUS_TEXT) },
    voidedBookings: { label: '作废的预约', fmt: howMany('个') },
    refunded: { label: '退了次数的', fmt: unit('人') },
  },
  'class.copy_week': {
    week: { label: '复制到', fmt: v => (typeof v === 'string' ? `${formatDot(v)} 那周` : '—') },
    created: { label: '排上', fmt: howMany('节') },
    skipped: { label: '跳过（时间冲突或已过）', fmt: howMany('节') },
  },
  'class_booking.attend': {
    status: { label: '预约', fmt: oneOf(CLASS_BOOKING_STATUS_TEXT) },
  },
  'class_booking.cancel': {
    status: { label: '预约', fmt: oneOf(CLASS_BOOKING_STATUS_TEXT) },
    deducted: { label: '扣了', fmt: unit('次') },
    refunded: { label: '退回', fmt: unit('次') },
    promoted: { label: '候补补上', fmt: howMany('人') },
  },
  'pt_slot.mark': {
    hour: { label: '时段', fmt: hourSlot },
    kind: { label: '标成', fmt: oneOf({ offline: '线下已约', off: '不接课' }) },
    note: { label: '备注', fmt: plain },
  },
  'pt_booking.confirm': {
    status: { label: '预约', fmt: oneOf(PT_BOOKING_STATUS_TEXT) },
  },
  'pt_booking.cancel': {
    status: { label: '预约', fmt: oneOf(PT_BOOKING_STATUS_TEXT) },
    kind: { label: '谁取消', fmt: oneOf({ member: '替会员取消', coach: '教练取消 / 拒绝' }) },
    refunded: { label: '退回课时', fmt: unit('节') },
  },
  'settings.pt_rules': {
    openHour: { label: '第一格', fmt: hour },
    closeHour: { label: '最后一格到', fmt: hour },
    cancelBeforeMinutes: CANCEL_BEFORE,
    needCoachConfirm: { label: '会员约了要教练确认', fmt: yesNo('要', '不要') },
  },
  'desk_device.bind': {
    name: { label: '平板名', fmt: plain },
  },
  'desk_device.unbind': {
    active: { label: '平板', fmt: yesNo('绑定中', '已解绑') },
  },
};
FIELDS_BY_ACTION['pt_slot.unmark'] = FIELDS_BY_ACTION['pt_slot.mark'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function lines(fields: Record<string, Field>, before: Record<string, unknown> | null, after: Record<string, unknown> | null, ctx: AuditTextContext, prefix: string): string[] {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  return keys.flatMap(k => {
    const f = fields[k] ?? { label: k };
    if (f.hide) return [];
    const b = before?.[k];
    const a = after?.[k];
    const label = prefix + f.label;
    if (f.fields && (isObj(b) || isObj(a))) return lines(f.fields, isObj(b) ? b : before ? {} : null, isObj(a) ? a : after ? {} : null, ctx, `${label}·`);
    const fmt = f.fmt ?? ((v: unknown) => (isObj(v) || Array.isArray(v) ? JSON.stringify(v) : plain(v, ctx)));
    // 新建只有改后、删掉只有改前，只列一边
    if (!before) return [`${label}：${fmt(a, ctx)}`];
    if (!after) return [`${label}：${fmt(b, ctx)}`];
    return [`${label}：${k in before ? fmt(b, ctx) : '—'} → ${k in after ? fmt(a, ctx) : '—'}`];
  });
}

/** 一条日志的改前改后，一个字段一行；没有可列的返回空数组 */
export function auditChangeLines(entry: Pick<AuditLogEntry, 'action' | 'before' | 'after'>, ctx: AuditTextContext = {}): string[] {
  const fields = { ...SHARED, ...FIELDS_BY_ACTION[entry.action] };
  return lines(fields, entry.before, entry.after, ctx, '');
}
