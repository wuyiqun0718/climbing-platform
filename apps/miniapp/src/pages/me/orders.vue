<script setup lang="ts">
import { ApiError } from '@climb/api';
import { isPayable, ORDER_CHANNEL_LABELS, ORDER_STATUS_LABELS, type Order } from '@climb/core';
import { formatMonthDay, formatYuan, toDateKey } from '@climb/utils';
import { computed, ref } from 'vue';
import { api, pay, run } from '../../api';
import { errorMessage } from '../../lib/errors';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

const orders = ref<Order[]>([]);
const loaded = ref(false);
const paying = ref(false);
const now = ref(new Date());

async function load() {
  now.value = new Date();
  try {
    orders.value = await run(() => api.me.orders(), { loading: loaded.value ? false : '加载中' });
  } catch {
    // run 已经提示过了
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
  return `${day === toDateKey(now.value) ? '今天' : formatMonthDay(day)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

const modal = (title: string, content: string) => uni.showModal({ title, content, showCancel: false, confirmText: '知道了' });

async function resume(orderId: string) {
  if (paying.value) return;
  paying.value = true;
  try {
    const result = await run(() => pay.resume(orderId), { loading: '加载中' }).catch(() => null);
    if (!result) return void load();
    const outcome = await pay.pay(result).catch(e => {
      uni.showToast({ title: e instanceof ApiError ? errorMessage(e) : '支付没成功，再试一次', icon: 'none' });
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
      <button v-if="r.payable" class="btn primary" :disabled="paying" @tap.stop="resume(r.id)">去付款</button>
    </view>
    <view v-if="loaded && !rows.length" class="empty">还没有订单</view>
    <text v-if="rows.length" class="fine">退款请找前台办理。前台买的卡也会记在这里。</text>
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
.btn { align-self: flex-end; margin: 4px 0 0; padding: 0 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 14px; font-weight: 600; line-height: 32px; }
.btn.primary { background: var(--brand); }
.fine { display: block; margin-top: 4px; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.empty { padding: 80px 0; text-align: center; color: var(--ink-muted); }
</style>
