import type { CreateOrderResult } from '@climb/api';
import { assertPayable, cardFromProduct, closeIfExpired, createOrder, payOrder, remainingOf, type Card, type GymRules, type LedgerEntry, type Order } from '@climb/core';
import type { DateKey } from '@climb/utils';
import type { MockDb } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

/**
 * 下单和支付：`POST /orders`、`GET /orders/:id`、`POST /orders/:id/pay`、`GET /me/orders`，加上微信调后端的 `POST /pay/wechat/notify`。
 *
 * mock 里没有微信支付：下单返回假的支付参数；「付款」就是调一次 notify（开发面板、测试用 `mock.simulatePayment`）。
 * notify 的 body 是验签解密之后的结果 `{ outTradeNo, transactionId, amountCents }`，outTradeNo 就是订单 id。
 */
export function createOrderRoutes(
  db: MockDb,
  helpers: {
    rules: GymRules;
    now: () => Date;
    today: () => DateKey;
    nextId: (prefix: string) => string;
    requireMember: (ctx: MockContext) => string;
    record: (card: Card, delta: number, reason: LedgerEntry['reason'], ref?: { type: NonNullable<LedgerEntry['refType']>; id: string }) => void;
  },
): MockRoutes {
  const replaceOrder = (order: Order) => {
    db.orders = db.orders.map(o => (o.id === order.id ? order : o));
    return order;
  };

  /** 读订单时顺手把超时的关掉（后端是定时任务关单） */
  const current = (order: Order) => {
    const closed = closeIfExpired(order, helpers.now());
    return closed === order ? order : replaceOrder(closed);
  };

  const paymentOf = (order: Order) => ({
    timeStamp: String(Math.floor(helpers.now().getTime() / 1000)), nonceStr: order.id, package: `prepay_id=mock-${order.id}`, signType: 'RSA' as const, paySign: 'mock',
  });

  const myOrder = (memberId: string, id: string) => {
    const order = db.orders.find(o => o.id === id && o.memberId === memberId);
    if (!order) throw new MockHttpError(404, 'order-not-found', '没找到这个订单');
    return current(order);
  };

  return {
    'POST /orders': (ctx): CreateOrderResult => {
      const me = helpers.requireMember(ctx);
      const { productId } = ctx.body as { productId?: unknown };
      const product = db.products.find(p => p.id === productId);
      if (!product) throw new MockHttpError(404, 'product-not-found', '没找到这个商品');
      const order = createOrder({ id: helpers.nextId('order'), product, memberId: me, channel: 'wechat', now: helpers.now(), rules: helpers.rules });
      db.orders.push(order);
      return { order, payment: paymentOf(order) };
    },

    'GET /orders/:id': ctx => myOrder(helpers.requireMember(ctx), ctx.params.id),

    'POST /orders/:id/pay': (ctx): CreateOrderResult => {
      const order = assertPayable(myOrder(helpers.requireMember(ctx), ctx.params.id), helpers.now());
      return { order, payment: paymentOf(order) };
    },

    'GET /me/orders': ctx => {
      const me = helpers.requireMember(ctx);
      return db.orders.filter(o => o.memberId === me).map(current).reverse();
    },

    'POST /pay/wechat/notify': ctx => {
      const { outTradeNo, transactionId, amountCents } = ctx.body as { outTradeNo: string; transactionId: string; amountCents: number };
      const order = db.orders.find(o => o.id === outTradeNo);
      if (!order) throw new MockHttpError(404, 'order-not-found', '没找到这个订单');
      const { order: paid, issue } = payOrder(order, { at: helpers.now().toISOString(), transactionId, amountCents });
      if (!issue) return paid;
      // 改订单状态和发卡在后端是同一个事务（条件更新 pending → paid 成功才发）
      const card = cardFromProduct({ id: helpers.nextId('card'), product: paid.product, memberId: paid.memberId, cards: db.cards, today: helpers.today() });
      db.cards.push(card);
      helpers.record(card, remainingOf(card) ?? 0, 'purchase', { type: 'order', id: paid.id });
      return replaceOrder({ ...paid, cardId: card.id });
    },
  };
}
