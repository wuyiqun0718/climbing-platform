import { addDays, fromDateKey, isDateKey, type DateKey } from '@climb/utils';
import { cancelSession, fillFromWaitlist, sessionSeats, sessionStartsAt, type CardChange, type ClassBooking, type ClassSession, type ClassType } from './classes';
import { CLASS_CAPACITY_MAX, sessionFromType } from './classTypes';
import { ledgerOnOf } from './ledgerCheck';
import { RuleError, type RuleErrorCode } from './rules';
import type { Card, LedgerEntry } from './types';

/**
 * 后台团课排期（任务 26）：加一节课、改时间人数教练、复制上周课表、取消一节课。课表就是小程序约课看的同一份 ClassSession。
 * 约课、取消预约、候补补位、岩馆取消一节课的退次规则都在 classes.ts（跟小程序分支完全一致），这里只管排课，取消直接调 cancelSession。
 *
 * 已定：
 * - 排课从课程种类拷课名、时长、人数上限、扣次、默认教练（classTypes.ts 的 sessionFromType），停用的种类不能排。
 * - 同一位教练、同一家门店，同一时间不能有两节没取消的课（时间段 [开始, 开始 + 时长) 有交集就算重叠）。
 * - 已经开始的课不能改时间；新排、改到的时间要在现在之后；一节课要在当天 24:00 前结束。
 * - 人数上限不能少于已经约上的人数；调大了按候补先后自动补上（fillFromWaitlist，扣次）。
 * - 取消一节课必须写原因；已约的全部退次（流水 class_void），候补的作废。
 * - 复制上周课表：上周没取消的课挪到这周同一天同一时间，人数上限、教练照上周；种类停用了、跟这周已有的课冲突、时间已经过了的跳过。
 */

export const CLASS_DAY_END_MINUTES = 24 * 60;

export const CLASS_SCHEDULE_TEXT: Partial<Record<RuleErrorCode, string>> = {
  'class-time-invalid': '时间不对：日期、开始时间要填对，一节课要在当天 24:00 前结束',
  'class-coach-busy': '这位教练这个时间已经有课了',
  'class-store-busy': '这家店这个时间已经有课了',
  'class-time-locked': '这节课已经开始了，不能改时间',
  'class-started': '这个时间已经过了',
  'class-cancelled': '这节课已经取消了',
  'class-type-inactive': '这个课程已经停用，不能再排新课',
  'reason-required': '要写原因',
};

const fail = (code: RuleErrorCode, message = CLASS_SCHEDULE_TEXT[code] ?? code): never => {
  throw new RuleError(code, message);
};

/** HH:mm，00:00–23:59 */
export const isClockTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

const minutesOfDay = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** 日期、开始时间、时长合不合法（当天 24:00 前结束） */
export function sessionTimeValid(s: Pick<ClassSession, 'on' | 'startTime' | 'minutes'>): boolean {
  return isDateKey(s.on) && isClockTime(s.startTime) && minutesOfDay(s.startTime) + s.minutes <= CLASS_DAY_END_MINUTES;
}

/** 两节课时间有没有重叠：同一天，[开始, 开始 + 时长) 有交集 */
export function sessionsOverlap(a: Pick<ClassSession, 'on' | 'startTime' | 'minutes'>, b: Pick<ClassSession, 'on' | 'startTime' | 'minutes'>): boolean {
  if (a.on !== b.on) return false;
  const as = minutesOfDay(a.startTime);
  const bs = minutesOfDay(b.startTime);
  return as < bs + b.minutes && bs < as + a.minutes;
}

/** 跟别的没取消的课冲突：先看教练，再看门店。session 自己（同 id）不算 */
export function scheduleConflict(session: ClassSession, sessions: readonly ClassSession[]): { code: 'class-coach-busy' | 'class-store-busy'; with: ClassSession } | null {
  const others = sessions.filter(s => s.id !== session.id && s.status !== 'cancelled' && sessionsOverlap(s, session));
  const coach = session.coachId ? others.find(s => s.coachId === session.coachId) : undefined;
  if (coach) return { code: 'class-coach-busy', with: coach };
  const store = others.find(s => s.storeId === session.storeId);
  if (store) return { code: 'class-store-busy', with: store };
  return null;
}

function checkTimeAndConflict(session: ClassSession, sessions: readonly ClassSession[], now: Date) {
  if (!sessionTimeValid(session)) fail('class-time-invalid');
  if (sessionStartsAt(session).getTime() <= now.getTime()) fail('class-started');
  const c = scheduleConflict(session, sessions);
  if (c) fail(c.code, `${CLASS_SCHEDULE_TEXT[c.code]}（${c.with.name} ${c.with.startTime}）`);
}

/** 加一节课：按种类拷贝，查时间和冲突。sessions 是现有的课（至少要含同一天的） */
export function planSession(args: {
  type: ClassType;
  id: string;
  storeId: string;
  on: DateKey;
  startTime: string;
  capacity?: number;
  coachId?: string;
  sessions: readonly ClassSession[];
  now: Date;
}): ClassSession {
  const { type, sessions, now, ...rest } = args;
  const session = sessionFromType(type, rest);
  checkTimeAndConflict(session, sessions, now);
  return session;
}

/** 改一节课：日期、开始时间、人数上限、教练（coachId 传 null 去掉）。课名、时长、扣次排课时定了，不改 */
export interface SessionPatch {
  on?: DateKey;
  startTime?: string;
  capacity?: number;
  coachId?: string | null;
}

/**
 * 改一节课。取消了的不能改；改时间要课还没开始、新时间在现在之后、不冲突；人数上限不少于已约上的；
 * 调大了按候补先后补上（返回 promoted 和要记的流水 changes，同 classes.ts）。
 */
export function rescheduleSession(args: {
  session: ClassSession;
  patch: SessionPatch;
  sessions: readonly ClassSession[];
  bookings: ClassBooking[];
  cards: Card[];
  now: Date;
}): { session: ClassSession; promoted: ClassBooking[]; changes: CardChange[] } {
  const { session, patch, sessions, bookings, cards, now } = args;
  if (session.status === 'cancelled') fail('class-cancelled');
  const next: ClassSession = { ...session };
  if (patch.on !== undefined) next.on = patch.on;
  if (patch.startTime !== undefined) next.startTime = patch.startTime;
  if (patch.capacity !== undefined) next.capacity = patch.capacity;
  if (patch.coachId === null) delete next.coachId;
  else if (patch.coachId !== undefined) next.coachId = patch.coachId;

  const timeChanged = next.on !== session.on || next.startTime !== session.startTime;
  if (timeChanged && sessionStartsAt(session).getTime() <= now.getTime()) fail('class-time-locked');
  if (timeChanged) checkTimeAndConflict(next, sessions, now);
  else if (next.coachId !== session.coachId) {
    const c = scheduleConflict(next, sessions);
    if (c?.code === 'class-coach-busy') fail(c.code, `${CLASS_SCHEDULE_TEXT[c.code]}（${c.with.name} ${c.with.startTime}）`);
  }
  const { booked } = sessionSeats(session, bookings);
  if (next.capacity < booked) fail('class-full', `已经约了 ${booked} 人，人数上限不能比这少`);

  const filled = next.capacity > session.capacity ? fillFromWaitlist({ session: next, bookings, cards, now }) : { bookings: [], changes: [] };
  return { session: next, promoted: filled.bookings, changes: filled.changes };
}

/** 后台取消一节课：原因必填，退次、候补作废都按 classes.ts 的 cancelSession（跟小程序同一份） */
export function staffCancelSession(args: { session: ClassSession; bookings: ClassBooking[]; cards: Card[]; reason: string; now: Date }) {
  const reason = args.reason.trim();
  if (!reason) fail('reason-required', '取消一节课要写原因');
  return cancelSession({ ...args, reason });
}

/** 这一周的周一（周一到周日算一周） */
export function weekStartOf(on: DateKey): DateKey {
  const day = fromDateKey(on).getDay();
  return addDays(on, day === 0 ? -6 : 1 - day);
}

export const isWeekStart = (v: unknown): v is DateKey => isDateKey(v) && weekStartOf(v) === v;

/**
 * 复制上周课表到 week 这一周（周一）。lastWeek 是上周要复制的课（调用方按门店筛好），sessions 是现有的全部课。
 * 每节按上周的星期几、开始时间、人数上限、教练，用现在的课程种类重新排（sessionFromType）；
 * 上周的教练不在 coachIds 里（停用了）就换成课程的默认教练，默认教练也停用了就不带教练。
 * 跳过的给原因：种类停用或没了（class-type-inactive）、冲突（class-coach-busy / class-store-busy）、时间过了（class-started）。
 */
export function copyWeek(args: {
  week: DateKey;
  lastWeek: readonly ClassSession[];
  types: readonly ClassType[];
  sessions: readonly ClassSession[];
  coachIds: readonly string[];
  newId: (i: number) => string;
  now: Date;
}): { created: ClassSession[]; skipped: { sessionId: string; code: RuleErrorCode }[] } {
  const { week, types, coachIds, now } = args;
  const from = addDays(week, -7);
  const source = args.lastWeek
    .filter(s => s.status !== 'cancelled' && s.on >= from && s.on < week)
    .sort((a, b) => sessionStartsAt(a).getTime() - sessionStartsAt(b).getTime() || a.id.localeCompare(b.id));
  const created: ClassSession[] = [];
  const skipped: { sessionId: string; code: RuleErrorCode }[] = [];
  for (const s of source) {
    const type = types.find(t => t.id === s.classTypeId);
    if (!type || !type.active) {
      skipped.push({ sessionId: s.id, code: 'class-type-inactive' });
      continue;
    }
    try {
      const active = (id?: string) => (id && coachIds.includes(id) ? id : undefined);
      const coachId = active(s.coachId) ?? active(type.coachId);
      const next = planSession({
        type, id: args.newId(created.length), storeId: s.storeId, on: addDays(s.on, 7), startTime: s.startTime,
        capacity: Math.min(s.capacity, CLASS_CAPACITY_MAX), coachId, sessions: [...args.sessions, ...created], now,
      });
      // 上周的教练和课程的默认教练都停用了：不带教练
      if (!active(next.coachId)) delete next.coachId;
      created.push(next);
    } catch (e) {
      if (!(e instanceof RuleError)) throw e;
      skipped.push({ sessionId: s.id, code: e.code });
    }
  }
  return { created, skipped };
}

/** 课包次数变化（CardChange，约课、取消、团课取消）记的流水，关联到预约 */
export function classLedgerEntry(args: { id: string; change: CardChange; at: string; operator: Pick<LedgerEntry, 'operatorType' | 'operatorId'>; note?: string }): LedgerEntry {
  const { change } = args;
  return {
    id: args.id,
    cardId: change.card.id,
    at: args.at,
    on: ledgerOnOf(args.at),
    delta: change.delta,
    remainingAfter: change.card.remaining,
    expiresOnAfter: change.card.expiresOn,
    reason: change.reason,
    refType: 'class_booking',
    refId: change.bookingId,
    ...args.operator,
    note: args.note ?? '',
  };
}
