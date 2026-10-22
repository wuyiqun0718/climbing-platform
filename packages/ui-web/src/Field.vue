<script setup lang="ts">
/**
 * 表单项：标签、必填星号、提示、错误文案。输入框放默认插槽，
 * 插槽给出 id 和 aria 属性，绑到输入框上标签和读屏才对得上：
 *   <Field label="手机号" required :error="err" v-slot="f">
 *     <input v-model="phone" v-bind="f.attrs" />
 *   </Field>
 */
import { computed, useId } from 'vue';

const props = defineProps<{
  label: string;
  required?: boolean;
  /** 有值就显示成错误，并给输入框标 aria-invalid */
  error?: string;
  /** 输入框下面的灰色说明 */
  hint?: string;
}>();

const id = useId();
const hintId = `${id}-hint`;
const errorId = `${id}-error`;

const attrs = computed(() => {
  const describedBy = [props.hint ? hintId : '', props.error ? errorId : ''].filter(Boolean).join(' ');
  return {
    id,
    'aria-invalid': props.error ? true : undefined,
    'aria-required': props.required ? true : undefined,
    'aria-describedby': describedBy || undefined,
  };
});

defineSlots<{ default(props: { id: string; attrs: typeof attrs.value }): unknown }>();
</script>

<template>
  <div class="field" :class="{ invalid: !!error }">
    <label class="label" :for="id">
      {{ label }}<span v-if="required" class="req" aria-hidden="true">*</span>
    </label>
    <slot :id="id" :attrs="attrs" />
    <p v-if="hint" :id="hintId" class="hint">{{ hint }}</p>
    <p v-if="error" :id="errorId" class="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.field { display: grid; gap: 6px; }
.label { font-size: 13px; font-weight: 700; }
.req { margin-left: 2px; color: var(--brand); }
.hint { margin: 0; font-size: 12px; color: var(--ink-muted); }
.error { margin: 0; padding: 6px 10px; font-size: 12.5px; background: var(--accent-soft); border-radius: var(--radius-sm); }
/* 输入框的边框、高度、聚焦圈在 forms.css，这里只让它们占满一行 */
.field :slotted(input),
.field :slotted(textarea),
.field :slotted(.ui-select),
.field :slotted(.ui-date) { display: block; width: 100%; }
</style>
