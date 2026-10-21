import type { Api, CreateOrderResult, WxPayParams } from '@climb/api';
import { closeIfExpired, type Order } from '@climb/core';

/** 拉起支付后用户那边的结果：付了，或者自己关掉了。别的失败（签名错、网络）直接抛出 */
export type PromptResult = 'ok' | 'cancel';

export interface PayDeps {
  orders: Pick<Api['orders'], 'create' | 'get'>;
  /** 小程序里是 `uni.requestPayment`；mock 下弹一个「模拟支付」确认 */
  requestPayment(payment: WxPayParams, order: Order): Promise<PromptResult>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** 付完以后查几次订单、隔多久；默认每秒一次查 8 次 */
  pollTimes?: number;
  pollIntervalMs?: number;
}

/**
 * - paid：卡发了
 * - cancelled：用户没付，订单还是待支付，可以接着付
 * - waiting：用户付了，但回调一直没到，订单还是待支付（卡晚点会到）
 * - closed：订单已经超时关了
 */
export type PayOutcome = { status: 'paid' | 'cancelled' | 'waiting' | 'closed'; order: Order };

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * 下单 → 拉起支付 → 查订单结果。卡只认后端的订单状态（回调验证过才发卡），不看 requestPayment 的 success。
 * 页面上同一个商品取消后再点支付，接着付上一个没过期的订单，不重复下单。
 */
export function createPay(deps: PayDeps) {
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? defaultSleep;
  const times = deps.pollTimes ?? 8;
  const interval = deps.pollIntervalMs ?? 1000;

  /** 查到不是待支付为止；查满次数还是待支付就返回最后一次的结果 */
  async function poll(orderId: string): Promise<Order> {
    let order = await deps.orders.get(orderId);
    for (let i = 1; i < times && order.status === 'pending'; i++) {
      await sleep(interval);
      order = await deps.orders.get(orderId);
    }
    return order;
  }

  const outcomeOf = (order: Order): PayOutcome['status'] =>
    order.status === 'paid' ? 'paid' : order.status === 'closed' ? 'closed' : 'waiting';

  /** prev 是上次没付的订单：同一个商品、还没超时就接着付它 */
  function reusable(prev: CreateOrderResult | null, productId: string): prev is CreateOrderResult {
    return !!prev && prev.order.product.id === productId && closeIfExpired(prev.order, now()).status === 'pending';
  }

  return {
    reusable,

    /** 下单（或沿用 prev），返回订单和支付参数；页面要先存下来，取消后再点支付时传回 prev */
    async order(productId: string, prev: CreateOrderResult | null): Promise<CreateOrderResult> {
      return reusable(prev, productId) ? prev : deps.orders.create({ productId });
    },

    /** 拉起支付并等结果 */
    async pay({ order, payment }: CreateOrderResult): Promise<PayOutcome> {
      const r = await deps.requestPayment(payment, order);
      if (r === 'cancel') {
        // 有可能刚好超时关了，查一下再说
        const latest = await deps.orders.get(order.id).catch(() => order);
        return { status: latest.status === 'pending' ? 'cancelled' : outcomeOf(latest), order: latest };
      }
      const latest = await poll(order.id);
      return { status: outcomeOf(latest), order: latest };
    },
  };
}

export type Pay = ReturnType<typeof createPay>;

/** uni.requestPayment 的 fail：用户自己取消的 errMsg 里带 cancel */
export const isPayCancel = (err: unknown) => /cancel/i.test(String((err as { errMsg?: unknown } | null)?.errMsg ?? ''));
