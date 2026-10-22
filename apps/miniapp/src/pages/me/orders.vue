<script setup lang="ts">
import { isPayable, ORDER_CHANNEL_LABELS, ORDER_STATUS_LABELS, type Order } from '@climb/core';
import Button from '@climb/ui-mp/Button.vue';
import Empty from '@climb/ui-mp/Empty.vue';
import { formatListDay, formatYuan, toDateKey } from '@climb/utils';
import { computed, ref } from 'vue';
import { api, pay, run } from '../../api';
import LoadFailed from '../../components/LoadFailed.vue';
import AskSheet from '../../components/AskSheet.vue';
import { ask } from '../../lib/ask';
import { errorMessage, payFailedText } from '../../lib/errors';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

const orders = ref<Order[]>([]);
const loaded = ref(false);
const paying = ref(false);
const now = ref(new Date());

/** 拉失败的原因；没拉到过时显示重试，不显示「还没有订单」 */
const error = ref('');
const goShop = () => uni.navigateTo({ url: '/pages/shop/index' });

async function load() {
  now.value = new Date();
  error.value = '';
  try {
    orders.value = await run(() => api.me.orders(), { loading: loaded.value ? false : '加载中', silent: true });
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loaded.value = true;
  }
}

// 每次显示都重新拉：从确认页取消支付回来、前台开了单都要是新的
useRequireLogin(async () => {
  await member.ensureLoaded().catch(() => {});
  await load();
});

const pad = (n: number) => String(n).padStart(2, '0');
function timeText(iso: string) {
  const d = new Date(iso);
  const day = toDateKey(d);
  return `${formatListDay(day, toDateKey(now.value))} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const rows = computed(() => orders.value.map(o => {
  const payable = isPayable(o, now.value);
  const card = o.cardId ? member.state.cards.find(c => c.id === o.cardId) : undefined;
  return {
    id: o.id,
    name: o.product.name,
    amount: formatYuan(o.amountCents),
    meta: `${timeText(o.createdAt)} · ${ORDER_CHANNEL_LABELS[o.channel]}`,
    status: ORDER_STATUS_LABELS[o.status],
    tone: o.status === 'pending' ? 'todo' : o.status === 'paid' ? 'ok' : 'off',
    payable,
    // 待支付但已经过了付款时限的，后端还没来得及关单，这里当成已关闭
    hint: o.status === 'pending' && !payable ? '超时没付，订单已关闭' : '',
    cardId: card?.id,
  };
}));

function openCard(cardId?: string) {
  if (cardId) uni.navigateTo({ url: `/pages/cards/detail?id=${encodeURIComponent(cardId)}` });
}

const modal = (title: string, content: string) => ask({ title, content, showCancel: false, confirmText: '知道了' });

async function resume(orderId: string) {
  if (paying.value) return;
  paying.value = true;
  try {
    const result = await run(() => pay.resume(orderId), { loading: '加载中' }).catch(() => null);
    if (!result) return void load();
    const outcome = await pay.pay(result).catch(e => {
      modal('支付没成功', payFailedText(e));
      return null;
    });
    if (!outcome || outcome.status === 'cancelled') return;
    await member.refreshCards().catch(() => {});
    if (outcome.status === 'paid') uni.showToast({ title: '付好了，已放进卡包', icon: 'none' });
    else if (outcome.status === 'waiting') modal('付款结果还没回来', '扣了款的话卡会自动到账，稍等一会儿再看；一直没到找前台。');
    else modal('订单已关闭', '超过付款时间了，重新下一单吧。扣了款的话找前台退。');
  } finally {
    paying.value = false;
    await load();
  }
}
</script>

<template>
  <view class="page">
    <view v-for="r in rows" :key="r.id" class="item" @tap="openCard(r.cardId)">
      <view class="line">
        <text class="name">{{ r.name }}</text>
        <text class="amount">{{ r.amount }}</text>
      </view>
      <view class="line">
        <text class="meta">{{ r.meta }}</text>
        <text class="status" :class="r.tone">{{ r.status }}</text>
      </view>
      <text v-if="r.hint" class="meta">{{ r.hint }}</text>
      <view v-if="r.payable" class="pay"><Button variant="primary" mini :disabled="paying" @tap.stop="resume(r.id)">去付款</Button></view>
    </view>
    <LoadFailed v-if="error && !rows.length" :text="error" @retry="load" />
    <Empty v-else-if="loaded && !rows.length" title="还没有订单" text="买过的卡、票都会记在这里。">
      <Button mini @tap="goShop">去购卡</Button>
    </Empty>
    <text v-if="rows.length" class="fine">退款请找前台办理。前台买的卡也会记在这里。</text>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.item { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; padding: 14px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.line { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.name { font-size: 16px; font-weight: 600; }
.amount { font-family: var(--font-number); font-size: 18px; font-weight: 700; }
.meta { font-size: 12px; color: var(--ink-muted); }
.status { font-size: 12px; font-weight: 600; }
.status.todo { color: var(--ink); text-decoration: underline; }
.status.ok { color: var(--ink); }
.status.off { color: var(--ink-muted); }
.pay { display: flex; justify-content: flex-end; margin-top: 4px; }
.fine { display: block; margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
</style>
