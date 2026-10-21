import type { DateKey } from '@climb/utils';
import type { CardChange } from './classes';
import type { PtRules } from './gym';
import { isCardNormal, RuleError, type RuleErrorCode } from './rules';
import type { Card, LessonCard } from './types';

/**
 * 私教：每位教练每天按 PtRules 的营业时间每小时一格，会员约格子、扣私教课包（LessonCard kind = 'pt'）1 节。
 * 小程序（任务 31–33）和后台私教时间轴（mvp/dashboard 任务 29–30）共用这里的类型和规则。
 * 跟 classes.ts 一样：函数不改入参，返回改好的预约和要记的流水（CardChange，reason 为 pt_*、ref 为 pt_booking），调用方在同一个事务里写库。
 * 时间是门店当地时间；一格用 on（日期）+ hour（开始的整点）表示。
 */

/**
 * 一格的状态（后台时间轴按它上色，小程序只有 free 能约）：
 * - free：空闲，会员能约
 * - member：会员在小程序约了（PtBooking，含等教练确认的）
 * - offline：教练线下约的学员，教练或前台在后台填的（PtSlotMark kind = 'offline'）
 * - off：教练有事不接课（PtSlotMark kind = 'off'）
 */
export type PtSlotStatus = 'free' | 'member' | 'offline' | 'off';

/** 某位教练某天的一格；ptDaySlots 算出来，不存库 */
export interface PtSlot {
  coachId: string;
  on: DateKey;
  /** 开始的整点，比如 14 是 14:00–15:00 */
  hour: number;
  status: PtSlotStatus;
  /** 已经开始或过去了；free 但 past 的也不能约 */
  past: boolean;
  /** status 为 member 时：哪个预约、哪个会员 */
  bookingId?: string;
  memberId?: string;
  /** status 为 offline / off 时：哪条标记 */
  markId?: string;
}

/** 教练或前台在后台占掉的一格（mvp/dashboard 任务 30 `POST /admin/pt-slots`）：线下约的学员，或有事不接课 */
export interface PtSlotMark {
  id: string;
  coachId: string;
  on: DateKey;
  hour: number;
  kind: 'offline' | 'off';
  /** 线下约的学员名字、不接课的原因，可以不填 */
  note?: string;
}

/**
 * 私教预约的状态：
 * - pending：会员约了，等教练确认（PtRules.needCoachConfirm 开着时）；已扣课时、占着格子
 * - booked：约上了（不用确认，或教练确认了）；已扣课时
 * - cancelled：会员自己或前台取消；截止前会员可以自己取消，退课时
 * - voided：教练取消或拒绝；退课时
 * - attended：上完课了
 * - absent：会员没来，课时不退
 */
export type PtBookingStatus = 'pending' | 'booked' | 'cancelled' | 'voided' | 'attended' | 'absent';

/** 会员约的一节私教 */
export interface PtBooking {
  id: string;
  coachId: string;
  memberId: string;
  storeId: string;
  on: DateKey;
  hour: number;
  status: PtBookingStatus;
  /** 扣课时用的私教课包 */
  cardId: string;
  /** 实际扣了几节；取消按它退 */
  deducted: number;
  /** 下单时间（ISO） */
  createdAt: string;
  /** 取消、作废的时间（ISO） */
  closedAt?: string;
  /** 教练取消、拒绝时写的原因 */
  closeReason?: string;
}

/** 占着格子的预约：等确认的、约上的，还有已经上完或没来的（那一格已经用掉了） */
export const isPtSlotHeld = (b: PtBooking) => b.status === 'pending' || b.status === 'booked' || b.status === 'attended' || b.status === 'absent';
/** 还能取消的预约 */
export const isPtBookingActive = (b: PtBooking) => b.status === 'pending' || b.status === 'booked';

/** 一天里能约的整点：openHour 到 closeHour - 1 */
export function ptHours(rules: PtRules): number[] {
  return Array.from({ length: Math.max(0, rules.closeHour - rules.openHour) }, (_, i) => rules.openHour + i);
}

/** 这一格的开始时间，按本地时间 */
export function ptSlotStartsAt(on: DateKey, hour: number): Date {
  return new Date(`${on}T${String(hour).padStart(2, '0')}:00:00`);
}

/** 会员自助取消截止时间：上课前 cancelBeforeMinutes 分钟 */
export function ptCancelDeadline(b: Pick<PtBooking, 'on' | 'hour'>, rules: PtRules): Date {
  return new Date(ptSlotStartsAt(b.on, b.hour).getTime() - rules.cancelBeforeMinutes * 60_000);
}

type SlotArgs = { coachId: string; on: DateKey; bookings: PtBooking[]; marks: PtSlotMark[] };

/** 某一格现在被谁占着；空着返回 free */
function slotAt(a: SlotArgs & { hour: number }): Omit<PtSlot, 'past'> {
  const base = { coachId: a.coachId, on: a.on, hour: a.hour };
  const booking = a.bookings.find(b => b.coachId === a.coachId && b.on === a.on && b.hour === a.hour && isPtSlotHeld(b));
  if (booking) return { ...base, status: 'member', bookingId: booking.id, memberId: booking.memberId };
  const mark = a.marks.find(m => m.coachId === a.coachId && m.on === a.on && m.hour === a.hour);
  if (mark) return { ...base, status: mark.kind, markId: mark.id };
  return { ...base, status: 'free' };
}

/** 某位教练某天的全部格子（营业时间内每小时一格），后台时间轴、小程序选时段都用它 */
export function ptDaySlots(a: SlotArgs & { now: Date; rules: PtRules }): PtSlot[] {
  return ptHours(a.rules).map(hour => ({ ...slotAt({ ...a, hour }), past: ptSlotStartsAt(a.on, hour).getTime() <= a.now.getTime() }));
}

/** 能用来约私教的课包：私教课包、状态正常、上课那天没过期、还有课时；先到期的排前面 */
export function ptCardOptions(cards: Card[], memberId: string, on: DateKey): LessonCard[] {
  return cards
    .filter((c): c is LessonCard => c.kind === 'pt' && c.memberId === memberId && isCardNormal(c) && c.expiresOn >= on && c.remaining >= 1)
    .sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : 0));
}

const TEXT: Partial<Record<RuleErrorCode, string>> = {
  'pt-outside-hours': '这个时间不排私教',
  'pt-slot-past': '这个时段已经过了',
  'pt-slot-taken': '这个时段已经被约了，换一个',
  'pt-coach-off': '教练这个时段不接课',
  'pt-member-busy': '你这个时段已经约了别的私教',
  'pt-no-card': '没有能用的私教课包，先买一个',
  'pt-started': '这节课已经开始了',
  'pt-cancel-too-late': '离上课太近了，不能自己取消，找前台帮你处理',
  'pt-booking-not-pending': '这个预约不是等确认的状态',
  'pt-reason-required': '取消会员的预约要写原因，会员那边能看到',
  'booking-not-active': '这个预约已经取消或者上过课了',
};
const fail = (code: RuleErrorCode): never => { throw new RuleError(code, TEXT[code]!); };

/** 这一格能不能占（会员约、后台标记都先过这一关）：在营业时间内、没过、没人占 */
function slotBlockedBy(a: SlotArgs & { hour: number; now: Date; rules: PtRules }): RuleErrorCode | null {
  if (!Number.isInteger(a.hour) || !ptHours(a.rules).includes(a.hour)) return 'pt-outside-hours';
  if (ptSlotStartsAt(a.on, a.hour).getTime() <= a.now.getTime()) return 'pt-slot-past';
  const slot = slotAt(a);
  if (slot.status === 'off') return 'pt-coach-off';
  if (slot.status !== 'free') return 'pt-slot-taken';
  return null;
}

/** 会员约这一格前检查；能约为 null */
export function ptBookBlockedBy(a: SlotArgs & { hour: number; cards: Card[]; memberId: string; now: Date; rules: PtRules }): RuleErrorCode | null {
  const blocked = slotBlockedBy(a);
  if (blocked) return blocked;
  // 同一个人同一时间不能约两位教练
  if (a.bookings.some(b => b.memberId === a.memberId && b.on === a.on && b.hour === a.hour && isPtSlotHeld(b))) return 'pt-member-busy';
  if (!ptCardOptions(a.cards, a.memberId, a.on).length) return 'pt-no-card';
  return null;
}

/**
 * 会员约私教：扣 1 节课时（pt_book）。要教练确认时是 pending，否则直接 booked。
 * cardId 不填用最先到期的课包。后端在事务里锁住这位教练这一格（唯一索引 coach_id + on + hour，只算占着的）再写，同一格不会约给两个人。
 */
export function bookPt(a: SlotArgs & {
  id: string; hour: number; storeId: string; cards: Card[]; memberId: string; cardId?: string; now: Date; rules: PtRules;
}): { booking: PtBooking; changes: CardChange[] } {
  const blocked = ptBookBlockedBy(a);
  if (blocked) fail(blocked);
  const options = ptCardOptions(a.cards, a.memberId, a.on);
  const card = a.cardId ? options.find(c => c.id === a.cardId) : options[0];
  if (!card) fail('pt-no-card');
  const booking: PtBooking = {
    id: a.id, coachId: a.coachId, memberId: a.memberId, storeId: a.storeId, on: a.on, hour: a.hour,
    status: a.rules.needCoachConfirm ? 'pending' : 'booked', cardId: card!.id, deducted: 1, createdAt: a.now.toISOString(),
  };
  return { booking, changes: [{ card: { ...card!, remaining: card!.remaining - 1 }, delta: -1, reason: 'pt_book', bookingId: a.id }] };
}

/** 教练确认会员的预约（needCoachConfirm 开着时） */
export function confirmPtBooking(booking: PtBooking): PtBooking {
  if (booking.status !== 'pending') fail('pt-booking-not-pending');
  return { ...booking, status: 'booked' };
}

/** 会员自己能不能取消；能为 null。截止后会员不能取消，前台（by: 'staff'）可以 */
export function ptCancelBlockedBy(a: { booking: PtBooking; now: Date; rules: PtRules }): RuleErrorCode | null {
  if (!isPtBookingActive(a.booking)) return 'booking-not-active';
  if (ptSlotStartsAt(a.booking.on, a.booking.hour).getTime() <= a.now.getTime()) return 'pt-started';
  if (a.now.getTime() > ptCancelDeadline(a.booking, a.rules).getTime()) return 'pt-cancel-too-late';
  return null;
}

const refund = (booking: PtBooking, cards: Card[], reason: 'pt_cancel' | 'pt_void'): CardChange[] => {
  const card = cards.find((c): c is LessonCard => c.id === booking.cardId && c.kind === 'pt');
  if (!card || booking.deducted <= 0) return [];
  return [{ card: { ...card, remaining: card.remaining + booking.deducted }, delta: booking.deducted, reason, bookingId: booking.id }];
};

/**
 * 会员或前台取消：退课时（pt_cancel），格子空出来。
 * by = 'member' 按截止时间拦；'staff'（后台任务 30）不受截止限制，照样退，但开课后不能取消。
 */
export function cancelPtBooking(a: { booking: PtBooking; cards: Card[]; now: Date; rules: PtRules; by: 'member' | 'staff' }): { booking: PtBooking; changes: CardChange[] } {
  const blocked = ptCancelBlockedBy(a);
  if (blocked && !(a.by === 'staff' && blocked === 'pt-cancel-too-late')) fail(blocked);
  return { booking: { ...a.booking, status: 'cancelled', closedAt: a.now.toISOString() }, changes: refund(a.booking, a.cards, 'pt_cancel') };
}

/** 教练取消或拒绝（等确认的也走这里）：必须写原因（会员那边会看到），不看截止时间，退课时（pt_void），格子空出来 */
export function coachCancelPtBooking(a: { booking: PtBooking; cards: Card[]; now: Date; reason: string }): { booking: PtBooking; changes: CardChange[] } {
  if (!isPtBookingActive(a.booking)) fail('booking-not-active');
  const reason = (a.reason ?? '').trim();
  if (!reason) fail('pt-reason-required');
  const booking: PtBooking = { ...a.booking, status: 'voided', closedAt: a.now.toISOString(), closeReason: reason };
  return { booking, changes: refund(a.booking, a.cards, 'pt_void') };
}

/** 后台标记一格为线下约的或不接课（任务 30）：只能标空着的格子，跟会员约的冲突时拦下。取消标记直接删掉这条 */
export function markPtSlot(a: SlotArgs & { id: string; hour: number; kind: PtSlotMark['kind']; note?: string; now: Date; rules: PtRules }): PtSlotMark {
  const blocked = slotBlockedBy(a);
  if (blocked) fail(blocked === 'pt-coach-off' ? 'pt-slot-taken' : blocked);
  return { id: a.id, coachId: a.coachId, on: a.on, hour: a.hour, kind: a.kind, ...(a.note ? { note: a.note } : {}) };
}
