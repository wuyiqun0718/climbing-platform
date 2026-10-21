import type { CheckInPreview, CheckInResult, EntryQrBody } from '@climb/api';
import {
  checkEntryQr, checkInPlan, checkInWith, currentWaiver, entryLedgerDelta, hasSignedWaiver, insuranceForEntry, newEntryQr, newPolicy, useEntryQr,
  type Card, type CheckInArgs, type EntryContext, type GymRules, type LedgerEntry,
} from '@climb/core';
import type { DateKey } from '@climb/utils';
import type { MockCheckIn, MockDb } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

/** 前台平板签发一个入场码（后端的 `GET /desk/qr`）；开发面板和测试用它「模拟扫码」 */
export function issueEntryQr(db: MockDb, storeId: string, now: Date): EntryQrBody {
  if (!db.stores.some(s => s.id === storeId)) throw new Error(`mock 里没有门店 ${storeId}`);
  const qr = newEntryQr({ token: `qr-${++db.seq}-${Math.random().toString(36).slice(2, 8)}`, storeId, now });
  db.entryQrs.push(qr);
  return { storeId, qrToken: qr.token };
}

/**
 * 扫码入场：`POST /check-ins/preview`、`POST /check-ins`。
 * 验码、能用哪些卡、扣几次、要不要投保全按 @climb/core，这里只存取数据。
 */
export function createCheckInRoutes(
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
  const entryContext = (today: DateKey): EntryContext => ({
    today,
    rules: h.rules,
    hasCheckedIn: (memberId, on) => db.checkIns.some(c => c.memberId === memberId && c.on === on),
  });

  /** 码里的门店和 token 对得上一个签发过的码，且没用过、没过期 */
  const validQr = (body: EntryQrBody) => {
    const qr = db.entryQrs.find(q => q.token === body.qrToken && q.storeId === body.storeId);
    if (!qr) throw new MockHttpError(400, 'invalid-qr', '这个码不是本馆的入场码');
    checkEntryQr(qr, h.now());
    return qr;
  };

  /** 当前版本的告知书和这个会员签没签 */
  const waiverOf = (memberId: string) => {
    const current = currentWaiver(db.waiverVersions, h.today());
    return { current, signed: hasSignedWaiver(db.waivers, memberId, current) };
  };

  const storeOf = (storeId: string) => db.stores.find(s => s.id === storeId)!;

  const planArgs = (memberId: string, storeId: string): CheckInArgs => ({
    memberId,
    storeId,
    cards: db.cards.filter(c => c.memberId === memberId),
    past: db.checkIns.filter(c => c.memberId === memberId).map(c => ({ ...c, voided: false })),
    ctx: entryContext(h.today()),
  });

  const resultOf = (ci: MockCheckIn): CheckInResult => {
    const { idempotencyKey: _key, policyId, ...checkIn } = ci;
    return { ...checkIn, storeName: storeOf(ci.storeId).name, policy: db.policies.find(p => p.id === policyId)! };
  };

  return {
    'POST /check-ins/preview': (ctx): CheckInPreview => {
      const me = h.requireMember(ctx);
      const qr = validQr(ctx.body as EntryQrBody);
      const { reentry, options } = checkInPlan(planArgs(me, qr.storeId));
      const waiver = waiverOf(me);
      return {
        store: storeOf(qr.storeId), reentry, options,
        todayPolicy: insuranceForEntry(db.policies, me, h.today()).policy,
        waiver: waiver.signed ? null : waiver.current,
      };
    },

    'POST /check-ins': (ctx): CheckInResult => {
      const me = h.requireMember(ctx);
      const body = ctx.body as EntryQrBody & { cardId: string; idempotencyKey: string };
      if (!body.idempotencyKey) throw new MockHttpError(400, 'bad-request', '缺少幂等键');
      // 同一个幂等键已经入过场：原样返回，不再验码（码已经被这次入场用掉了）
      const done = db.checkIns.find(c => c.memberId === me && c.idempotencyKey === body.idempotencyKey);
      if (done) return resultOf(done);

      const qr = validQr(body);
      const card = db.cards.find(c => c.id === body.cardId && c.memberId === me);
      if (!card) throw new MockHttpError(404, 'card-not-found', '没找到这张卡');
      const today = h.today();
      const waiverSigned = waiverOf(me).signed;
      const { card: updated, deducted, reentry } = checkInWith({ ...planArgs(me, qr.storeId), cardId: card.id, via: 'scan', waiverSigned });

      const id = h.nextId('ci');
      const insurance = insuranceForEntry(db.policies, me, today);
      const policy = insurance.needed ? newPolicy({ id: h.nextId('ip'), memberId: me, storeId: qr.storeId, on: today, checkInId: id }) : insurance.policy;
      if (insurance.needed) db.policies.push(policy);

      db.entryQrs = db.entryQrs.map(q => (q.token === qr.token ? useEntryQr(q, me, h.now()) : q));
      h.replaceCard(updated);
      const checkIn: MockCheckIn = { id, memberId: me, cardId: card.id, storeId: qr.storeId, on: today, deducted, reentry, idempotencyKey: body.idempotencyKey, policyId: policy.id };
      db.checkIns.push(checkIn);
      const delta = entryLedgerDelta(card, updated, deducted);
      if (delta !== null) h.record(updated, delta, 'check_in', { type: 'check_in', id });
      return resultOf(checkIn);
    },
  };
}
