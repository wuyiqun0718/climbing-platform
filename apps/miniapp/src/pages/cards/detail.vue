<script setup lang="ts">
import type { CardLedgerItem } from '@climb/api';
import { isCardLive, LEDGER_REASON_LABELS } from '@climb/core';
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import { formatMonthDay, toDateKey } from '@climb/utils';
import { onLoad } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import { cardView } from '../../lib/card-view';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

const cardId = ref('');
onLoad(q => { cardId.value = (q?.id as string | undefined) ?? ''; });

const ledger = ref<CardLedgerItem[]>([]);
const ledgerLoaded = ref(false);
const today = ref(toDateKey(new Date()));

// 每次显示都重新拉：从入场、转赠回来时记录要是新的
useRequireLogin(async () => {
  today.value = toDateKey(new Date());
  if (!cardId.value) return;
  await member.ensureLoaded().catch(() => {});
  try {
    ledger.value = await run(() => api.me.cardLedger(cardId.value), { loading: ledgerLoaded.value ? false : '加载中' });
  } catch {
    // run 已经提示过了
  } finally {
    ledgerLoaded.value = true;
  }
});

const card = computed(() => member.state.cards.find(c => c.id === cardId.value));
const view = computed(() => card.value && cardView(card.value, today.value, !isCardLive(card.value, today.value)));

const rows = computed(() => ledger.value.map(l => ({
  id: l.id,
  date: l.on === today.value ? '今天' : formatMonthDay(l.on),
  text: l.storeName ? `${LEDGER_REASON_LABELS[l.reason]} · ${l.storeName}` : LEDGER_REASON_LABELS[l.reason],
  delta: l.delta ? `${l.delta > 0 ? '+' : ''}${l.delta} 次` : '',
  neg: l.delta < 0,
})));
</script>

<template>
  <view class="page">
    <view v-if="member.state.loaded && !card" class="empty">没找到这张卡</view>
    <template v-else-if="view">
      <MemberCard :kind="view.kind" :name="view.name" :value="view.value" :unit="view.unit" :meta="view.meta" :tone="view.tone" />

      <view class="sec-h"><text class="h">使用记录</text></view>
      <view class="log">
        <view v-for="r in rows" :key="r.id" class="row">
          <text class="date">{{ r.date }}</text>
          <text class="text">{{ r.text }}</text>
          <text class="delta" :class="{ neg: r.neg }">{{ r.delta }}</text>
        </view>
        <view v-if="ledgerLoaded && !rows.length" class="row"><text class="date">还没有记录</text></view>
      </view>
      <text class="fine">同一天多次进出只扣 1 次。送给朋友的次数会从这张卡里扣除，朋友领取后可以在有效期内使用。</text>
    </template>
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.sec-h { margin: 22px 0 8px; }
.h { font-family: var(--font-display); font-size: 20px; }
.log { border-top: var(--stroke) solid var(--ink); }
.row { display: flex; align-items: baseline; gap: 12px; padding: 12px 0; border-bottom: 1px dashed var(--ink-muted); font-size: 14px; }
.date { width: 64px; flex-shrink: 0; font-size: 12px; color: var(--ink-muted); }
.text { flex: 1; font-weight: 600; }
.delta { font-family: var(--font-number); font-weight: 700; color: var(--ink); }
.delta.neg { color: var(--ink-muted); }
.fine { display: block; margin-top: 14px; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.empty { padding: 80px 0; text-align: center; color: var(--ink-muted); }
</style>
