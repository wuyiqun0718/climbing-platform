<script setup lang="ts">
/**
 * 课程排期页：团课课表（任务 26，components/ClassSchedule.vue），团课课程种类的新建、编辑、停用（任务 25），
 * 和团课规则（取消截止、候补、迟到，占位，等馆方）；私教时间轴（任务 29，components/CoachTimeline.vue，只读）。校验都在 @climb/core 的 classTypes.ts，这里只负责显示和提交。
 */
import { classRulesErrors, type ClassRules, type ClassRulesErrors, type ClassType } from '@climb/core';
import { DataTable, Field, errorText, useToast, type Column, UiButton } from '@climb/ui-web';
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import ClassSchedule from '../components/ClassSchedule.vue';
import CoachTimeline from '../components/CoachTimeline.vue';
import ClassTypeForm from '../components/ClassTypeForm.vue';
import { canDo } from '../permissions';
import { session } from '../session';

const toast = useToast();
const types = ref<ClassType[]>([]);
const coaches = ref<{ id: string; name: string }[]>([]);
const loading = ref(true);
const error = ref('');

const can = (a: Parameters<typeof canDo>[1]) => !!session.state.staff && canDo(session.state.staff.role, a);
const canEdit = computed(() => can('classType.edit'));
const canRules = computed(() => can('settings.classRules'));

async function load() {
  loading.value = true;
  error.value = '';
  try {
    types.value = await api.classTypes.list();
  } catch (e) {
    error.value = errorText(e, '团课课程加载失败');
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  load();
  loadRules();
  // 教练列表（任务 28）：在用、有教练资料的员工，登录的员工都能看
  try {
    coaches.value = (await api.coaches()).map(c => ({ id: c.id, name: c.name }));
  } catch {
    // 不影响别的，拿不到就只能保留原来的教练
  }
});

const coachName = (id?: string) => (id ? (coaches.value.find(c => c.id === id)?.name ?? id) : '—');
const columns: Column<ClassType>[] = [
  { key: 'name', label: '课程名' },
  { key: 'minutes', label: '时长', num: true, format: t => `${t.minutes} 分钟` },
  { key: 'capacity', label: '人数上限', num: true },
  { key: 'credits', label: '扣次', num: true, format: t => `${t.credits} 次` },
  { key: 'coachId', label: '默认教练', format: t => coachName(t.coachId) },
  { key: 'active', label: '状态', width: '140px' },
];

const formOpen = ref(false);
const editing = ref<ClassType | null>(null);
function openForm(t: ClassType | null) {
  editing.value = t;
  formOpen.value = true;
}
function onSaved(t: ClassType, created: boolean) {
  toast.success(created ? `已新建：${t.name}` : `已保存：${t.name}`);
  load();
}

const toggling = ref<string | null>(null);
async function toggle(t: ClassType) {
  if (toggling.value) return;
  toggling.value = t.id;
  try {
    const saved = await api.classTypes.update(t.id, { active: !t.active });
    toast.success(saved.active ? `已启用：${saved.name}` : `已停用：${saved.name}，已经排了的课照常上`);
    await load();
  } catch (e) {
    toast.error(errorText(e, '操作失败，请重试'));
  } finally {
    toggling.value = null;
  }
}

// 团课规则
const rules = reactive({ cancelBeforeMinutes: '', waitlist: true, waitlistUnlimited: true, waitlistMax: '', lateGraceMinutes: '' });
const rulesErrs = ref<ClassRulesErrors>({});
const rulesErr = ref('');
const rulesBusy = ref(false);
// 规则拉回来之前表单是空的，不让改也不让存，免得一点保存全是「必填」
const rulesLoaded = ref(false);
const rulesLoadFailed = ref(false);
function fillRules(r: ClassRules) {
  Object.assign(rules, {
    cancelBeforeMinutes: String(r.cancelBeforeMinutes),
    waitlist: r.waitlist,
    waitlistUnlimited: r.waitlistMax === null,
    waitlistMax: r.waitlistMax === null ? '' : String(r.waitlistMax),
    lateGraceMinutes: String(r.lateGraceMinutes),
  });
}
async function loadRules() {
  rulesErr.value = '';
  rulesLoadFailed.value = false;
  try {
    fillRules(await api.settings.classRules());
    rulesLoaded.value = true;
  } catch (e) {
    rulesErr.value = errorText(e, '团课规则加载失败');
    rulesLoadFailed.value = true;
  }
}
const int = (v: string) => (v.trim() === '' ? undefined : Number(v));
async function saveRules() {
  if (rulesBusy.value) return;
  rulesErr.value = '';
  const body = {
    cancelBeforeMinutes: int(rules.cancelBeforeMinutes),
    waitlist: rules.waitlist,
    waitlistMax: rules.waitlistUnlimited ? null : int(rules.waitlistMax),
    lateGraceMinutes: int(rules.lateGraceMinutes),
  };
  rulesErrs.value = classRulesErrors(body) ?? {};
  if (Object.keys(rulesErrs.value).length) return;
  rulesBusy.value = true;
  try {
    fillRules(await api.settings.saveClassRules(body as ClassRules));
    toast.success('团课规则已保存');
  } catch (e) {
    rulesErr.value = errorText(e, '保存失败，请重试');
  } finally {
    rulesBusy.value = false;
  }
}
</script>

<template>
  <header class="page-h">
    <div>
      <h1>课程排期</h1>
      <p>排好的课就是小程序里能约的课；取消一节课要写原因，已约的人退回次数</p>
    </div>
  </header>
  <ClassSchedule :types="types" :coaches="coaches" />

  <header class="sub-h">
    <h2>团课课程</h2>
    <p>停用后不能再排新课，已经排了的照常上；改了只影响以后排的课</p>
    <UiButton variant="primary" v-if="canEdit" @click="openForm(null)">新建团课课程</UiButton>
  </header>
  <ClassTypeForm v-model:open="formOpen" :type="editing" :types="types" :coaches="coaches" @saved="onSaved" />
  <p v-if="error" class="state error" role="alert">
    {{ error }}<UiButton size="sm" @click="load">重试</UiButton>
  </p>
  <section class="panel">
    <DataTable :columns="columns" :rows="types" row-key="id" :loading="loading" empty="还没有团课课程" :clickable="canEdit" @row-click="(t: ClassType) => canEdit && openForm(t)">
      <template #cell-active="{ row }">
        <span class="status" :class="{ off: !row.active }">{{ row.active ? '启用' : '已停用' }}</span>
        <UiButton variant="link" v-if="canEdit" :disabled="toggling !== null" @click.stop="toggle(row)" @keydown.enter.stop>{{ row.active ? '停用' : '启用' }}</UiButton>
      </template>
    </DataTable>
  </section>

  <header class="sub-h">
    <h2>私教</h2>
    <p>每位教练一行，按私教营业时间每小时一格</p>
  </header>
  <section class="panel">
    <CoachTimeline />
  </section>

  <section class="card">
    <h2>团课规则</h2>
    <p class="sub">取消截止、候补、迟到的规则等馆方定，下面是先填的占位值。{{ canRules ? '' : '只有老板能改。' }}</p>
    <form class="rules" novalidate @submit.prevent="saveRules">
      <fieldset :disabled="!canRules || rulesBusy || !rulesLoaded" :aria-busy="!rulesLoaded && !rulesLoadFailed">
        <Field label="开课前多少分钟截止自助取消" :error="rulesErrs.cancelBeforeMinutes" v-slot="f">
          <input v-model="rules.cancelBeforeMinutes" v-bind="f.attrs" type="number" min="0" step="1" />
        </Field>
        <label class="check"><input v-model="rules.waitlist" type="checkbox" /> 满员后可以排候补</label>
        <label class="check"><input v-model="rules.waitlistUnlimited" type="checkbox" :disabled="!rules.waitlist" /> 候补人数不限</label>
        <Field v-if="!rules.waitlistUnlimited" label="候补最多几人" :error="rulesErrs.waitlistMax" v-slot="f">
          <input v-model="rules.waitlistMax" v-bind="f.attrs" type="number" min="1" step="1" />
        </Field>
        <Field label="开课后多少分钟内签到不算迟到" :error="rulesErrs.lateGraceMinutes" v-slot="f">
          <input v-model="rules.lateGraceMinutes" v-bind="f.attrs" type="number" min="0" step="1" />
        </Field>
        <UiButton variant="primary" v-if="canRules" type="submit" class="save">{{ rulesBusy ? '保存中…' : '保存规则' }}</UiButton>
      </fieldset>
      <p v-if="rulesErr" class="state error" role="alert">
        {{ rulesErr }}<UiButton v-if="rulesLoadFailed" size="sm" @click="loadRules">重试</UiButton>
      </p>
    </form>
  </section>
</template>

<style scoped>
.page-h { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0 16px; }
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.panel { margin-bottom: 24px; }
.sub-h { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin-bottom: 8px; }
.sub-h h2 { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.sub-h p { flex: 1; margin: 0; font-size: 13px; color: var(--ink-muted); }
.card { padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.card h2 { margin: 0 0 4px; font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.save { justify-self: start; }
.sub { margin: 0 0 12px; font-size: 13px; color: var(--ink-muted); }
.rules fieldset { display: grid; gap: 12px; max-width: 360px; margin: 0; padding: 0; border: 0; }
.check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
.status { margin-right: 10px; font-size: 13px; }
.off { color: var(--ink-muted); }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
@media (max-width: 900px) {
  .sub-h { align-items: flex-start; }
  .sub-h p { flex-basis: 100%; order: 3; }
}
</style>
