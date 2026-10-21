<script setup lang="ts">
/**
 * 团课课表（任务 26）：按周、按门店（跟顶部门店切换联动）看课；加一节课、改时间人数、复制上周、取消一节课（要写原因）。
 * 排好就发布，小程序约课看的是同一份课表。规则都在 @climb/core 的 classSchedule.ts / classes.ts，接口拦下的直接显示接口的说法。
 */
import type { AdminClassRow, ClassWeek } from '@climb/api';
import { weekStartOf, type ClassType } from '@climb/core';
import { ConfirmButton, DataTable, Field, Modal, errorText, useToast, type Column } from '@climb/ui-web';
import { addDays, formatDot, toDateKey, weekdayOf } from '@climb/utils';
import { computed, reactive, ref, useId, watch } from 'vue';
import { api } from '../api';
import { createLatest } from '../pages/dashboard';
import { canDo } from '../permissions';
import { session } from '../session';

const props = defineProps<{ types: ClassType[]; coaches: { id: string; name: string }[] }>();

const toast = useToast();
const week = ref(weekStartOf(toDateKey(new Date())));
const data = ref<ClassWeek | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();

const canSchedule = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'class.schedule'));
const storeId = computed(() => session.state.storeId);
const storeNameOf = (id: string) => session.state.stores.find(s => s.id === id)?.name ?? id;
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

const columns = computed<Column<AdminClassRow>[]>(() => [
  { key: 'on', label: '日期', format: s => `${formatDot(s.on)} ${weekdayOf(s.on)}` },
  { key: 'startTime', label: '时间', format: s => `${s.startTime}（${s.minutes} 分钟）` },
  ...(storeId.value === null ? [{ key: 'storeId', label: '门店', format: (s: AdminClassRow) => storeNameOf(s.storeId) }] : []),
  { key: 'name', label: '课程' },
  { key: 'coachName', label: '教练', format: s => s.coachName ?? '—' },
  { key: 'booked', label: '已约 / 上限', num: true, format: s => `${s.booked} / ${s.capacity}${s.waitlisted ? `，候补 ${s.waitlisted}` : ''}` },
  { key: 'status', label: '' },
]);

// 加一节课、改一节课：同一个弹窗
const formId = useId();
const formOpen = ref(false);
const editing = ref<AdminClassRow | null>(null);
const form = reactive({ classTypeId: '', storeId: '', on: '', startTime: '19:00', capacity: '', coachId: '' });
const formErr = ref('');
const busy = ref(false);
const activeTypes = computed(() => props.types.filter(t => t.active));
function openForm(s: AdminClassRow | null) {
  editing.value = s;
  Object.assign(form, {
    classTypeId: s?.classTypeId ?? activeTypes.value[0]?.id ?? '',
    storeId: s?.storeId ?? storeId.value ?? session.state.stores[0]?.id ?? '',
    on: s?.on ?? week.value,
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
  const capacity = form.capacity.trim() ? Number(form.capacity) : undefined;
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
    <button type="button" class="btn" @click="week = addDays(week, -7)">上一周</button>
    <strong>{{ formatDot(week) }} – {{ formatDot(addDays(week, 6)) }}</strong>
    <button type="button" class="btn" @click="week = addDays(week, 7)">下一周</button>
    <span class="grow" />
    <template v-if="canSchedule">
      <button type="button" class="btn" :disabled="copying" @click="copyLastWeek">复制上周课表</button>
      <button type="button" class="btn primary" @click="openForm(null)">加一节课</button>
    </template>
  </div>
  <p v-if="error" class="state error" role="alert">{{ error }}<button type="button" class="btn" @click="load">重试</button></p>
  <section class="panel">
    <DataTable :columns="columns" :rows="data?.sessions ?? []" row-key="id" :loading="loading" empty="这周还没排课" :clickable="canSchedule" @row-click="(s: AdminClassRow) => canSchedule && s.status !== 'cancelled' && openForm(s)">
      <template #cell-status="{ row }">
        <span v-if="row.status === 'cancelled'" class="off">已取消：{{ row.cancelReason }}</span>
        <span v-else-if="canSchedule" @click.stop @keydown.enter.stop>
          <ConfirmButton
            label="取消"
            title="取消这节课"
            variant="link"
            danger
            :message="`已约的 ${row.booked} 人退回次数，候补的作废。`"
            :action="cancelAction(row)"
            @done="load"
          />
        </span>
      </template>
    </DataTable>
  </section>

  <Modal :open="formOpen" :title="editing ? `改 ${editing.name}` : '加一节课'" :busy="busy" :close-on-backdrop="false" @update:open="v => (formOpen = v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <template v-if="!editing">
        <Field label="课程" required v-slot="f">
          <select v-model="form.classTypeId" v-bind="f.attrs" :disabled="busy">
            <option v-for="t in activeTypes" :key="t.id" :value="t.id">{{ t.name }}（{{ t.minutes }} 分钟，{{ t.capacity }} 人）</option>
          </select>
        </Field>
        <Field label="门店" required v-slot="f">
          <select v-model="form.storeId" v-bind="f.attrs" :disabled="busy">
            <option v-for="st in session.state.stores" :key="st.id" :value="st.id">{{ st.name }}</option>
          </select>
        </Field>
      </template>
      <Field label="日期" required v-slot="f"><input v-model="form.on" v-bind="f.attrs" type="date" :disabled="busy" /></Field>
      <Field label="开始时间" required v-slot="f"><input v-model="form.startTime" v-bind="f.attrs" type="time" :disabled="busy" /></Field>
      <Field label="人数上限" :hint="editing ? '不能少于已约的人数；调大了候补自动补上' : '不填用课程的默认'" v-slot="f">
        <input v-model="form.capacity" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
      </Field>
      <Field label="教练" :hint="editing ? '' : '不填用课程的默认教练'" v-slot="f">
        <select v-model="form.coachId" v-bind="f.attrs" :disabled="busy">
          <option value="">{{ editing ? '不指定' : '用默认' }}</option>
          <option v-for="c in coaches" :key="c.id" :value="c.id">{{ c.name }}</option>
          <option v-if="form.coachId && !coaches.some(c => c.id === form.coachId)" :value="form.coachId">{{ editing?.coachName ?? form.coachId }}</option>
        </select>
      </Field>
      <p v-if="formErr" class="state error" role="alert">{{ formErr }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn" :disabled="busy" @click="formOpen = false">取消</button>
      <button type="submit" class="btn primary" :form="formId" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
    </template>
  </Modal>
</template>

<style scoped>
.bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; font-size: 13.5px; }
.grow { flex: 1; }
.form { display: grid; gap: 14px; }
.form input, .form select { font: inherit; }
.off { font-size: 12px; color: var(--ink-muted); }
.btn { height: 32px; padding: 0 12px; font: inherit; font-size: 13px; font-weight: 600; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); cursor: pointer; }
.btn:disabled { cursor: default; opacity: 0.5; }
.btn.primary { color: var(--on-brand); background: var(--brand); border-color: var(--brand); }
.panel { margin-bottom: 24px; }
.state.error { display: flex; align-items: center; gap: 12px; margin: 0 0 12px; padding: 10px 14px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-md); }
</style>
