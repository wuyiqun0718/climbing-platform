<script setup lang="ts">
/**
 * 改卡弹窗：调次数和到期日、帮会员冻结、解冻（任务 17），用 v-model:open，mode 选做哪件事。
 * 能不能改、能不能冻、要不要破例都由接口按 @climb/core 的 cardAdjust.ts / freeze.ts 判断，这里只负责显示和提交。改好 emit done。
 */
import { ApiError, type DeskFreezeOptions } from '@climb/api';
import { FREEZE_OVERRIDE_TEXT, type Card, type FreezeOverridable } from '@climb/core';
import { Field, Modal, errorText, reasonError, UiButton, UiDatePicker } from '@climb/ui-web';
import { formatDot } from '@climb/utils';
import { computed, ref, useId, watch } from 'vue';
import { api } from '../api';
import { canDo } from '../permissions';
import { session } from '../session';

export type CardAdjustMode = 'adjust' | 'freeze' | 'unfreeze';

const props = defineProps<{ open: boolean; mode: CardAdjustMode; card: Card }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; done: [message: string] }>();

const formId = useId();
const remaining = ref('');
const expiresOn = ref('');
const reason = ref('');
const days = ref('');
const note = ref('');
const overrideReason = ref('');
const options = ref<DeskFreezeOptions | null>(null);
/** 提交时接口说超了规则的那条；选项里没算到的（天数）靠这个才显示破例 */
const overHit = ref<FreezeOverridable | null>(null);
const err = ref('');
const reasonErr = ref('');
const busy = ref(false);

const counted = computed(() => 'remaining' in props.card);
const title = computed(() => ({ adjust: `调整 ${props.card.name}`, freeze: `冻结 ${props.card.name}`, unfreeze: `解冻 ${props.card.name}` })[props.mode]);
const canOverride = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'card.freezeOverride'));
const overrides = computed(() => {
  const list = [...(options.value?.needsOverride ?? [])];
  if (overHit.value && !list.includes(overHit.value)) list.push(overHit.value);
  return list;
});
const overrideText = computed(() => overrides.value.map(o => FREEZE_OVERRIDE_TEXT[o]).join('；'));
const limit = (n: number | null) => (n === null ? '不限' : `${n} 次`);

watch(
  () => props.open,
  v => {
    if (!v) return;
    const c = props.card;
    remaining.value = 'remaining' in c ? String(c.remaining) : '';
    expiresOn.value = c.expiresOn;
    reason.value = days.value = note.value = overrideReason.value = err.value = reasonErr.value = '';
    options.value = null;
    overHit.value = null;
    if (props.mode === 'freeze') loadOptions();
  },
  { immediate: true },
);

async function loadOptions() {
  try {
    options.value = await api.cards.freezeOptions(props.card.id);
    days.value ||= String(options.value.rules.minDays);
  } catch (e) {
    err.value = errorText(e, '冻结规则加载失败');
  }
}

const close = () => emit('update:open', false);

async function run(fn: () => Promise<string>) {
  if (busy.value) return;
  busy.value = true;
  err.value = '';
  try {
    const msg = await fn();
    close();
    emit('done', msg);
  } catch (e) {
    const code = e instanceof ApiError ? (e.data as { code?: string } | null)?.code : undefined;
    if (code && code in FREEZE_OVERRIDE_TEXT) overHit.value = code as FreezeOverridable;
    err.value = errorText(e);
  } finally {
    busy.value = false;
  }
}

function submit() {
  if (props.mode === 'adjust') {
    reasonErr.value = reasonError(reason.value);
    if (reasonErr.value) return;
    const c = props.card;
    const body: Parameters<typeof api.cards.adjust>[1] = { reason: reason.value.trim() };
    if (counted.value && remaining.value !== String((c as { remaining: number }).remaining)) body.remaining = Number(remaining.value);
    if (expiresOn.value !== c.expiresOn) body.expiresOn = expiresOn.value;
    return run(async () => {
      const r = await api.cards.adjust(c.id, body);
      return `已调整${r.followers.length ? '，后面的期限卡跟着挪了' : ''}`;
    });
  }
  if (props.mode === 'freeze') {
    if (overrides.value.length) {
      reasonErr.value = canOverride.value ? reasonError(overrideReason.value) : '';
      if (reasonErr.value) return;
    }
    return run(async () => {
      const r = await api.cards.freeze(props.card.id, { days: Number(days.value), note: note.value.trim(), overrideReason: overrideReason.value.trim() || undefined });
      return `已冻结到 ${formatDot(r.card.frozenUntil!)}${r.overridden.length ? '（破例）' : ''}`;
    });
  }
  return run(async () => {
    const r = await api.cards.unfreeze(props.card.id, { note: note.value.trim() });
    return `已解冻，到期日顺延 ${r.days} 天，到 ${formatDot(r.card.expiresOn)}`;
  });
}
</script>

<template>
  <Modal :open="open" :title="title" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <template v-if="mode === 'adjust'">
        <Field v-if="counted" label="剩余次数" v-slot="f">
          <input v-model="remaining" v-bind="f.attrs" type="number" min="0" step="1" :disabled="busy" />
        </Field>
        <Field label="到期日" hint="期限卡改了到期日，后面续的卡跟着挪" v-slot="f">
          <UiDatePicker v-model="expiresOn" v-bind="f.attrs" :disabled="busy" />
        </Field>
        <Field label="原因" required :error="reasonErr" v-slot="f">
          <textarea v-model="reason" v-bind="f.attrs" rows="2" :disabled="busy" />
        </Field>
      </template>

      <template v-else-if="mode === 'freeze'">
        <p v-if="options" class="note">
          规则：每月 {{ limit(options.rules.perMonth) }}，每年 {{ limit(options.rules.perYear) }}，每次 {{ options.rules.minDays }}–{{ options.rules.maxDays }} 天。
          这个会员本月还能冻 {{ options.monthLeft ?? '不限' }}{{ options.monthLeft === null ? '' : ' 次' }}，今年还能冻 {{ options.yearLeft ?? '不限' }}{{ options.yearLeft === null ? '' : ' 次' }}。从今天开始冻。
        </p>
        <p v-if="options?.blockedBy" class="warn" role="status">只有正在用的期限卡可以冻结。</p>
        <Field label="冻几天" required v-slot="f">
          <input v-model="days" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
        </Field>
        <Field label="备注" v-slot="f">
          <input v-model="note" v-bind="f.attrs" :disabled="busy" placeholder="比如：受伤、出差" />
        </Field>
        <template v-if="overrides.length">
          <p class="warn" role="status">{{ overrideText }}。{{ canOverride ? '要冻得写原因破例。' : '要店长以上写原因破例。' }}</p>
          <Field v-if="canOverride" label="破例原因" required :error="reasonErr" v-slot="f">
            <textarea v-model="overrideReason" v-bind="f.attrs" rows="2" :disabled="busy" />
          </Field>
        </template>
      </template>

      <template v-else>
        <p v-if="card.kind === 'period' && card.frozenFrom" class="note">
          {{ formatDot(card.frozenFrom) }} 开始冻结，原定冻到 {{ formatDot(card.frozenUntil!) }}。今天解冻，今天就能入场，到期日按实际冻结的天数顺延。
        </p>
        <Field label="备注" v-slot="f">
          <input v-model="note" v-bind="f.attrs" :disabled="busy" />
        </Field>
      </template>

      <p v-if="err" class="err" role="alert">{{ err }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="close">取消</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :disabled="busy || (mode === 'freeze' && !!options?.blockedBy)">{{ busy ? '提交中…' : '确认' }}</UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 14px; }
.note { margin: 0; font-size: 13px; color: var(--ink-muted); }
.warn, .err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
