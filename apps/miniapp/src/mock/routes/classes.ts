import type { ClassSessionView, MyClassBooking } from '@climb/api';
import {
  bookClass, cancelBlockedBy, cancelBooking, cancelDeadline, isActiveBooking, sessionSeats, sessionStartsAt, waitlistPosition,
  type Card, type CardChange, type ClassBooking, type ClassSession, type GymRules, type LedgerEntry,
} from '@climb/core';
import { addDays, type DateKey } from '@climb/utils';
import type { MockClassBooking, MockDb } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

/**
 * 团课：课表、约课、取消、我的预约。名额、候补、截止、扣退次全按 @climb/core classes.ts，这里只存取数据、记流水。
 * 课表（db.classSessions）和后台排课（mvp/dashboard 任务 26 `GET /admin/classes`）是同一份 ClassSession。
 */
export function createClassRoutes(
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
  const sessionOf = (id: string) => {
    const s = db.classSessions.find(c => c.id === id);
    if (!s) throw new MockHttpError(404, 'class-not-found', '没找到这节课');
    return s;
  };
  const storeName = (id: string) => db.stores.find(s => s.id === id)?.name ?? '';
  const coachName = (id?: string) => (id ? db.coaches.find(c => c.id === id)?.name ?? null : null);

  /** 卡次数变了：写卡、记流水（关联到预约） */
  const apply = (changes: CardChange[]) => {
    for (const ch of changes) {
      h.replaceCard(ch.card);
      h.record(ch.card, ch.delta, ch.reason, { type: 'class_booking', id: ch.bookingId });
    }
  };
  const saveBookings = (changed: ClassBooking[]) => {
    db.classBookings = db.classBookings.map(b => {
      const next = changed.find(c => c.id === b.id);
      return next ? { ...b, ...next } : b;
    });
  };

  const view = (s: ClassSession, viewer: string | null): ClassSessionView => {
    const mine = viewer ? db.classBookings.find(b => b.sessionId === s.id && b.memberId === viewer && isActiveBooking(b)) : undefined;
    return {
      ...s,
      storeName: storeName(s.storeId),
      coachName: coachName(s.coachId),
      ...sessionSeats(s, db.classBookings),
      myBooking: mine ? { id: mine.id, status: mine.status as 'booked' | 'waitlisted', position: waitlistPosition(mine, db.classBookings) } : null,
    };
  };

  const myView = (b: MockClassBooking): MyClassBooking => {
    const { idempotencyKey: _key, ...booking } = b;
    const s = sessionOf(b.sessionId);
    return {
      ...booking,
      session: {
        id: s.id, name: s.name, storeId: s.storeId, storeName: storeName(s.storeId), coachName: coachName(s.coachId),
        on: s.on, startTime: s.startTime, minutes: s.minutes, status: s.status, cancelReason: s.cancelReason,
      },
      cardName: db.cards.find(c => c.id === b.cardId)?.name ?? '',
      position: waitlistPosition(b, db.classBookings),
      cancelDeadline: cancelDeadline(s, h.rules.classRules).toISOString(),
      cancelBlockedBy: cancelBlockedBy({ booking: b, session: s, now: h.now(), rules: h.rules.classRules }),
    };
  };

  return {
    'GET /classes': (ctx): ClassSessionView[] => {
      const from = ctx.query.from || h.today();
      const days = Math.min(31, Math.max(1, Number(ctx.query.days) || 7));
      const until = addDays(from, days);
      return db.classSessions
        .filter(s => (s.status === 'scheduled' || s.status === 'cancelled') && s.on >= from && s.on < until && (!ctx.query.store || s.storeId === ctx.query.store))
        .sort((a, b) => sessionStartsAt(a).getTime() - sessionStartsAt(b).getTime())
        .map(s => view(s, ctx.memberId));
    },

    'POST /classes/:id/bookings': (ctx): MyClassBooking => {
      const me = h.requireMember(ctx);
      const body = ctx.body as { cardId?: string; idempotencyKey?: string };
      if (!body.idempotencyKey) throw new MockHttpError(400, 'bad-request', '缺少幂等键');
      // 同一个幂等键约过了：原样返回，不再约一次
      const done = db.classBookings.find(b => b.memberId === me && b.idempotencyKey === body.idempotencyKey);
      if (done) return myView(done);

      const session = sessionOf(ctx.params.id);
      // 后端在事务里锁住这节课再算名额
      const { booking, changes } = bookClass({
        id: h.nextId('cb'), session, bookings: db.classBookings, cards: db.cards, memberId: me, cardId: body.cardId, now: h.now(), rules: h.rules.classRules,
      });
      const saved: MockClassBooking = { ...booking, idempotencyKey: body.idempotencyKey };
      db.classBookings.push(saved);
      apply(changes);
      return myView(saved);
    },

    'POST /class-bookings/:id/cancel': (ctx): MyClassBooking => {
      const me = h.requireMember(ctx);
      const booking = db.classBookings.find(b => b.id === ctx.params.id && b.memberId === me);
      if (!booking) throw new MockHttpError(404, 'booking-not-found', '没找到这个预约');
      const res = cancelBooking({
        booking, session: sessionOf(booking.sessionId), bookings: db.classBookings, cards: db.cards, now: h.now(), rules: h.rules.classRules, by: 'member',
      });
      // 取消、候补补位、退次和补位扣次：后端在同一个事务里做
      saveBookings([res.booking, ...res.promoted]);
      apply(res.changes);
      return myView(db.classBookings.find(b => b.id === booking.id)!);
    },

    'GET /me/class-bookings': (ctx): MyClassBooking[] => {
      const me = h.requireMember(ctx);
      const now = h.now().getTime();
      const startOf = (b: ClassBooking) => sessionStartsAt(sessionOf(b.sessionId)).getTime();
      // 还没开课、占着名额的排前面（最近的在前）；其余（上过的、取消的）按开课时间倒序
      const upcoming = (b: ClassBooking) => isActiveBooking(b) && startOf(b) > now;
      return db.classBookings
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
