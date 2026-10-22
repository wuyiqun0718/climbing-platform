<script setup lang="ts">
/**
 * 新建、修改团课课程种类的弹窗（任务 25），用 v-model:open；type 为空是新建。
 * 校验在 @climb/core 的 classTypes.ts，这里只负责显示和提交。改种类不影响已排的课。
 * 默认教练从教练列表选（GET /admin/coaches，在用、有教练资料的员工），列表里没有的只显示现在的。
 */
import { classTypePatchErrors, newClassTypeErrors, type ClassType, type ClassTypeErrors, type ClassTypeInput, type ClassTypePatch } from '@climb/core';
import { Field, Modal, errorText, UiButton, UiSelect } from '@climb/ui-web';
import { computed, reactive, ref, useId, watch } from 'vue';
import { api } from '../api';
import { badField } from './memberForm';

const props = defineProps<{ open: boolean; type: ClassType | null; types: ClassType[]; coaches: { id: string; name: string }[] }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [type: ClassType, created: boolean] }>();

const formId = useId();
const form = reactive({ name: '', minutes: '', capacity: '', credits: '1', coachId: '' });
const errs = ref<ClassTypeErrors>({});
const err = ref('');
const busy = ref(false);
// 现在的教练不在列表里（停用了）也留着显示
const coachOptions = computed(() => [
  { value: '', label: '不指定' },
  ...props.coaches.map(c => ({ value: c.id, label: c.name })),
  ...(form.coachId && !props.coaches.some(c => c.id === form.coachId) ? [{ value: form.coachId, label: form.coachId }] : []),
]);

watch(
  () => props.open,
  v => {
    if (!v) return;
    const t = props.type;
    Object.assign(form, {
      name: t?.name ?? '',
      minutes: t ? String(t.minutes) : '60',
      capacity: t ? String(t.capacity) : '',
      credits: t ? String(t.credits) : '1',
      coachId: t?.coachId ?? '',
    });
    errs.value = {};
    err.value = '';
  },
  { immediate: true },
);

const int = (v: string) => (v.trim() === '' ? undefined : Number(v));

async function submit() {
  if (busy.value) return;
  err.value = '';
  const t = props.type;
  const ctx = { types: props.types, coachIds: props.coaches.map(c => c.id) };
  const common = { name: form.name, minutes: int(form.minutes), capacity: int(form.capacity), credits: int(form.credits) };
  const body = t ? { ...common, coachId: form.coachId || null } : { ...common, ...(form.coachId ? { coachId: form.coachId } : {}) };
  errs.value = (t ? classTypePatchErrors(t, body, ctx) : newClassTypeErrors(body, ctx)) ?? {};
  if (Object.keys(errs.value).length) return;
  busy.value = true;
  try {
    const saved = t ? await api.classTypes.update(t.id, body as ClassTypePatch) : await api.classTypes.create(body as ClassTypeInput);
    emit('update:open', false);
    emit('saved', saved, !t);
  } catch (e) {
    const field = badField(e);
    if (field && field in form) errs.value = { [field]: errorText(e) };
    else err.value = errorText(e, '保存失败，请重试');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="type ? `修改 ${type.name}` : '新建团课课程'" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <p v-if="type" class="note">改了只影响以后排的课，已经排了的课照原来的上。</p>
      <Field label="课程名" required :error="errs.name" v-slot="f">
        <input v-model="form.name" v-bind="f.attrs" :disabled="busy" />
      </Field>
      <Field label="时长（分钟）" required :error="errs.minutes" v-slot="f">
        <input v-model="form.minutes" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
      </Field>
      <Field label="人数上限" required hint="排课时可以单独改" :error="errs.capacity" v-slot="f">
        <input v-model="form.capacity" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
      </Field>
      <Field label="每节扣团课课包几次" required :error="errs.credits" v-slot="f">
        <input v-model="form.credits" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
      </Field>
      <Field label="默认教练" :error="errs.coachId" v-slot="f">
        <UiSelect v-model="form.coachId" v-bind="f.attrs" :disabled="busy" :options="coachOptions" />
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
.form input { font: inherit; }
.note { margin: 0; font-size: 13px; color: var(--ink-muted); }
.err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
