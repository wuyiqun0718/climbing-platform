<script setup lang="ts">
/**
 * 团课课表（任务 26）：按周、按门店（跟顶部门店切换联动）看课，一天一列，今天的列头反色；加一节课、改时间人数、复制上周、取消一节课（要写原因）。
 * 排好就发布，小程序约课看的是同一份课表。规则都在 @climb/core 的 classSchedule.ts / classes.ts，接口拦下的直接显示接口的说法。
 */
import type { AdminClassRow, ClassWeek } from '@climb/api';
import { weekStartOf, type ClassType } from '@climb/core';
import gym from '@gym';
import { ConfirmButton, Field, Modal, errorText, useToast, UiButton, UiSelect, UiDatePicker } from '@climb/ui-web';
import { addDays, formatDot, numberInput, toDateKey, weekdayOf } from '@climb/utils';
import { computed, reactive, ref, useId, watch } from 'vue';
import { api } from '../api';
import { defaultClassOn, timeSlots } from './timeSlots';
import ClassRoster from './ClassRoster.vue';
import { createLatest } from '../pages/dashboard';
import { canDo } from '../permissions';
import { session, storeLabel } from '../session';

const props = defineProps<{ types: ClassType[]; coaches: { id: string; name: string }[] }>();

const toast = useToast();
const week = ref(weekStartOf(toDateKey(new Date())));
const data = ref<ClassWeek | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();

const canSchedule = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'class.schedule'));
const storeId = computed(() => session.state.storeId);
const storeNameOf = storeLabel;
const store = () => (storeId.value ? { store: storeId.value } : {});

async function load() {
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.classes.week({ week: week.value, ...store() }));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '课表加载失败');
}
watch(() => [session.state.staff?.id, storeId.value, week.value], () => session.state.staff && load(), { immediate: true });

// 一周七列，每列按开始时间排
const today = toDateKey(new Date());
const days = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const on = addDays(week.value, i);
    const sessions = (data.value?.sessions ?? []).filter(s => s.on === on).sort((a, b) => a.startTime.localeCompare(b.startTime));
    return { on, sessions };
  }),
);
const seatsWidth = (s: AdminClassRow) => `${s.capacity ? Math.min(100, Math.round((s.booked / s.capacity) * 100)) : 0}%`;
const editable = (s: AdminClassRow) => canSchedule.value && s.status !== 'cancelled';

// 加一节课、改一节课：同一个弹窗
const formId = useId();
const formOpen = ref(false);
const editing = ref<AdminClassRow | null>(null);
const form = reactive({ classTypeId: '', storeId: '', on: '', startTime: '19:00', capacity: '', coachId: '' });
// 开始时间：营业时间内 15 分钟一档；改一节已有的课时它原来的时间也在里面
const timeOptions = computed(() => timeSlots(gym.openHours.open, gym.openHours.close, form.startTime).map(t => ({ value: t, label: t })));
const formErr = ref('');
const busy = ref(false);
const activeTypes = computed(() => props.types.filter(t => t.active));
// 现在的教练不在列表里（停用了）也留着显示
const coachOptions = computed(() => [
  { value: '', label: editing.value ? '不指定' : '用默认' },
  ...props.coaches.map(c => ({ value: c.id, label: c.name })),
  ...(form.coachId && !props.coaches.some(c => c.id === form.coachId) ? [{ value: form.coachId, label: editing.value?.coachName ?? form.coachId }] : []),
]);
function openForm(s: AdminClassRow | null) {
  editing.value = s;
  Object.assign(form, {
    classTypeId: s?.classTypeId ?? activeTypes.value[0]?.id ?? '',
    storeId: s?.storeId ?? storeId.value ?? session.state.stores[0]?.id ?? '',
    on: s?.on ?? defaultClassOn(week.value, today),
    startTime: s?.startTime ?? '19:00',
    capacity: s ? String(s.capacity) : '',
    coachId: s?.coachId ?? '',
  });
  formErr.value = '';
  formOpen.value = true;
}
async function submit() {
  if (busy.value) return;
  busy.value = true;
  formErr.value = '';
  const capacity = numberInput(form.capacity);
  try {
    if (editing.value) {
      await api.classes.update(editing.value.id, { on: form.on, startTime: form.startTime, ...(capacity !== undefined ? { capacity } : {}), coachId: form.coachId || null });
      toast.success('已保存');
    } else {
      await api.classes.create({ classTypeId: form.classTypeId, storeId: form.storeId, on: form.on, startTime: form.startTime, ...(capacity !== undefined ? { capacity } : {}), ...(form.coachId ? { coachId: form.coachId } : {}) });
      toast.success('已排课，小程序里马上能约');
    }
    formOpen.value = false;
    load();
  } catch (e) {
    formErr.value = errorText(e, '保存失败，请重试');
  } finally {
    busy.value = false;
  }
}

const cancelAction = (s: AdminClassRow) => async (reason: string) => {
  const r = await api.classes.cancel(s.id, { reason });
  toast.success(`已取消${r.refunded ? `，${r.refunded} 人退回次数` : ''}${r.waitlistVoided ? `，${r.waitlistVoided} 人候补作废` : ''}`);
};

// 名单和签到（任务 27）
const rosterOpen = ref(false);
const rosterId = ref<string | null>(null);
function openRoster(s: AdminClassRow) {
  rosterId.value = s.id;
  rosterOpen.value = true;
}

const copying = ref(false);
async function copyLastWeek() {
  if (copying.value) return;
  copying.value = true;
  try {
    const r = await api.classes.copyWeek({ week: week.value, ...store() });
    const skipped = r.skipped.length ? `，跳过 ${r.skipped.length} 节（${r.skipped.map(s => `${formatDot(s.on)} ${s.name}`).join('、')}）` : '';
    toast.success(`复制了 ${r.created.length} 节${skipped}`);
    load();
  } catch (e) {
    toast.error(errorText(e, '复制失败，请重试'));
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <div class="bar">
    <UiButton @click="week = addDays(week, -7)">上一周</UiButton>
    <strong>{{ formatDot(week) }} – {{ formatDot(addDays(week, 6)) }}</strong>
    <UiButton @click="week = addDays(week, 7)">下一周</UiButton>
    <span class="grow" />
    <template v-if="canSchedule">
      <UiButton :disabled="copying" @click="copyLastWeek">复制上周课表</UiButton>
      <UiButton variant="primary" @click="openForm(null)">加一节课</UiButton>
    </template>
  </div>
  <p v-if="error" class="state error" role="alert">{{ error }}<UiButton size="sm" @click="load">重试</UiButton></p>
  <p v-else-if="loading && !data" class="state">加载中…</p>
  <section v-if="data" class="week" :class="{ loading }" :aria-busy="loading">
    <div v-for="d in days" :key="d.on" class="col">
      <div class="col-h" :class="{ today: d.on === today }">
        <b>{{ weekdayOf(d.on) }}</b>
        <small>{{ formatDot(d.on).slice(5) }}</small>
      </div>
      <p v-if="!d.sessions.length" class="none">没排课</p>
      <article v-for="s in d.sessions" :key="s.id" class="item" :class="{ cancelled: s.status === 'cancelled' }">
        <component
          :is="editable(s) ? 'button' : 'div'"
          :type="editable(s) ? 'button' : undefined"
          class="item-main"
          :aria-label="editable(s) ? `改 ${s.name} ${formatDot(s.on)} ${s.startTime}` : undefined"
          @click="editable(s) && openForm(s)"
        >
          <time class="num">{{ s.startTime }} · {{ s.minutes }} 分钟</time>
          <b>{{ s.name }}</b>
          <small>{{ s.coachName ?? '没指定教练' }}{{ storeId === null ? `，${storeNameOf(s.storeId)}` : '' }}</small>
          <span class="seats" aria-hidden="true"><i :style="{ width: seatsWidth(s) }" /></span>
          <small class="num">已约 {{ s.booked }} / {{ s.capacity }}{{ s.waitlisted ? `，候补 ${s.waitlisted}` : '' }}</small>
        </component>
        <p v-if="s.status === 'cancelled'" class="off">已取消：{{ s.cancelReason }}</p>
        <div class="ops">
          <UiButton variant="link" @click="openRoster(s)">名单</UiButton>
          <ConfirmButton
            v-if="editable(s)"
            label="取消"
            title="取消这节课"
            variant="link"
            danger
            :message="`已约的 ${s.booked} 人退回次数，候补的作废。`"
            :action="cancelAction(s)"
            @done="load"
          />
        </div>
      </article>
    </div>
  </section>

  <ClassRoster v-model:open="rosterOpen" :session-id="rosterId" @changed="load" />

  <Modal :open="formOpen" :title="editing ? `改 ${editing.name}` : '加一节课'" :busy="busy" :close-on-backdrop="false" @update:open="v => (formOpen = v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <template v-if="!editing">
        <Field label="课程" required v-slot="f">
          <UiSelect v-model="form.classTypeId" v-bind="f.attrs" :disabled="busy" :options="activeTypes.map(t => ({ value: t.id, label: `${t.name}（${t.minutes} 分钟，${t.capacity} 人）` }))" />
        </Field>
        <Field label="门店" required v-slot="f">
          <UiSelect v-model="form.storeId" v-bind="f.attrs" :disabled="busy" :options="session.state.stores.map(st => ({ value: st.id, label: st.name }))" />
        </Field>
      </template>
      <Field label="日期" required v-slot="f"><UiDatePicker v-model="form.on" v-bind="f.attrs" :disabled="busy" /></Field>
      <Field label="开始时间" required v-slot="f"><UiSelect v-model="form.startTime" v-bind="f.attrs" :disabled="busy" :options="timeOptions" /></Field>
      <Field label="人数上限" :hint="editing ? '不能少于已约的人数；调大了候补自动补上' : '不填用课程的默认'" v-slot="f">
        <input v-model="form.capacity" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
      </Field>
      <Field label="教练" :hint="editing ? '' : '不填用课程的默认教练'" v-slot="f">
        <UiSelect v-model="form.coachId" v-bind="f.attrs" :disabled="busy" :options="coachOptions" />
      </Field>
      <p v-if="formErr" class="state error" role="alert">{{ formErr }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="formOpen = false">取消</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; margin-bottom: 12px; font-size: 13.5px; }
.grow { flex: 1; }
.form { display: grid; gap: 14px; }
.off { margin: 0; font-size: 12px; color: var(--ink-muted); }
.state { margin: 0 0 12px; font-size: 13px; color: var(--ink-muted); }
/* 七列装不下（窄屏）就整周横滑，列宽不再往下压 */
.week { display: grid; grid-template-columns: repeat(7, minmax(126px, 1fr)); gap: 10px; min-width: 0; margin-bottom: 24px; padding-bottom: 4px; overflow-x: auto; transition: opacity 0.15s; }
.week.loading { opacity: 0.55; }
.col { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.col-h { display: flex; align-items: baseline; justify-content: space-between; padding: 6px 10px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.col-h.today { color: var(--surface); background: var(--ink); }
.col-h b { font-size: 14px; }
.col-h small { font: 600 12px var(--font-number); }
.none { margin: 0; padding: 12px; font-size: 12px; color: var(--ink-muted); text-align: center; border: var(--stroke) dashed var(--line); border-radius: var(--radius-md); }
.item { display: flex; flex-direction: column; gap: 6px; padding: 9px 10px; font-size: 12px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.item.cancelled { background: var(--neutral-soft); }
.item.cancelled .item-main { opacity: 0.6; }
.item-main { display: flex; flex-direction: column; gap: 2px; padding: 0; font: inherit; color: inherit; text-align: left; background: none; border: 0; }
button.item-main { cursor: pointer; }
.item-main b { font-size: 14px; }
.item-main small { color: var(--ink-muted); }
.num { font-family: var(--font-number); font-variant-numeric: tabular-nums; }
time.num { font-weight: 700; }
.seats { display: block; height: 6px; margin: 4px 0 2px; overflow: hidden; background: var(--neutral-soft); border-radius: 3px; }
.seats i { display: block; height: 100%; background: var(--brand); }
.ops { display: flex; gap: 12px; }
.state.error { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; padding: 10px 14px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-md); }
</style>
