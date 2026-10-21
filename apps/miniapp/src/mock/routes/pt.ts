import type { Coach, CoachSlots, MyPtBooking, PtSlotView } from '@climb/api';
import {
  bookPt, cancelPtBooking, isPtBookingActive, ptBookBlockedBy, ptCancelBlockedBy, ptCancelDeadline, ptCardOptions, ptDaySlots, ptSlotStartsAt,
  type Card, type CardChange, type GymRules, type LedgerEntry, type PtBooking,
} from '@climb/core';
import { addDays, type DateKey } from '@climb/utils';
import type { MockCoach, MockDb, MockPtBooking } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

/**
 * 私教：教练列表、时段、约、取消、我的预约。格子状态、冲突、扣退课时、取消截止全按 @climb/core pt.ts，这里只存取数据、记流水。
 * db.ptSlotMarks、db.ptBookings 和后台私教时间轴（mvp/dashboard 任务 29–30）是同一份结构。
 */
export function createPtRoutes(
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
  const coachOf = (id: string) => {
    const c = db.coaches.find(x => x.id === id && x.active);
    if (!c) throw new MockHttpError(404, 'coach-not-found', '没找到这位教练');
    return c;
  };
  const coachView = ({ id, name, tags, bio, storeIds }: MockCoach): Coach => ({ id, name, tags, bio, storeIds });

  /** 课时变了：写卡、记流水（关联到预约） */
  const apply = (changes: CardChange[]) => {
    for (const ch of changes) {
      h.replaceCard(ch.card);
      h.record(ch.card, ch.delta, ch.reason, { type: 'pt_booking', id: ch.bookingId });
    }
  };

  const myView = (b: MockPtBooking): MyPtBooking => {
    const { idempotencyKey: _key, ...booking } = b;
    return {
      ...booking,
      coachName: db.coaches.find(c => c.id === b.coachId)?.name ?? '',
      storeName: db.stores.find(s => s.id === b.storeId)?.name ?? '',
      cardName: db.cards.find(c => c.id === b.cardId)?.name ?? '',
      cancelDeadline: ptCancelDeadline(b, rules()).toISOString(),
      cancelBlockedBy: ptCancelBlockedBy({ booking: b, now: h.now(), rules: rules() }),
    };
  };

  return {
    'GET /coaches': (ctx): Coach[] => db.coaches.filter(c => c.active && (!ctx.query.store || c.storeIds.includes(ctx.query.store))).map(coachView),

    'GET /coaches/:id/slots': (ctx): CoachSlots => {
      const coach = coachOf(ctx.params.id);
      const viewer = ctx.memberId;
      const from = ctx.query.from || h.today();
      const days = Math.min(14, Math.max(1, Number(ctx.query.days) || 7));
      const now = h.now();
      const base = { coachId: coach.id, bookings: db.ptBookings, marks: db.ptSlotMarks };
      return {
        coach: coachView(coach),
        cardBlockedBy: viewer && !ptCardOptions(db.cards, viewer, from).length ? 'pt-no-card' : null,
        days: Array.from({ length: days }, (_, i) => addDays(from, i)).map(on => ({
          on,
          // 只告诉会员能不能约：别人的预约、线下约的、不接课一律是 available: false，不带名字和原因
          slots: ptDaySlots({ ...base, on, now, rules: rules() }).map((slot): PtSlotView => {
            const own = viewer && slot.bookingId ? db.ptBookings.find(b => b.id === slot.bookingId && b.memberId === viewer && isPtBookingActive(b)) : undefined;
            const blocked = viewer
              ? ptBookBlockedBy({ ...base, on, hour: slot.hour, cards: db.cards, memberId: viewer, now, rules: rules() })
              : slot.status === 'free' && !slot.past ? null : 'pt-slot-taken';
            return {
              hour: slot.hour,
              available: !own && (blocked === null || blocked === 'pt-no-card'),
              mine: own ? { bookingId: own.id, status: own.status as 'pending' | 'booked' } : null,
            };
          }),
        })),
      };
    },

    'POST /pt-bookings': (ctx): MyPtBooking => {
      const me = h.requireMember(ctx);
      const body = ctx.body as { coachId: string; storeId: string; on: DateKey; hour: number; cardId?: string; idempotencyKey?: string };
      if (!body.idempotencyKey) throw new MockHttpError(400, 'bad-request', '缺少幂等键');
      // 同一个幂等键约过了：原样返回
      const done = db.ptBookings.find(b => b.memberId === me && b.idempotencyKey === body.idempotencyKey);
      if (done) return myView(done);

      const coach = coachOf(body.coachId);
      if (!coach.storeIds.includes(body.storeId)) throw new MockHttpError(400, 'coach-not-at-store', '这位教练不在这家店上私教');
      // 后端在事务里锁住这位教练这一格（唯一索引兜底），两个人抢同一格只有一个成功
      const { booking, changes } = bookPt({
        id: h.nextId('ptb'), coachId: coach.id, on: body.on, hour: body.hour, storeId: body.storeId,
        bookings: db.ptBookings, marks: db.ptSlotMarks, cards: db.cards, memberId: me, cardId: body.cardId, now: h.now(), rules: rules(),
      });
      const saved: MockPtBooking = { ...booking, idempotencyKey: body.idempotencyKey };
      db.ptBookings.push(saved);
      apply(changes);
      return myView(saved);
    },

    'POST /pt-bookings/:id/cancel': (ctx): MyPtBooking => {
      const me = h.requireMember(ctx);
      const booking = db.ptBookings.find(b => b.id === ctx.params.id && b.memberId === me);
      if (!booking) throw new MockHttpError(404, 'booking-not-found', '没找到这个预约');
      const res = cancelPtBooking({ booking, cards: db.cards, now: h.now(), rules: rules(), by: 'member' });
      db.ptBookings = db.ptBookings.map(b => (b.id === booking.id ? { ...b, ...res.booking } : b));
      apply(res.changes);
      return myView(db.ptBookings.find(b => b.id === booking.id)!);
    },

    'GET /me/pt-bookings': (ctx): MyPtBooking[] => {
      const me = h.requireMember(ctx);
      const now = h.now().getTime();
      const startOf = (b: PtBooking) => ptSlotStartsAt(b.on, b.hour).getTime();
      const upcoming = (b: PtBooking) => isPtBookingActive(b) && startOf(b) > now;
      return db.ptBookings
        .filter(b => b.memberId === me)
        .sort((a, b) => {
          const ua = upcoming(a), ub = upcoming(b);
          if (ua !== ub) return ua ? -1 : 1;
          return ua ? startOf(a) - startOf(b) : startOf(b) - startOf(a);
        })
        .map(myView);
    },
  };
}
