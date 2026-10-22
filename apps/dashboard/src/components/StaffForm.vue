<script setup lang="ts">
/**
 * 新建、修改员工的弹窗（任务 22），用 v-model:open；staff 为空是新建。
 * 校验在 @climb/core 的 staff.ts（newStaffErrors / staffPatchErrors），停用、降级自己等由接口按 staffChangeBlockedBy 拦，这里只负责显示和提交。
 * 修改时密码框留空就是不改；填了就是重置密码（这个员工要重新登录）。
 * 教练资料（任务 28）：勾上「是教练」填标签、简介、头像链接、单节价、接私教的店（只能从上面能操作的店里选），校验在 core 的 coach.ts。
 */
import type { StaffRow } from '@climb/api';
import { STAFF_ROLES, STAFF_ROLE_TEXT, coachProfileErrors, newStaffErrors, parseYuanInput, staffPatchErrors, type CoachProfile, type StaffErrors, type StaffInput, type StaffPatch, type StaffRole } from '@climb/core';
import { Field, Modal, errorText, UiButton, UiSelect } from '@climb/ui-web';
import { computed, reactive, ref, useId, watch } from 'vue';
import { api } from '../api';
import { session } from '../session';
import { badField } from './memberForm';

const ROLE_OPTIONS = STAFF_ROLES.map(r => ({ value: r, label: STAFF_ROLE_TEXT[r] }));

const props = defineProps<{ open: boolean; staff: StaffRow | null; all: StaffRow[] }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [row: StaffRow, created: boolean] }>();

const formId = useId();
const form = reactive({ phone: '', name: '', role: 'desk' as StaffRole, allStores: false, storeIds: [] as string[], password: '' });
const coach = reactive({ on: false, tags: '', bio: '', avatarUrl: '', price: '', storeIds: [] as string[] });
const coachErr = ref('');
/** 接私教的店只能从能操作的店里选 */
const coachStores = computed(() => (form.allStores ? session.state.stores : session.state.stores.filter(st => form.storeIds.includes(st.id))));
const errs = ref<StaffErrors>({});
const err = ref('');
const busy = ref(false);

watch(
  () => props.open,
  v => {
    if (!v) return;
    const s = props.staff;
    Object.assign(form, {
      phone: s?.phone ?? '',
      name: s?.name ?? '',
      role: s?.role ?? 'desk',
      allStores: s ? s.storeIds.length === 0 : false,
      storeIds: s ? [...s.storeIds] : [],
      password: '',
    });
    const c = s?.coach;
    Object.assign(coach, {
      on: !!c,
      tags: c?.tags.join('、') ?? '',
      bio: c?.bio ?? '',
      avatarUrl: c?.avatarUrl ?? '',
      price: c ? String(c.priceCents / 100) : '',
      storeIds: c ? [...c.storeIds] : [],
    });
    coachErr.value = '';
    errs.value = {};
    err.value = '';
  },
  { immediate: true },
);

async function submit() {
  if (busy.value) return;
  err.value = '';
  const ctx = { storeIds: session.state.stores.map(st => st.id), staff: props.all };
  const s = props.staff;
  const body: StaffInput | StaffPatch = s
    ? { phone: form.phone, name: form.name, role: form.role, allStores: form.allStores, storeIds: form.storeIds, ...(form.password ? { password: form.password } : {}) }
    : { ...form };
  errs.value = (s ? staffPatchErrors(s.id, body, ctx) : newStaffErrors(body, ctx)) ?? {};
  const profile: CoachProfile | null = coach.on
    ? { tags: coach.tags.split(/[、,，\s]+/), bio: coach.bio, avatarUrl: coach.avatarUrl.trim() || null, priceCents: parseYuanInput(coach.price), storeIds: coach.storeIds }
    : null;
  const ce = profile && coachProfileErrors(profile, form.allStores ? [] : form.storeIds, ctx.storeIds);
  coachErr.value = ce ? Object.values(ce)[0]! : '';
  if (Object.keys(errs.value).length || coachErr.value) return;
  body.coach = profile;
  busy.value = true;
  try {
    const row = s ? await api.staff.update(s.id, body) : await api.staff.create(body as StaffInput);
    emit('update:open', false);
    emit('saved', row, !s);
  } catch (e) {
    const field = badField(e);
    if (field === 'coach') coachErr.value = errorText(e);
    else if (field && field in form) errs.value = { [field]: errorText(e) };
    else err.value = errorText(e, '保存失败，请重试');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="staff ? `修改 ${staff.name}` : '新增员工'" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <Field label="手机号" required hint="登录用，不能跟别的员工重复" :error="errs.phone" v-slot="f">
        <input v-model="form.phone" v-bind="f.attrs" inputmode="tel" :disabled="busy" />
      </Field>
      <Field label="名字" required :error="errs.name" v-slot="f">
        <input v-model="form.name" v-bind="f.attrs" :disabled="busy" />
      </Field>
      <Field label="角色" required :error="errs.role" v-slot="f">
        <UiSelect v-model="form.role" v-bind="f.attrs" :disabled="busy" :options="ROLE_OPTIONS" />
      </Field>
      <fieldset class="stores" :disabled="busy">
        <legend>可操作门店</legend>
        <label class="check"><input v-model="form.allStores" type="checkbox" /> 全部门店</label>
        <template v-if="!form.allStores">
          <label v-for="st in session.state.stores" :key="st.id" class="check"><input v-model="form.storeIds" type="checkbox" :value="st.id" /> {{ st.name }}</label>
        </template>
        <p v-if="errs.storeIds" class="err" role="alert">{{ errs.storeIds }}</p>
      </fieldset>
      <fieldset class="stores" :disabled="busy">
        <legend>教练</legend>
        <label class="check"><input v-model="coach.on" type="checkbox" /> 是教练（小程序约私教能看到）</label>
        <template v-if="coach.on">
          <Field label="标签" hint="用顿号隔开，比如：抱石、零基础" v-slot="f"><input v-model="coach.tags" v-bind="f.attrs" /></Field>
          <Field label="简介" v-slot="f"><textarea v-model="coach.bio" v-bind="f.attrs" rows="2" /></Field>
          <Field label="头像链接" hint="https 开头的图片链接，可以不填" v-slot="f"><input v-model="coach.avatarUrl" v-bind="f.attrs" /></Field>
          <Field label="单节价（元）" required v-slot="f"><input v-model="coach.price" v-bind="f.attrs" inputmode="decimal" /></Field>
          <span class="sub">接私教的店</span>
          <label v-for="st in coachStores" :key="st.id" class="check"><input v-model="coach.storeIds" type="checkbox" :value="st.id" /> {{ st.name }}</label>
          <p class="sub">提成规则等馆方定，先不算。</p>
        </template>
        <p v-if="coachErr" class="err" role="alert">{{ coachErr }}</p>
      </fieldset>
      <Field :label="staff ? '重置密码' : '初始密码'" :required="!staff" :hint="staff ? '不改就留空；改了以后这个员工要重新登录' : ''" :error="errs.password" v-slot="f">
        <input v-model="form.password" v-bind="f.attrs" type="password" autocomplete="new-password" :disabled="busy" />
      </Field>
      <p v-if="err" class="err" role="alert">{{ err }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="emit('update:open', false)">取消</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 14px; }
.stores { display: grid; gap: 6px; margin: 0; padding: 0; border: 0; font-size: 13.5px; }
.stores legend { margin-bottom: 6px; font-weight: 600; }
.check { display: flex; align-items: center; gap: 8px; }
.sub { margin: 0; font-size: 12.5px; color: var(--ink-muted); }
.err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
