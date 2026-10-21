<script setup lang="ts">
import { MEMBER_SOURCE_TEXT, type DashboardSummary, type StoreCompareRow } from '@climb/api';
import { BarList, DataTable, StatTile, errorText, type BarRow, type Column } from '@climb/ui-web';
import { formatDot, formatYuan, toDateKey, weekdayOf } from '@climb/utils';
import gym from '@gym';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { canSeeAllStores } from '../permissions';
import { session } from '../session';
import { createLatest, entriesCompare, expiryText, funnelSteps, newcomerTotals, pct } from './dashboard';

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

const allStores = computed(() => session.state.storeId === null);
const storeNameOf = (id: string) => session.state.stores.find(s => s.id === id)?.name ?? id;

// 门店对比：只给能看全部门店的人，且当前选的是「全部门店」
const compareRows = computed(() =>
  data.value?.stores && session.state.staff && canSeeAllStores(session.state.staff) ? data.value.stores : null,
);
const compareColumns: Column<StoreCompareRow>[] = [
  { key: 'storeId', label: '门店' },
  { key: 'monthRevenueCents', label: '本月营收', num: true },
  { key: 'todayEntries', label: '今日入场', num: true },
  { key: 'activeMembers', label: '有效会员', num: true },
  { key: 'newcomers', label: '本月新客', num: true },
  { key: 'newcomersBought', label: '其中办卡', num: true, format: r => `${r.newcomersBought}（${pct(r.newcomersBought, r.newcomers)}%）` },
];
const revenueTotal = computed(() => (compareRows.value ?? []).reduce((n, r) => n + r.monthRevenueCents, 0));

const show = (v: number | null | undefined, fmt: (n: number) => string | number = n => n) => (v === undefined || v === null ? '—' : fmt(v));
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
  <section v-if="compareRows" class="panel wide" :class="{ loading }">
    <h2>门店对比</h2>
    <p class="sub">点门店名只看这家店</p>
    <DataTable :columns="compareColumns" :rows="compareRows" row-key="storeId">
      <template #cell-storeId="{ row }">
        <button type="button" class="link" @click="session.setStore(row.storeId)">{{ storeNameOf(row.storeId) }}</button>
      </template>
      <template #cell-monthRevenueCents="{ row }">
        {{ formatYuan(row.monthRevenueCents) }} <small class="muted">{{ pct(row.monthRevenueCents, revenueTotal) }}%</small>
      </template>
    </DataTable>
  </section>
  <section v-if="data" class="panel wide" :class="{ loading }">
    <h2>{{ gym.rules.expiryReminderDays }} 天内到期</h2>
    <p class="sub">期限卡会员，{{ data.expiring.length }} 人，可以提醒续费</p>
    <ul v-if="data.expiring.length" class="expiring">
      <li v-for="x in data.expiring" :key="x.cardId">
        <RouterLink :to="{ name: 'member', params: { id: x.memberId } }">{{ x.memberName }}</RouterLink>
        <small>{{ x.cardName }}，{{ allStores ? `${storeNameOf(x.storeId)}，` : '' }}{{ expiryText(today, x.expiresOn) }}</small>
      </li>
    </ul>
    <p v-else class="sub">{{ allStores ? '' : '这家店' }} {{ gym.rules.expiryReminderDays }} 天内没有到期的期限卡</p>
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
.panel.wide { margin-top: 16px; }
.panel.loading { opacity: 0.55; }
.link { padding: 0; font: inherit; font-weight: 600; color: var(--ink); background: none; border: 0; text-decoration: underline; cursor: pointer; }
.muted { color: var(--ink-muted); }
.expiring { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px 16px; margin: 0; padding: 0; list-style: none; }
.expiring li { display: flex; flex-direction: column; padding: 8px 0; border-bottom: 1px solid var(--neutral-soft); }
.expiring a { font-weight: 600; color: var(--ink); }
.expiring small { font-size: 12px; color: var(--ink-muted); }
@media (max-width: 1100px) { .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .grid, .grid.two { grid-template-columns: 1fr; } }
</style>
