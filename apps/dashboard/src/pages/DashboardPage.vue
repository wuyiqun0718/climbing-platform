<script setup lang="ts">
import { MEMBER_SOURCE_TEXT, type DashboardSummary } from '@climb/api';
import { BarList, StatTile, errorText, type BarRow } from '@climb/ui-web';
import { formatDot, formatYuan, toDateKey, weekdayOf } from '@climb/utils';
import gym from '@gym';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { session } from '../session';
import { createLatest, entriesCompare, funnelSteps, newcomerTotals, pct } from './dashboard';

const data = ref<DashboardSummary | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();

// 日期以接口返回的为准（后端的「今天」），没拿到之前用本机日期
const today = computed(() => data.value?.today ?? toDateKey(new Date()));
const storeName = computed(() =>
  session.state.storeId === null ? '全部门店' : (session.state.stores.find(s => s.id === session.state.storeId)?.name ?? ''),
);

async function load() {
  const storeId = session.state.storeId;
  // 切了门店就先清掉旧数字，免得标题是新店、数字还是上一家店的
  if (data.value && data.value.storeId !== storeId) data.value = null;
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.dashboard(storeId ? { store: storeId } : {}));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '看板数据加载失败');
}

watch(() => [session.state.staff?.id, session.state.storeId], () => session.state.staff && load(), { immediate: true });

const compare = computed(() => data.value && entriesCompare(data.value.today, data.value.todayEntries, data.value.lastWeekSameTimeEntries));
const month = computed(() => `${Number(today.value.slice(5, 7))}月`);

const ncTotal = computed(() => data.value && newcomerTotals(data.value.newcomers));
const ncRows = computed<BarRow[]>(() => {
  const rows = data.value?.newcomers ?? [];
  const max = Math.max(0, ...rows.map(r => r.visitors));
  return rows.map(r => ({
    key: r.source,
    label: MEMBER_SOURCE_TEXT[r.source],
    value: r.visitors,
    note: `办卡 ${r.bought}，${pct(r.bought, r.visitors)}%`,
    width: pct(r.visitors, max),
    inner: pct(r.bought, r.visitors),
  }));
});
const funnelRows = computed<BarRow[]>(() =>
  data.value
    ? funnelSteps(data.value.referral).map(s => ({ key: s.label, label: s.label, value: s.value, note: s.rate === null ? undefined : `${s.rate}%`, width: s.width }))
    : [],
);

const show = (v: number | undefined, fmt: (n: number) => string | number = n => n) => (v === undefined ? '—' : fmt(v));
</script>

<template>
  <header class="page-h">
    <h1>数据看板</h1>
    <p>{{ formatDot(today) }} {{ weekdayOf(today) }}，{{ gym.name }} {{ storeName }}</p>
  </header>
  <p v-if="error" class="state error" role="alert">
    {{ error }}<button type="button" class="retry" @click="load">重试</button>
  </p>
  <section class="grid" :class="{ loading }" :aria-busy="loading">
    <StatTile hero label="本月营收" :value="show(data?.monthRevenueCents, formatYuan)" note="本月 1 日到今天" />
    <StatTile label="今日入场" :value="show(data?.todayEntries)" unit="人次" :note="compare?.text" />
    <StatTile label="今日约课" :value="show(data?.todayBookings)" unit="人次" note="团课和私教" />
    <StatTile label="有效会员" :value="show(data?.activeMembers)" unit="人" note="有能用的卡的人" />
  </section>
  <p v-if="loading && !data" class="state">加载中…</p>
  <section v-if="data" class="grid two" :class="{ loading }">
    <div class="panel">
      <h2>新客从哪来</h2>
      <p class="sub">{{ month }}第一次来馆的 {{ ncTotal?.visitors }} 人，其中 {{ ncTotal?.bought }} 人办了卡</p>
      <BarList :rows="ncRows" />
      <p class="note"><i class="k1" />第一次来馆 <i class="k2" />其中办了期限卡或次卡</p>
    </div>
    <div class="panel">
      <h2>老带新转化</h2>
      <p class="sub">{{ month }}期限卡会员发出的邀请</p>
      <BarList :rows="funnelRows" />
      <p class="note">右边的百分比是相对上一步的转化率。</p>
    </div>
  </section>
</template>

<style scoped>
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 20px; font-size: 13px; color: var(--ink-muted); }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; transition: opacity 0.15s; }
.grid.loading { opacity: 0.55; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 4px 10px; font: inherit; font-weight: 600; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
.panel { min-width: 0; padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.panel h2 { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.panel .sub { margin: 2px 0 14px; font-size: 12px; color: var(--ink-muted); }
.panel .note { display: flex; align-items: center; gap: 6px; margin: 12px 0 0; font-size: 11px; color: var(--ink-muted); }
.note i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
.note .k1 { background: var(--accent); }
.note .k2 { margin-left: 8px; background: var(--brand); }
@media (max-width: 1100px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .grid, .grid.two { grid-template-columns: 1fr; } }
</style>
