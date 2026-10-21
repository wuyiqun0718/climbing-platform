<script setup lang="ts">
/**
 * 私教时间轴（任务 29），只读：每位教练一行，按 ptRules 的营业时间每小时一格（接口给 hours，不写死），可以在 7 天里切换。
 * 格子：空闲、会员约的（带会员名字）、线下约的（带备注）、不接课。跟顶部门店切换联动，只列在这家店接私教的教练。
 * 标记、确认、取消见任务 30。
 */
import type { AdminPtSlot, PtTimelineView } from '@climb/api';
import { errorText } from '@climb/ui-web';
import { addDays, formatDot, toDateKey, weekdayOf } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { createLatest } from '../pages/dashboard';
import { session } from '../session';

const data = ref<PtTimelineView | null>(null);
const day = ref(toDateKey(new Date()));
const loading = ref(false);
const error = ref('');
const latest = createLatest();

async function load() {
  loading.value = true;
  error.value = '';
  const storeId = session.state.storeId;
  // 从今天起 7 天，接口按 ptRules 给格子
  const res = await latest(() => api.ptSlots(storeId ? { store: storeId } : {}));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) {
    data.value = res.value;
    if (!res.value.coaches[0]?.days.some(d => d.on === day.value)) day.value = res.value.from;
  } else error.value = errorText(res.error, '私教时间轴加载失败');
}
watch(() => [session.state.staff?.id, session.state.storeId], () => session.state.staff && load(), { immediate: true });

const days = computed(() => {
  if (!data.value) return [];
  const out: string[] = [];
  for (let on = data.value.from; on <= data.value.to; on = addDays(on, 1)) out.push(on);
  return out;
});
const rows = computed(() => (data.value?.coaches ?? []).map(c => ({ coach: c.coach, slots: c.days.find(d => d.on === day.value)?.slots ?? [] })));

const TEXT: Record<AdminPtSlot['status'], string> = { free: '空闲', member: '会员约', offline: '线下约', off: '不接课' };
function label(s: AdminPtSlot): string {
  if (s.status === 'member' && s.booking) return `${s.booking.memberName || '会员'}${s.booking.status === 'pending' ? '（待确认）' : ''}`;
  if (s.mark?.note) return `${TEXT[s.status]}：${s.mark.note}`;
  return TEXT[s.status];
}
</script>

<template>
  <div class="days" role="tablist">
    <button v-for="on in days" :key="on" type="button" role="tab" :aria-selected="on === day" :class="{ on: on === day }" @click="day = on">
      {{ formatDot(on) }} {{ weekdayOf(on) }}
    </button>
  </div>
  <p v-if="error" class="err" role="alert">{{ error }}<button type="button" class="link" @click="load">重试</button></p>
  <p v-else-if="loading && !data" class="muted">加载中…</p>
  <p v-else-if="data && !rows.length" class="muted">这家店还没有接私教的教练（在「员工」里给员工勾上「是教练」）</p>
  <div v-else-if="data" class="grid" :style="{ gridTemplateColumns: `120px repeat(${data.hours.length}, minmax(64px, 1fr))` }">
    <div class="head" />
    <div v-for="h in data.hours" :key="h" class="head">{{ h }}:00</div>
    <template v-for="r in rows" :key="r.coach.id">
      <div class="coach">{{ r.coach.name }}</div>
      <div v-for="s in r.slots" :key="s.hour" class="cell" :class="[s.status, { past: s.past }]" :title="label(s)">{{ label(s) }}</div>
    </template>
  </div>
  <p class="legend"><span class="cell free">空闲</span><span class="cell member">会员约</span><span class="cell offline">线下约</span><span class="cell off">不接课</span>　灰掉的是已经过了的时段</p>
</template>

<style scoped>
.days { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; }
.days button { padding: 4px 10px; font: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); cursor: pointer; }
.days button.on { font-weight: 700; border-color: var(--ink); }
.grid { display: grid; gap: 2px; overflow-x: auto; font-size: 12px; }
.head { padding: 4px; color: var(--ink-muted); text-align: center; }
.coach { display: flex; align-items: center; padding: 4px 8px; font-weight: 600; }
.cell { padding: 6px 4px; overflow: hidden; text-align: center; white-space: nowrap; text-overflow: ellipsis; border-radius: 6px; }
.cell.free { background: var(--surface); border: 1px solid var(--line); }
.cell.member { color: var(--on-brand); background: var(--brand); }
.cell.offline { background: var(--accent); }
.cell.off { color: var(--ink-muted); background: var(--neutral-soft); }
.cell.past { opacity: 0.45; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 12px; color: var(--ink-muted); }
.legend .cell { padding: 2px 8px; }
.muted { font-size: 13px; color: var(--ink-muted); }
.err { padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
.link { margin-left: 8px; padding: 0; font: inherit; color: var(--brand); background: none; border: 0; cursor: pointer; text-decoration: underline; }
</style>
