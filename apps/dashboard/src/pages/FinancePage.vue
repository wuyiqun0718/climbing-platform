<script setup lang="ts">
import { CHANNEL_TEXT, REFUND_METHOD_TEXT, REVENUE_CATEGORY_TEXT, type FinanceRefundRow, type FinanceSummary } from '@climb/api';
import { financeRangeError, type RevenueBucket } from '@climb/core';
import { DataTable, StatTile, errorText, type Column } from '@climb/ui-web';
import { formatDot, formatYuan, toDateKey } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import ExportButton from '../components/ExportButton.vue';
import { session, storeLabel } from '../session';
import { createLatest, pct } from './dashboard';
import { RANGE_PRESETS, presetRange, type RangePreset } from './finance';

// 默认本月；「今天」先用本机日期，后端返回的区间以请求的为准
const today = toDateKey(new Date());
const from = ref(presetRange('month', today).from);
const to = ref(today);

const data = ref<FinanceSummary | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();

const rangeError = computed(() => financeRangeError(from.value, to.value));
const storeName = computed(() =>
  session.state.storeId === null ? '全部门店' : (session.state.stores.find(s => s.id === session.state.storeId)?.name ?? ''),
);
const storeNameOf = storeLabel;

async function load() {
  if (rangeError.value) return;
  const storeId = session.state.storeId;
  // 门店或日期变了先清掉旧数字，免得标题和数字对不上
  if (data.value && (data.value.storeId !== storeId || data.value.from !== from.value || data.value.to !== to.value)) data.value = null;
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.finance({ from: from.value, to: to.value, ...(storeId ? { store: storeId } : {}) }));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '财务数据加载失败');
}

watch(() => [session.state.staff?.id, session.state.storeId, from.value, to.value], () => session.state.staff && load(), { immediate: true });

function usePreset(p: RangePreset) {
  ({ from: from.value, to: to.value } = presetRange(p, today));
}
const activePreset = computed(() => RANGE_PRESETS.find(p => {
  const r = presetRange(p.key, today);
  return r.from === from.value && r.to === to.value;
})?.key);

type Bucket = RevenueBucket<string> & { label: string };
const bucketColumns = (first: string): Column<Bucket>[] => [
  { key: 'label', label: first },
  { key: 'orders', label: '笔数', num: true },
  { key: 'grossCents', label: '营收', num: true, format: r => formatYuan(r.grossCents) },
  { key: 'share', label: '占比', num: true, format: r => `${pct(r.grossCents, data.value?.grossCents ?? 0)}%` },
  { key: 'refundCents', label: '退款', num: true, format: r => (r.refunds ? `${formatYuan(r.refundCents)}（${r.refunds} 笔）` : '—') },
  { key: 'net', label: '净收入', num: true, format: r => formatYuan(r.grossCents - r.refundCents) },
];
const channelRows = computed<Bucket[]>(() => (data.value?.byChannel ?? []).map(b => ({ ...b, label: CHANNEL_TEXT[b.key] })));
const categoryRows = computed<Bucket[]>(() => (data.value?.byCategory ?? []).map(b => ({ ...b, label: REVENUE_CATEGORY_TEXT[b.key] })));

const refundColumns = computed<Column<FinanceRefundRow>[]>(() => [
  { key: 'refundedOn', label: '退款日期', format: r => formatDot(r.refundedOn) },
  { key: 'memberName', label: '会员' },
  ...(session.state.storeId === null ? [{ key: 'storeId', label: '门店', format: (r: FinanceRefundRow) => storeNameOf(r.storeId) }] : []),
  { key: 'productName', label: '商品', format: r => `${r.productName}（${REVENUE_CATEGORY_TEXT[r.category]}）` },
  { key: 'channel', label: '原支付方式', format: r => CHANNEL_TEXT[r.channel] },
  { key: 'orderAmountCents', label: '原实付', num: true, format: r => formatYuan(r.orderAmountCents) },
  { key: 'amountCents', label: '退款', num: true, format: r => formatYuan(r.amountCents) },
  { key: 'method', label: '怎么退', format: r => REFUND_METHOD_TEXT[r.method] },
  { key: 'reason', label: '原因' },
]);

const show = (v: number | undefined) => (v === undefined ? '—' : formatYuan(v));
</script>

<template>
  <header class="page-h">
    <h1>财务</h1>
    <p>{{ formatDot(from) }} 到 {{ formatDot(to) }}，{{ storeName }}</p>
  </header>
  <div class="filters">
    <button v-for="p in RANGE_PRESETS" :key="p.key" type="button" class="chip" :class="{ on: activePreset === p.key }" @click="usePreset(p.key)">
      {{ p.label }}
    </button>
    <label>从 <input v-model="from" type="date" :max="to" required /></label>
    <label>到 <input v-model="to" type="date" :min="from" required /></label>
    <span v-if="rangeError" class="bad" role="alert">{{ rangeError }}</span>
    <ExportButton kind="orders" :filters="{ from, to, ...(session.state.storeId ? { store: session.state.storeId } : {}) }" label="导出订单" :disabled="!!rangeError" />
  </div>
  <p v-if="error" class="state error" role="alert">
    {{ error }}<button type="button" class="retry" @click="load">重试</button>
  </p>
  <section class="grid" :class="{ loading }" :aria-busy="loading">
    <StatTile hero label="营收" :value="show(data?.grossCents)" note="按收款日，退款前" />
    <StatTile label="退款" :value="show(data?.refundCents)" :note="data ? `${data.refunds.length} 笔，按退款日` : undefined" />
    <StatTile label="净收入" :value="show(data?.netCents)" note="营收减去退款" />
  </section>
  <p v-if="loading && !data" class="state">加载中…</p>
  <section v-if="data" class="grid two" :class="{ loading }">
    <div class="panel">
      <h2>按收款方式</h2>
      <DataTable :columns="bucketColumns('收款方式')" :rows="channelRows" row-key="key" />
    </div>
    <div class="panel">
      <h2>按品类</h2>
      <DataTable :columns="bucketColumns('品类')" :rows="categoryRows" row-key="key" />
    </div>
  </section>
  <section v-if="data" class="panel wide" :class="{ loading }">
    <h2>退款</h2>
    <p class="sub">微信订单原路退回；线下收的钱线下退，这里只记录</p>
    <DataTable :columns="refundColumns" :rows="data.refunds" row-key="refundId" empty="这段时间没有退款" />
  </section>
</template>

<style scoped>
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 16px; font-size: 13px; }
.filters input { padding: 4px 8px; font: inherit; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); }
.chip { padding: 4px 12px; font: inherit; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: 999px; cursor: pointer; }
.chip.on { background: var(--accent-soft); font-weight: 600; }
.bad { color: var(--ink); font-weight: 600; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; transition: opacity 0.15s; }
.grid.loading, .panel.loading { opacity: 0.55; }
.grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 4px 10px; font: inherit; font-weight: 600; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.panel { min-width: 0; padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.panel h2 { margin: 0 0 12px; font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.panel .sub { margin: -10px 0 12px; font-size: 12px; color: var(--ink-muted); }
.panel.wide { margin-top: 16px; }
@media (max-width: 1100px) { .grid.two { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>
