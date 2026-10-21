import type { CoachSchedule, CoachSlotView } from '@climb/api';
import {
  coachCancelPtBooking, confirmPtBooking, markPtSlot, ptDaySlots,
  type Card, type CardChange, type GymRules, type LedgerEntry, type PtSlotMark,
} from '@climb/core';
import { addDays, type DateKey } from '@climb/utils';
import type { MockCoach, MockDb } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

/**
 * 这个会员是不是本馆在用的教练：员工账号的手机号跟会员验证过的手机号一样（后端按员工表查）。
 * 是就返回教练，`GET /me` 的 coach 和 `/coach/*` 的身份判断都用它。
 */
export function coachOfMember(db: MockDb, memberId: string): { id: string; name: string } | null {
  const phone = db.members.find(m => m.id === memberId)?.phone;
  const coach = phone ? db.coaches.find(c => c.active && c.phone === phone) : undefined;
  return coach ? { id: coach.id, name: coach.name } : null;
}

/**
 * 教练端「我的排班」：`/coach/*`。只有教练本人能调，只能动自己的格子和自己的预约。
 * 占格、确认、取消全按 @climb/core pt.ts；格子和预约跟会员约私教（routes/pt.ts）、后台私教时间轴是同一份数据。
 */
export function createCoachRoutes(
  db: MockDb,
  h: {
    rules: GymRules;
    now: () => Date;
    today: () => DateKey;
    nextId: (prefix: string) => string;
    requireMember: (ctx: MockContext) => string;
    replaceCard: (card: Card) => void;
    record: (card: Card, delta: number, reason: LedgerEntry['reason'], ref?: { type: NonNullable<LedgerEntry['refType']>; id: string }) => void;
  },
): MockRoutes {
  const rules = () => h.rules.ptRules;

  const requireCoach = (ctx: MockContext): MockCoach => {
    const me = h.requireMember(ctx);
    const c = coachOfMember(db, me);
    if (!c) throw new MockHttpError(403, 'not-coach', '只有教练能用');
    return db.coaches.find(x => x.id === c.id)!;
  };

  /** 自己的预约；别的教练的当作没有 */
  const myBooking = (coach: MockCoach, id: string) => {
    const b = db.ptBookings.find(x => x.id === id && x.coachId === coach.id);
    if (!b) throw new MockHttpError(404, 'booking-not-found', '没找到这个预约');
    return b;
  };

  const bookingView = (id: string): CoachSlotView['booking'] => {
    const b = db.ptBookings.find(x => x.id === id);
    if (!b) return null;
    return {
      id: b.id,
      memberName: db.members.find(m => m.id === b.memberId)?.name ?? '',
      status: b.status as 'pending' | 'booked' | 'attended' | 'absent',
      storeName: db.stores.find(s => s.id === b.storeId)?.name ?? '',
    };
  };

  const apply = (changes: CardChange[]) => {
    for (const ch of changes) {
      h.replaceCard(ch.card);
      h.record(ch.card, ch.delta, ch.reason, { type: 'pt_booking', id: ch.bookingId });
    }
  };

  return {
    'GET /coach/schedule': (ctx): CoachSchedule => {
      const coach = requireCoach(ctx);
      const from = ctx.query.from || h.today();
      const days = Math.min(14, Math.max(1, Number(ctx.query.days) || 7));
      const now = h.now();
      return {
        coach: { id: coach.id, name: coach.name },
        needConfirm: rules().needCoachConfirm,
        pendingCount: db.ptBookings.filter(b => b.coachId === coach.id && b.status === 'pending').length,
        days: Array.from({ length: days }, (_, i) => addDays(from, i)).map(on => ({
          on,
          slots: ptDaySlots({ coachId: coach.id, on, bookings: db.ptBookings, marks: db.ptSlotMarks, now, rules: rules() }).map(slot => {
            const mark = slot.markId ? db.ptSlotMarks.find(m => m.id === slot.markId) : undefined;
            return {
              ...slot,
              booking: slot.bookingId ? bookingView(slot.bookingId) : null,
              mark: mark ? { id: mark.id, kind: mark.kind, note: mark.note } : null,
            };
          }),
        })),
      };
    },

    'POST /coach/slots': (ctx): PtSlotMark => {
      const coach = requireCoach(ctx);
      const body = ctx.body as { on: DateKey; hour: number; kind: PtSlotMark['kind']; note?: string };
      if (body.kind !== 'offline' && body.kind !== 'off') throw new MockHttpError(400, 'bad-request', '占格类型不对');
      // 只能占自己的格子：coachId 取登录的教练，不看请求里传的
      const mark = markPtSlot({
        id: h.nextId('ptm'), coachId: coach.id, on: body.on, hour: body.hour, kind: body.kind, note: body.note?.trim() || undefined,
        bookings: db.ptBookings, marks: db.ptSlotMarks, now: h.now(), rules: rules(),
      });
      db.ptSlotMarks.push(mark);
      return mark;
    },

    'DELETE /coach/slots/:id': (ctx): null => {
      const coach = requireCoach(ctx);
      const mark = db.ptSlotMarks.find(m => m.id === ctx.params.id && m.coachId === coach.id);
      if (!mark) throw new MockHttpError(404, 'mark-not-found', '没找到这个占用');
      db.ptSlotMarks = db.ptSlotMarks.filter(m => m.id !== mark.id);
      return null;
    },

    'POST /coach/pt-bookings/:id/confirm': (ctx): CoachSlotView['booking'] => {
      const coach = requireCoach(ctx);
      const booking = myBooking(coach, ctx.params.id);
      const confirmed = confirmPtBooking(booking);
      db.ptBookings = db.ptBookings.map(b => (b.id === booking.id ? { ...b, ...confirmed } : b));
      return bookingView(booking.id);
    },

    'POST /coach/pt-bookings/:id/cancel': (ctx): null => {
      const coach = requireCoach(ctx);
      const booking = myBooking(coach, ctx.params.id);
      const { reason } = ctx.body as { reason?: string };
      const res = coachCancelPtBooking({ booking, cards: db.cards, now: h.now(), reason: reason ?? '' });
      db.ptBookings = db.ptBookings.map(b => (b.id === booking.id ? { ...b, ...res.booking } : b));
      apply(res.changes);
      return null;
    },
  };
}
