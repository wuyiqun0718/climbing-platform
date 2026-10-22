<script setup lang="ts">
/**
 * 手动登记入场弹窗（会员手机没电时前台代登记），用 v-model:open。
 * 能用哪些卡、扣几次、同日再次入场不扣都由接口按 @climb/core 的 checkIn.ts 算好返回，这里只负责显示和提交。登记好 emit created。
 */
import type { DeskCheckInPreview, DeskCheckInResult } from '@climb/api';
import { ENTRY_BLOCKED_TEXT, POLICY_STATUS_TEXT, cardText, type Card } from '@climb/core';
import { Field, Modal, errorText, UiButton, UiSelect } from '@climb/ui-web';
import { toDateKey } from '@climb/utils';
import { computed, ref, useId, watch } from 'vue';
import { api } from '../api';
import { storeOptions } from '../permissions';
import { session } from '../session';

const props = defineProps<{ open: boolean; member: { id: string; name: string } }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; created: [result: DeskCheckInResult] }>();

const formId = useId();
const storeId = ref('');
const preview = ref<DeskCheckInPreview | null>(null);
const loading = ref(false);
const loadErr = ref('');
const cardId = ref('');
const submitErr = ref('');
const busy = ref(false);
let requestId = '';
let seq = 0;
/** 上一次按哪家店拉的，换店才重新拉 */
let loadedFor = '';

const today = toDateKey(new Date());
const stores = computed(() => (session.state.staff ? storeOptions(session.state.staff, session.state.stores).filter(o => o.id !== null) : []));
const usable = computed(() => preview.value?.options.filter(o => o.usable) ?? []);
const text = (c: Card) => {
  const t = cardText(c, today);
  return [t.kind, `${t.value} ${t.unit}`.trim(), t.meta].join(' · ');
};
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function load() {
  if (!storeId.value) return;
  const mine = ++seq;
  loadedFor = storeId.value;
  loading.value = true;
  loadErr.value = '';
  try {
    const p = await api.checkIns.preview({ memberId: props.member.id, storeId: storeId.value });
    if (mine !== seq) return;
    preview.value = p;
    if (!p.options.some(o => o.usable && o.card.id === cardId.value)) cardId.value = p.options.find(o => o.usable)?.card.id ?? '';
  } catch (e) {
    if (mine === seq) loadErr.value = errorText(e, '卡加载失败');
  } finally {
    if (mine === seq) loading.value = false;
  }
}

watch(
  () => props.open,
  v => {
    if (!v) return;
    requestId = newRequestId();
    preview.value = null;
    cardId.value = '';
    submitErr.value = '';
    storeId.value = session.state.storeId ?? stores.value[0]?.id ?? '';
    load();
  },
  { immediate: true },
);

watch(storeId, v => props.open && v !== loadedFor && load());

const close = () => emit('update:open', false);

async function submit() {
  if (busy.value) return;
  submitErr.value = '';
  if (!storeId.value) return void (submitErr.value = '请选门店');
  if (!cardId.value) return void (submitErr.value = '请选一张卡');
  busy.value = true;
  try {
    const res = await api.checkIns.create({ requestId, memberId: props.member.id, storeId: storeId.value, cardId: cardId.value });
    close();
    emit('created', res);
  } catch (e) {
    submitErr.value = errorText(e, '登记失败，请重试');
    load();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" title="登记入场" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <p class="picked">会员：<b>{{ member.name || '没填名字' }}</b></p>
      <Field label="入场门店" required v-slot="f">
        <UiSelect v-model="storeId" v-bind="f.attrs" :disabled="busy" :options="stores.map(s => ({ value: s.id!, label: s.name }))" />
      </Field>

      <p v-if="preview && !preview.waiverSigned" class="warn" role="status">还没签风险告知书。登记后请让会员手机有电时在小程序里补签。</p>
      <p v-if="preview?.reentry" class="note">今天已经入过场，这次不扣次。</p>
      <p v-if="preview" class="note">{{ preview.insurance.needed ? '确认后投当日保险。' : `今天的保险已经投了（${POLICY_STATUS_TEXT[preview.insurance.status!]}），不再重复投。` }}</p>

      <fieldset class="cards" :disabled="busy">
        <legend>用哪张卡</legend>
        <p v-if="loading && !preview" class="hint">加载中…</p>
        <p v-else-if="loadErr" class="err" role="alert">{{ loadErr }}<UiButton size="sm" @click="load">重试</UiButton></p>
        <p v-else-if="preview && !preview.options.length" class="hint">没有能用的卡。先收款开卡（比如单次票），再来登记。</p>
        <label v-for="o in preview?.options ?? []" :key="o.card.id" class="opt" :class="{ off: !o.usable }">
          <input v-model="cardId" type="radio" name="card" :value="o.card.id" :disabled="!o.usable" />
          <span class="name">{{ o.card.name }}</span>
          <small>{{ text(o.card) }}</small>
          <b class="deduct">{{ !o.usable && o.blockedBy ? ENTRY_BLOCKED_TEXT[o.blockedBy] : o.deducts ? `扣 ${o.deducts} 次` : '不扣次' }}</b>
        </label>
      </fieldset>
      <p v-if="submitErr" class="err" role="alert">{{ submitErr }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="close">取消</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :disabled="busy || !usable.length || !cardId">{{ busy ? '提交中…' : '确认入场' }}</UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 14px; }
.picked { margin: 0; padding: 9px 12px; background: var(--neutral-soft); border-radius: var(--radius-sm); }
.cards { display: grid; gap: 6px; margin: 0; padding: 0; border: 0; }
.cards legend { margin-bottom: 6px; font-size: 13px; font-weight: 700; }
.opt { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 2px 10px; padding: 9px 12px; border: 1px solid var(--line); border-radius: var(--radius-sm); cursor: pointer; }
.opt small { grid-column: 2; font-size: 12px; color: var(--ink-muted); }
.opt .deduct { grid-column: 3; grid-row: 1 / span 2; font-size: 12.5px; }
.opt.off { cursor: default; opacity: 0.55; }
.hint, .note { margin: 0; font-size: 13px; color: var(--ink-muted); }
.warn, .err { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
