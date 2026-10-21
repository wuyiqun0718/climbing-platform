<script setup lang="ts">
import { ApiError, ENTRY_METHOD_TEXT, MEMBER_SOURCE_TEXT, PAY_CHANNEL_TEXT, REVENUE_CATEGORY_TEXT, type MemberDetail, type MemberEntryRow, type MemberOrderRow } from '@climb/api';
import { CARD_STATE_TEXT, cardState, cardText, type Card } from '@climb/core';
import { DataTable, errorText, type Column } from '@climb/ui-web';
import { formatDot, formatYuan, toDateKey } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { session } from '../session';
import { createLatest } from './dashboard';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id ?? ''));

const data = ref<MemberDetail | null>(null);
const loading = ref(false);
const error = ref('');
const notFound = ref(false);
const latest = createLatest();

async function load() {
  if (data.value && data.value.id !== id.value) data.value = null;
  loading.value = true;
  error.value = '';
  notFound.value = false;
  const res = await latest(() => api.members.get(id.value));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else if (res.error instanceof ApiError && res.error.status === 404) notFound.value = true;
  else error.value = errorText(res.error, '会员信息加载失败');
}

watch(() => [session.state.staff?.id, id.value], () => session.state.staff && id.value && load(), { immediate: true });

const today = toDateKey(new Date());
const storeName = (sid: string | null) => (sid ? (session.state.stores.find(s => s.id === sid)?.name ?? sid) : '—');

// 卡的文字和状态都来自 @climb/core，跟小程序卡包一样
const cards = computed(() =>
  (data.value?.cards ?? []).map((c: Card) => {
    const state = cardState(c, today);
    return { card: c, text: cardText(c, today), state, stateText: CARD_STATE_TEXT[state], dim: state !== 'normal' && state !== 'not_started' };
  }),
);

const orderColumns: Column<MemberOrderRow>[] = [
  { key: 'paidOn', label: '付款日期', format: r => (r.paidOn ? formatDot(r.paidOn) : '没付款') },
  { key: 'productName', label: '商品' },
  { key: 'category', label: '品类', format: r => REVENUE_CATEGORY_TEXT[r.category] },
  { key: 'storeId', label: '门店', format: r => storeName(r.storeId) },
  { key: 'channel', label: '支付方式', format: r => PAY_CHANNEL_TEXT[r.channel] },
  { key: 'amountCents', label: '金额', num: true, format: r => formatYuan(r.amountCents) },
  { key: 'refundedCents', label: '已退', num: true, format: r => (r.refundedCents ? formatYuan(r.refundedCents) : '—') },
];

const entryColumns: Column<MemberEntryRow>[] = [
  { key: 'on', label: '日期', format: r => formatDot(r.on) },
  { key: 'storeId', label: '门店', format: r => storeName(r.storeId) },
  { key: 'cardName', label: '用的卡' },
  { key: 'deducted', label: '扣次', num: true, format: r => (r.deducted ? `${r.deducted} 次` : '不扣') },
  { key: 'method', label: '方式', format: r => ENTRY_METHOD_TEXT[r.method] },
  { key: 'voided', label: '', format: r => (r.voided ? '已撤销' : '') },
];

const back = () => (window.history.state?.back ? router.back() : router.push({ name: 'members' }));
</script>

<template>
  <header class="page-h">
    <button type="button" class="back" @click="back">← 返回</button>
    <h1>{{ data?.name ?? '会员详情' }}</h1>
  </header>

  <p v-if="notFound" class="state" role="alert">没有这个会员，可能已经被合并或删除了。</p>
  <p v-else-if="error" class="state error" role="alert">
    {{ error }}<button type="button" class="retry" @click="load">重试</button>
  </p>
  <p v-else-if="loading && !data" class="state">加载中…</p>

  <template v-if="data">
    <section class="panel info">
      <dl>
        <div><dt>手机号</dt><dd class="num">{{ data.phone }}</dd></div>
        <div><dt>来源</dt><dd>{{ MEMBER_SOURCE_TEXT[data.source] }}</dd></div>
        <div><dt>归属门店</dt><dd>{{ storeName(data.homeStoreId) }}</dd></div>
        <div>
          <dt>首次到店</dt>
          <dd>{{ data.firstVisitOn ? `${formatDot(data.firstVisitOn)}，${storeName(data.firstVisitStoreId)}` : '还没来过' }}</dd>
        </div>
        <div>
          <dt>风险告知书</dt>
          <dd :class="{ warn: !data.waiver }">
            {{ data.waiver ? `${formatDot(data.waiver.signedOn)} 签的（${data.waiver.version} 版）` : '还没签，第一次入场时让会员在小程序里签' }}
          </dd>
        </div>
      </dl>
    </section>

    <h2>卡</h2>
    <p v-if="!cards.length" class="state">还没有卡</p>
    <ul v-else class="cards">
      <li v-for="c in cards" :key="c.card.id" :class="{ dim: c.dim }">
        <div class="card-h">
          <span class="kind">{{ c.text.kind }}</span>
          <span class="badge" :class="`st-${c.state}`">{{ c.stateText }}</span>
        </div>
        <strong class="name">{{ c.card.name }}</strong>
        <span class="value"><b>{{ c.text.value }}</b> {{ c.text.unit }}</span>
        <small>{{ c.text.meta }}</small>
      </li>
    </ul>

    <h2>最近订单</h2>
    <section class="panel">
      <DataTable :columns="orderColumns" :rows="data.recentOrders" row-key="id" empty="还没有订单" />
    </section>

    <h2>最近入场</h2>
    <section class="panel">
      <DataTable :columns="entryColumns" :rows="data.recentEntries" row-key="id" empty="还没入过场" />
    </section>
  </template>
</template>

<style scoped>
.page-h h1 { margin: 4px 0 16px; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.back { padding: 0; font: inherit; font-size: 13px; color: var(--ink-muted); background: none; border: 0; cursor: pointer; }
h2 { margin: 22px 0 10px; font-family: var(--font-display); font-size: 22px; font-weight: 400; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 4px 10px; font: inherit; font-weight: 600; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.panel { min-width: 0; padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.info dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px 24px; margin: 0; }
.info dt { font-size: 12px; color: var(--ink-muted); }
.info dd { margin: 2px 0 0; font-weight: 600; }
.info dd.warn { color: var(--ink); background: var(--accent-soft); padding: 2px 6px; border-radius: var(--radius-sm); }
.num { font-family: var(--font-number); font-variant-numeric: tabular-nums; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.cards li { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.cards li.dim { opacity: 0.6; }
.card-h { display: flex; justify-content: space-between; align-items: center; }
.kind { font-size: 12px; font-weight: 700; }
.badge { padding: 1px 8px; font-size: 12px; font-weight: 600; border: 1px solid var(--ink); border-radius: 999px; background: var(--neutral-soft); }
.badge.st-normal, .badge.st-not_started { background: var(--brand); color: var(--on-brand); }
.badge.st-frozen { background: var(--accent-soft); }
.name { font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.value b { font-family: var(--font-number); font-size: 26px; }
.cards small { font-size: 12px; color: var(--ink-muted); }
</style>
