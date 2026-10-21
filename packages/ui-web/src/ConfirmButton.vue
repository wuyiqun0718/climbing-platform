<script setup lang="ts">
/**
 * 要填原因的确认按钮：撤销入场、调整次数、退款都用它。
 * 点按钮 → 弹窗写原因 → 确认后调 action(reason)。action 抛错时弹窗不关，错误显示在弹窗里；
 * 成功后关弹窗、emit done，要不要发 toast 由页面决定。
 *   <ConfirmButton label="撤销" title="撤销这次入场" :action="r => api.voidCheckIn(id, r)" @done="reload" />
 */
import { ref, useId } from 'vue';
import Field from './Field.vue';
import Modal from './Modal.vue';
import UiButton from './UiButton.vue';
import { REASON_MAX_LENGTH, errorText, reasonError } from './overlay';

const props = withDefaults(
  defineProps<{
    /** 按钮上的字 */
    label: string;
    /** 弹窗标题，默认同 label */
    title?: string;
    /** 弹窗里的说明，比如「次卡会退回 1 次」 */
    message?: string;
    /** 弹窗里确认按钮的字 */
    confirmText?: string;
    reasonLabel?: string;
    reasonPlaceholder?: string;
    /** 原因是否必填；后台的撤销、调整、退款都是必填 */
    requireReason?: boolean;
    /** 危险操作：确认按钮用深色描边样式 */
    danger?: boolean;
    disabled?: boolean;
    /** 按钮样式：普通按钮还是表格里的文字链接 */
    variant?: 'button' | 'link';
    action: (reason: string) => Promise<unknown> | unknown;
  }>(),
  {
    confirmText: '确认',
    reasonLabel: '原因',
    reasonPlaceholder: '写清楚为什么，会记进操作日志',
    requireReason: true,
    danger: false,
    disabled: false,
    variant: 'button',
  },
);

const emit = defineEmits<{ done: [reason: string] }>();

const open = ref(false);
const busy = ref(false);
const reason = ref('');
const reasonErr = ref('');
const submitErr = ref('');
const formId = useId();

function start() {
  if (props.disabled) return;
  reason.value = '';
  reasonErr.value = '';
  submitErr.value = '';
  open.value = true;
}

async function submit() {
  if (busy.value) return;
  reasonErr.value = reasonError(reason.value, props.requireReason);
  if (reasonErr.value) return;
  const r = reason.value.trim();
  submitErr.value = '';
  busy.value = true;
  try {
    await props.action(r);
  } catch (e) {
    submitErr.value = errorText(e);
    return;
  } finally {
    busy.value = false;
  }
  open.value = false;
  emit('done', r);
}
</script>

<template>
  <UiButton :variant="variant === 'link' ? 'link' : 'secondary'" :disabled="disabled" @click="start">{{ label }}</UiButton>
  <Modal v-model:open="open" :title="title ?? label" :busy="busy" :close-on-backdrop="false">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <p v-if="message" class="msg">{{ message }}</p>
      <Field :label="reasonLabel" :required="requireReason" :error="reasonErr" v-slot="f">
        <textarea
          v-model="reason"
          v-bind="f.attrs"
          rows="3"
          :maxlength="REASON_MAX_LENGTH"
          :placeholder="reasonPlaceholder"
          autofocus
          @input="reasonErr = ''"
          @keydown.enter.meta.prevent="submit"
          @keydown.enter.ctrl.prevent="submit"
        />
      </Field>
      <p v-if="submitErr" class="err" role="alert">{{ submitErr }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="open = false">取消</UiButton>
      <UiButton type="submit" variant="primary" :danger="danger" :form="formId" :disabled="busy">
        {{ busy ? '提交中…' : confirmText }}
      </UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 12px; }
.msg { margin: 0; font-size: 14px; color: var(--ink-muted); }
.err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
