<script setup lang="ts">
import type { DashboardSummary } from '@climb/api';
import { StatTile, errorText } from '@climb/ui-web';
import { formatDot, formatYuan, toDateKey, weekdayOf } from '@climb/utils';
import gym from '@gym';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { session } from '../session';
import { createLatest, entriesCompare } from './dashboard';

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
</template>

<style scoped>
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 20px; font-size: 13px; color: var(--ink-muted); }
.grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; transition: opacity 0.15s; }
.grid.loading { opacity: 0.55; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 4px 10px; font: inherit; font-weight: 600; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
@media (max-width: 1100px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
</style>
