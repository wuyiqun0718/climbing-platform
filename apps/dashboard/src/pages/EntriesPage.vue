<script setup lang="ts">
/**
 * 入场记录（任务 20）：按日期、门店（跟顶部门店切换联动）看入场，扫码和前台登记的都有，撤销的有标记。
 * 撤销走任务 16 的接口（前台也能），文字和会员详情共用 components/checkInVoid.ts。
 * 「分享」tab 是分享记录（任务 21，components/ShareRecords.vue）；选的 tab 放在地址的 ?tab=shares 里。
 */
import { ENTRY_METHOD_TEXT, type CheckInList, type CheckInListRow, type VoidCheckInResult } from '@climb/api';
import { ConfirmButton, DataTable, StatTile, errorText, useToast, type Column, Tabs, UiButton, UiDatePicker } from '@climb/ui-web';
import { formatDot, isDateKey, toDateKey } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import ExportButton from '../components/ExportButton.vue';
import ShareRecords from '../components/ShareRecords.vue';
import { entryInsuranceText, voidMessage, voidResultText, voidText } from '../components/checkInVoid';
import { canDo, canSeeStore } from '../permissions';
import { session, storeLabel } from '../session';
import { createLatest } from './dashboard';

// 默认今天；「今天」先用本机日期，后端返回的日期以请求的为准
const date = ref(toDateKey(new Date()));
const data = ref<CheckInList | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();
const router = useRouter();
const route = useRoute();
const tab = computed(() => (route.query.tab === 'shares' ? 'shares' : 'entries'));
const TABS = [{ key: 'entries', label: '入场' }, { key: 'shares', label: '分享' }] as const;
const setTab = (t: 'entries' | 'shares') => router.replace({ query: t === 'shares' ? { tab: t } : {} });
const toast = useToast();

const storeNameOf = storeLabel;

async function load() {
  if (!isDateKey(date.value)) return;
  const storeId = session.state.storeId;
  // 门店或日期变了先清掉旧列表，免得标题和内容对不上
  if (data.value && (data.value.storeId !== storeId || data.value.date !== date.value)) data.value = null;
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.checkIns.list({ date: date.value, ...(storeId ? { store: storeId } : {}) }));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '入场记录加载失败');
}

watch(() => [session.state.staff?.id, session.state.storeId, date.value, tab.value], () => session.state.staff && tab.value === 'entries' && load(), { immediate: true });

const live = computed(() => data.value?.items.filter(r => !r.voided).length ?? 0);
const voidedCount = computed(() => (data.value?.items.length ?? 0) - live.value);
// 汇总条：没撤销的按入场方式分；保单数看入场记录上有没有 policyId
const liveRows = computed(() => data.value?.items.filter(r => !r.voided) ?? []);
const byMethod = (m: CheckInListRow['method']) => liveRows.value.filter(r => r.method === m).length;
const insured = computed(() => liveRows.value.filter(r => r.insurance).length);

const columns = computed<Column<CheckInListRow>[]>(() => [
  { key: 'memberName', label: '会员', format: r => r.memberName || '（没填名字）' },
  ...(session.state.storeId === null ? [{ key: 'storeId', label: '门店', format: (r: CheckInListRow) => storeNameOf(r.storeId) }] : []),
  { key: 'cardName', label: '用的卡' },
  { key: 'deducted', label: '扣次', num: true, format: r => (r.deducted ? `${r.deducted} 次` : '不扣') },
  { key: 'method', label: '方式', format: r => ENTRY_METHOD_TEXT[r.method] },
  { key: 'insurance', label: '保险', format: entryInsuranceText },
  { key: 'voided', label: '' },
]);

const canVoid = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'checkIn.void'));
// 别的店的入场接口会 403，不给按钮
const canVoidRow = (r: CheckInListRow) => canVoid.value && !!session.state.staff && canSeeStore(session.state.staff, r.storeId);
let lastVoid: VoidCheckInResult | null = null;
const voidAction = (r: CheckInListRow) => async (reason: string) => {
  lastVoid = await api.checkIns.void(r.id, { reason });
};
function onVoided() {
  if (!lastVoid) return;
  toast.success(voidResultText(lastVoid));
  load();
}
</script>

<template>
  <header class="page-h">
    <div>
      <h1>入场与分享</h1>
      <p>{{ tab === 'entries' ? '扫码和前台登记的都在这里；点一行看会员' : '次卡转赠和老带新邀请，按发起人的归属门店；点一行看发起人' }}</p>
    </div>
    <div v-if="tab === 'entries'" class="tools">
      <span class="date"><span aria-hidden="true">日期</span><UiDatePicker v-model="date" size="sm" aria-label="日期" :max="toDateKey(new Date())" /></span>
      <ExportButton kind="check-ins" :filters="{ date, ...(session.state.storeId ? { store: session.state.storeId } : {}) }" :disabled="!isDateKey(date)" />
    </div>
  </header>
  <Tabs class="tabs" :options="TABS" :model-value="tab" @update:model-value="setTab" />
  <ShareRecords v-if="tab === 'shares'" />
  <template v-else>
    <p v-if="error" class="state error" role="alert">
      {{ error }}<UiButton size="sm" @click="load">重试</UiButton>
    </p>
    <template v-else-if="data">
      <section class="tiles" :class="{ loading }">
        <StatTile hero label="入场" :value="live" unit="人次" :note="formatDot(data.date)" />
        <StatTile label="扫码" :value="byMethod('scan')" unit="人次" note="会员扫前台平板的码" />
        <StatTile label="前台登记" :value="byMethod('desk')" unit="人次" note="前台手动登记" />
        <StatTile label="撤销" :value="voidedCount" unit="条" note="不算进入场人次" />
      </section>
      <p v-if="live" class="ins">
        <b>这天入场的 {{ live }} 人次里，{{ insured }} 人次有当日保单</b>
        <span>{{ insured < live ? `另外 ${live - insured} 人次没有保单记录，看下面「保险」列。` : '每次入场都有保单记录。' }}</span>
      </p>
    </template>
    <section class="panel">
      <DataTable
        :columns="columns"
        :rows="data?.items ?? []"
        row-key="id"
        :loading="loading"
        empty="这天没有入场"
        clickable
        @row-click="(r: CheckInListRow) => router.push({ name: 'member', params: { id: r.memberId } })"
      >
        <template #cell-voided="{ row }">
          <span v-if="row.voided" class="voided">{{ voidText(row) }}</span>
          <span v-else-if="canVoidRow(row)" @click.stop @keydown.enter.stop>
            <ConfirmButton
              label="撤销"
              title="撤销这次入场"
              variant="link"
              danger
              :message="voidMessage(row, { memberName: row.memberName, storeName: storeNameOf(row.storeId) })"
              :action="voidAction(row)"
              @done="onVoided"
            />
          </span>
        </template>
      </DataTable>
    </section>
  </template>
</template>

<style scoped>
.page-h { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0 16px; }
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 16px; }
.date { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.tabs { margin-bottom: 16px; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; transition: opacity 0.15s; }
.tiles.loading { opacity: 0.55; }
.ins { display: flex; flex-direction: column; gap: 2px; margin: 0 0 16px; padding: 12px 16px; font-size: 13px; background: var(--brand-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.ins b { font-size: 14.5px; }
/* 浅绿底上的灰字对比度不够 4.5:1，用 ink */
.ins span { color: var(--ink); }
@media (max-width: 1100px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.voided { font-size: 12px; color: var(--ink-muted); }
</style>
