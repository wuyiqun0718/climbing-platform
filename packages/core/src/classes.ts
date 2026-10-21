import type { DateKey } from '@climb/utils';
import type { ClassRules } from './gym';
import { isCardNormal, RuleError, type RuleErrorCode } from './rules';
import type { Card, LedgerReason, LessonCard } from './types';

/**
 * 团课：课程种类 → 排出来的一节节课 → 会员的预约。小程序（任务 28–30）和后台（mvp/dashboard 任务 25–27）共用这里的类型和规则。
 * 约课扣团课课包（LessonCard kind = 'class'）的次数；规则里等馆方定的都在 GymRules.classRules。
 * 函数都不改入参，返回改好的预约、卡和要记的流水（CardChange），调用方在同一个事务里写库、写流水。
 */

/** 团课课程种类（后台任务 25 建）：比如「入门抱石」。排课时把人数上限、时长拷到 ClassSession，改种类不影响已排的课 */
export interface ClassType {
  id: string;
  name: string;
  /** 一节课多少分钟 */
  minutes: number;
  /** 默认人数上限 */
  capacity: number;
  /** 约一节扣团课课包几次（默认 1） */
  credits: number;
  /** 默认教练（员工 id） */
  coachId?: string;
  /** 停用后不能再排新课，已排的照常上 */
  active: boolean;
}

/** 一节课的状态：scheduled 正常；cancelled 被岩馆取消（已约的全部退次） */
export type ClassSessionStatus = 'scheduled' | 'cancelled';

/** 排出来的一节课（后台任务 26 排）。时间是门店当地时间 */
export interface ClassSession {
  id: string;
  classTypeId: string;
  /** 课名，排课时从 ClassType 拷过来 */
  name: string;
  storeId: string;
  on: DateKey;
  /** 开始时间 HH:mm */
  startTime: string;
  minutes: number;
  capacity: number;
  credits: number;
  coachId?: string;
  status: ClassSessionStatus;
  /** 岩馆取消时填的原因 */
  cancelReason?: string;
}

/**
 * 预约的状态：
 * - booked：约上了，已经扣了次数
 * - waitlisted：满员排候补，还没扣次；有人取消时按排队先后自动补上（变 booked 并扣次）
 * - cancelled：会员自己或前台取消；booked 的取消在截止前退次，候补的取消不涉及次数
 * - voided：这节课被岩馆取消，booked 的退次
 * - attended：上课签到了（后台任务 27）
 * - absent：没来或迟到超过 lateGraceMinutes，次数不退
 */
export type ClassBookingStatus = 'booked' | 'waitlisted' | 'cancelled' | 'voided' | 'attended' | 'absent';

/** 会员约一节课的一条记录。同一会员同一节课只能有一条占位（booked / waitlisted） */
export interface ClassBooking {
  id: string;
  sessionId: string;
  memberId: string;
  status: ClassBookingStatus;
  /** 扣次用的课包；候补时记会员选的那张，补上时它不能用了就换一张能用的 */
  cardId: string;
  /** 下单时间（ISO），候补按它排队 */
  createdAt: string;
  /** 实际扣了几次；取消、课程取消按它退 */
  deducted: number;
  /** 取消、作废的时间（ISO） */
  closedAt?: string;
}

/** 卡次数的一次变化：调用方据此写卡、记流水（ledgerEntry，ref 为 class_booking） */
export interface CardChange {
  card: LessonCard;
  delta: number;
  reason: Extract<LedgerReason, 'class_book' | 'class_cancel' | 'class_void'>;
  bookingId: string;
}

/** 占着名额或候补位的预约 */
export const isActiveBooking = (b: ClassBooking) => b.status === 'booked' || b.status === 'waitlisted';

/** 开课时间。DateKey + HH:mm 按本地时间解析 */
export function sessionStartsAt(s: Pick<ClassSession, 'on' | 'startTime'>): Date {
  return new Date(`${s.on}T${s.startTime}:00`);
}

/** 自助取消截止时间：开课前 classRules.cancelBeforeMinutes 分钟 */
export function cancelDeadline(s: Pick<ClassSession, 'on' | 'startTime'>, rules: ClassRules): Date {
  return new Date(sessionStartsAt(s).getTime() - rules.cancelBeforeMinutes * 60_000);
}

/** 签到时算不算迟到缺席：开课后超过 lateGraceMinutes 分钟 */
export function isLateForClass(s: Pick<ClassSession, 'on' | 'startTime'>, at: Date, rules: ClassRules): boolean {
  return at.getTime() > sessionStartsAt(s).getTime() + rules.lateGraceMinutes * 60_000;
}

/** 这节课已约、候补各几人，还剩几个名额 */
export function sessionSeats(session: ClassSession, bookings: ClassBooking[]) {
  const mine = bookings.filter(b => b.sessionId === session.id);
  const booked = mine.filter(b => b.status === 'booked' || b.status === 'attended' || b.status === 'absent').length;
  const waitlisted = mine.filter(b => b.status === 'waitlisted').length;
  return { booked, waitlisted, left: Math.max(0, session.capacity - booked) };
}

/** 这张卡能不能约这节课：团课课包、状态正常、上课那天没过期、次数够 */
export function isClassCardUsable(card: Card, memberId: string, session: ClassSession): card is LessonCard {
  return card.kind === 'class' && card.memberId === memberId && isCardNormal(card) && card.expiresOn >= session.on && card.remaining >= session.credits;
}

/** 能用来约这节课的课包：先到期的排前面 */
export function classCardOptions(cards: Card[], memberId: string, session: ClassSession): LessonCard[] {
  return cards
    .filter((c): c is LessonCard => isClassCardUsable(c, memberId, session))
    .sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : a.expiresOn > b.expiresOn ? 1 : 0));
}

const TEXT: Partial<Record<RuleErrorCode, string>> = {
  'class-cancelled': '这节课已经取消了',
  'class-started': '这节课已经开始了',
  'class-already-booked': '这节课你已经约了',
  'class-no-card': '没有能用的团课课包，先买一个',
  'class-full': '这节课约满了',
  'class-waitlist-full': '这节课约满了，候补也排满了',
  'class-cancel-too-late': '离开课太近了，不能自己取消，找前台帮你处理',
  'booking-not-active': '这个预约已经取消或者上过课了',
};
const fail = (code: RuleErrorCode): never => { throw new RuleError(code, TEXT[code]!); };

const deduct = (card: LessonCard, n: number): LessonCard => ({ ...card, remaining: card.remaining - n });
const giveBack = (card: LessonCard, n: number): LessonCard => ({ ...card, remaining: card.remaining + n });

/** 约课前检查；能约（或能排候补）为 null */
export function bookBlockedBy(args: { session: ClassSession; bookings: ClassBooking[]; cards: Card[]; memberId: string; now: Date; rules: ClassRules }): RuleErrorCode | null {
  const { session, bookings, cards, memberId, now, rules } = args;
  if (session.status === 'cancelled') return 'class-cancelled';
  if (now.getTime() >= sessionStartsAt(session).getTime()) return 'class-started';
  if (bookings.some(b => b.sessionId === session.id && b.memberId === memberId && isActiveBooking(b))) return 'class-already-booked';
  if (!classCardOptions(cards, memberId, session).length) return 'class-no-card';
  const seats = sessionSeats(session, bookings);
  if (seats.left > 0) return null;
  if (!rules.waitlist) return 'class-full';
  if (rules.waitlistMax !== null && seats.waitlisted >= rules.waitlistMax) return 'class-waitlist-full';
  return null;
}

/**
 * 约课：有名额就约上并扣次（class_book），满员按规则排候补（不扣次）。
 * cardId 不填用最先到期的能用课包。后端在事务里锁住这节课再算名额，免得超卖。
 */
export function bookClass(args: {
  id: string; session: ClassSession; bookings: ClassBooking[]; cards: Card[]; memberId: string; cardId?: string; now: Date; rules: ClassRules;
}): { booking: ClassBooking; changes: CardChange[] } {
  const { id, session, bookings, cards, memberId, now } = args;
  const blocked = bookBlockedBy(args);
  if (blocked) fail(blocked);
  const options = classCardOptions(cards, memberId, session);
  const card = args.cardId ? options.find(c => c.id === args.cardId) : options[0];
  if (!card) fail('class-no-card');
  const base = { id, sessionId: session.id, memberId, cardId: card!.id, createdAt: now.toISOString() };
  if (sessionSeats(session, bookings).left <= 0) return { booking: { ...base, status: 'waitlisted', deducted: 0 }, changes: [] };
  const booking: ClassBooking = { ...base, status: 'booked', deducted: session.credits };
  return { booking, changes: [{ card: deduct(card!, session.credits), delta: -session.credits, reason: 'class_book', bookingId: id }] };
}

/** 会员自己能不能取消这个预约：候补开课前都能取消；约上的要在截止时间前 */
export function cancelBlockedBy(args: { booking: ClassBooking; session: ClassSession; now: Date; rules: ClassRules }): RuleErrorCode | null {
  const { booking, session, now, rules } = args;
  if (!isActiveBooking(booking)) return 'booking-not-active';
  if (session.status === 'cancelled') return 'class-cancelled';
  if (now.getTime() >= sessionStartsAt(session).getTime()) return 'class-started';
  if (booking.status === 'booked' && now.getTime() > cancelDeadline(session, rules).getTime()) return 'class-cancel-too-late';
  return null;
}

/**
 * 候补补位：空出名额时按排队先后补上，扣次（class_book）。补到的人没有能用的课包就跳过，留在候补里。
 * 开课后、课程取消后不补。
 */
export function fillFromWaitlist(args: { session: ClassSession; bookings: ClassBooking[]; cards: Card[]; now: Date }): { bookings: ClassBooking[]; changes: CardChange[] } {
  const { session, now } = args;
  let bookings = args.bookings;
  let cards = args.cards;
  const changes: CardChange[] = [];
  if (session.status === 'cancelled' || now.getTime() >= sessionStartsAt(session).getTime()) return { bookings: [], changes };
  const queue = bookings
    .filter(b => b.sessionId === session.id && b.status === 'waitlisted')
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
  const promoted: ClassBooking[] = [];
  for (const w of queue) {
    if (sessionSeats(session, bookings).left <= 0) break;
    const options = classCardOptions(cards, w.memberId, session);
    const card = options.find(c => c.id === w.cardId) ?? options[0];
    if (!card) continue;
    const after = deduct(card, session.credits);
    const booked: ClassBooking = { ...w, status: 'booked', cardId: card.id, deducted: session.credits };
    bookings = bookings.map(b => (b.id === w.id ? booked : b));
    cards = cards.map(c => (c.id === card.id ? after : c));
    promoted.push(booked);
    changes.push({ card: after, delta: -session.credits, reason: 'class_book', bookingId: w.id });
  }
  return { bookings: promoted, changes };
}

/**
 * 取消预约。by = 'member' 时按截止时间拦；'staff'（前台帮取消，后台任务 27）不受截止限制，照样退次。
 * 约上的退回扣的次数（class_cancel），空出的名额由候补第一位补上（返回在 promoted / changes 里）。
 */
export function cancelBooking(args: {
  booking: ClassBooking; session: ClassSession; bookings: ClassBooking[]; cards: Card[]; now: Date; rules: ClassRules; by: 'member' | 'staff';
}): { booking: ClassBooking; promoted: ClassBooking[]; changes: CardChange[] } {
  const { booking, session, cards, now, rules, by } = args;
  const blocked = cancelBlockedBy({ booking, session, now, rules });
  if (blocked && !(by === 'staff' && blocked === 'class-cancel-too-late')) fail(blocked);
  const cancelled: ClassBooking = { ...booking, status: 'cancelled', closedAt: now.toISOString() };
  const changes: CardChange[] = [];
  let cardsAfter = cards;
  if (booking.status === 'booked' && booking.deducted > 0) {
    const card = cards.find((c): c is LessonCard => c.id === booking.cardId && c.kind === 'class');
    if (card) {
      const back = giveBack(card, booking.deducted);
      cardsAfter = cards.map(c => (c.id === card.id ? back : c));
      changes.push({ card: back, delta: booking.deducted, reason: 'class_cancel', bookingId: booking.id });
    }
  }
  const bookings = args.bookings.map(b => (b.id === booking.id ? cancelled : b));
  const filled = booking.status === 'booked' ? fillFromWaitlist({ session, bookings, cards: cardsAfter, now }) : { bookings: [], changes: [] };
  return { booking: cancelled, promoted: filled.bookings, changes: [...changes, ...filled.changes] };
}

/** 岩馆取消一节课（后台任务 26）：约上的全部退次（class_void），候补的直接作废 */
export function cancelSession(args: { session: ClassSession; bookings: ClassBooking[]; cards: Card[]; reason: string; now: Date }): {
  session: ClassSession; bookings: ClassBooking[]; changes: CardChange[];
} {
  const { session, reason, now } = args;
  if (session.status === 'cancelled') fail('class-cancelled');
  let cards = args.cards;
  const changes: CardChange[] = [];
  const voided: ClassBooking[] = [];
  for (const b of args.bookings) {
    if (b.sessionId !== session.id || !isActiveBooking(b)) continue;
    voided.push({ ...b, status: 'voided', closedAt: now.toISOString() });
    const card = b.status === 'booked' && b.deducted > 0 ? cards.find((c): c is LessonCard => c.id === b.cardId && c.kind === 'class') : undefined;
    if (!card) continue;
    const back = giveBack(card, b.deducted);
    cards = cards.map(c => (c.id === card.id ? back : c));
    changes.push({ card: back, delta: b.deducted, reason: 'class_void', bookingId: b.id });
  }
  return { session: { ...session, status: 'cancelled', cancelReason: reason }, bookings: voided, changes };
}
