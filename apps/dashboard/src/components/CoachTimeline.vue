<script setup lang="ts">
/**
 * 私教时间轴（任务 29）：每位教练一行，按 ptRules 的营业时间每小时一格（接口给 hours，不写死），可以在 7 天里切换。
 * 格子：空闲、会员约的（带会员名字）、线下约的（带备注）、不接课。跟顶部门店切换联动，只列在这家店接私教的教练。
 * 处理（任务 30）：点没过的空格标线下约 / 不接课，点标记去掉，点会员约的确认或取消（要写原因）。能不能做由接口按 pt.ts 判断，
 * 入口只给教练本人或店长以上（permissions.ts 的 canHandlePt）。
 */
import type { AdminPtSlot, PtTimelineView } from '@climb/api';
import { ConfirmButton, Field, Modal, errorText, useToast } from '@climb/ui-web';
import { addDays, formatDot, toDateKey, weekdayOf } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { createLatest } from '../pages/dashboard';
import { canHandlePt } from '../permissions';
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

// 点格子处理（任务 30）
const toast = useToast();
const picked = ref<{ coachId: string; coachName: string; on: string; slot: AdminPtSlot } | null>(null);
const pickOpen = ref(false);
const note = ref('');
const busy = ref(false);
const canHandle = (coachId: string) => !!session.state.staff && canHandlePt(session.state.staff, coachId);
const clickable = (coachId: string, s: AdminPtSlot) => canHandle(coachId) && !s.past;
function pick(coachId: string, coachName: string, s: AdminPtSlot) {
  if (!clickable(coachId, s)) return;
  picked.value = { coachId, coachName, on: day.value, slot: s };
  note.value = '';
  pickOpen.value = true;
}
async function run(fn: () => Promise<unknown>, done: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    toast.success(done);
    pickOpen.value = false;
    await load();
  } catch (e) {
    toast.error(errorText(e, '操作失败，请重试'));
  } finally {
    busy.value = false;
  }
}
const mark = (kind: 'offline' | 'off') =>
  run(() => api.ptSlotMarks.create({ coachId: picked.value!.coachId, on: picked.value!.on, hour: picked.value!.slot.hour, kind, note: note.value.trim() || undefined }), kind === 'offline' ? '已标为线下约' : '已标为不接课');
const unmark = () => run(() => api.ptSlotMarks.remove(picked.value!.slot.mark!.id), '已去掉标记');
const confirm = () => run(() => api.ptBookings.confirm(picked.value!.slot.booking!.id), '已确认');
const cancelAction = (kind: 'member' | 'coach') => async (reason: string) => {
  await api.ptBookings.cancel(picked.value!.slot.booking!.id, { kind, reason });
};
async function onCancelled() {
  toast.success('已取消，课时退回');
  pickOpen.value = false;
  await load();
}

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
      <div
        v-for="s in r.slots"
        :key="s.hour"
        class="cell"
        :class="[s.status, { past: s.past, clickable: clickable(r.coach.id, s) }]"
        :title="label(s)"
        :tabindex="clickable(r.coach.id, s) ? 0 : undefined"
        @click="pick(r.coach.id, r.coach.name, s)"
        @keydown.enter="pick(r.coach.id, r.coach.name, s)"
      >{{ label(s) }}</div>
    </template>
  </div>
  <Modal :open="pickOpen" :title="picked ? `${picked.coachName} ${formatDot(picked.on)} ${picked.slot.hour}:00` : ''" :busy="busy" @update:open="v => (pickOpen = v)">
    <template v-if="picked">
      <div v-if="picked.slot.status === 'free'" class="pick">
        <Field label="备注" hint="线下约的填学员名字，不接课填原因，可以不填" v-slot="f"><input v-model="note" v-bind="f.attrs" maxlength="50" :disabled="busy" /></Field>
        <div class="row">
          <button type="button" class="btn" :disabled="busy" @click="mark('offline')">标为线下约的</button>
          <button type="button" class="btn" :disabled="busy" @click="mark('off')">标为不接课</button>
        </div>
      </div>
      <div v-else-if="picked.slot.mark" class="pick">
        <p>{{ label(picked.slot) }}</p>
        <button type="button" class="btn" :disabled="busy" @click="unmark">去掉这个标记</button>
      </div>
      <div v-else-if="picked.slot.booking" class="pick">
        <p>{{ picked.slot.booking.memberName }}{{ picked.slot.booking.status === 'pending' ? '，等教练确认' : '' }}</p>
        <div class="row">
          <button v-if="picked.slot.booking.status === 'pending'" type="button" class="btn" :disabled="busy" @click="confirm">确认</button>
          <ConfirmButton label="会员要取消" title="会员要取消这节私教" message="退回 1 节课时，格子空出来。" :action="cancelAction('member')" @done="onCancelled" />
          <ConfirmButton
            :label="picked.slot.booking.status === 'pending' ? '教练拒绝' : '教练取消'"
            title="教练取消这节私教"
            message="退回 1 节课时，原因会员能看到。"
            danger
            :action="cancelAction('coach')"
            @done="onCancelled"
          />
        </div>
      </div>
    </template>
  </Modal>
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
.cell.clickable { cursor: pointer; }
.cell.clickable:hover { outline: 2px solid var(--ink); }
.pick { display: grid; gap: 12px; }
.pick p { margin: 0; }
.pick input { font: inherit; }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.btn { height: 32px; padding: 0 12px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); cursor: pointer; }
.btn:disabled { cursor: default; opacity: 0.5; }
.legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 0; font-size: 12px; color: var(--ink-muted); }
.legend .cell { padding: 2px 8px; }
.muted { font-size: 13px; color: var(--ink-muted); }
.err { padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
.link { margin-left: 8px; padding: 0; font: inherit; color: var(--brand); background: none; border: 0; cursor: pointer; text-decoration: underline; }
</style>
