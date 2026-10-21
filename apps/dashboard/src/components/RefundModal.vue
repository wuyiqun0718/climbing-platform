<script setup lang="ts">
/**
 * 退款弹窗（任务 18），用 v-model:open。打开时拉退款预览（还能退多少、建议金额、怎么退），金额默认填建议的，前台可以改。
 * 能不能退、最多退多少、卡怎么变都由接口按 @climb/core 的 refund.ts 判断，这里只负责显示和提交。退好 emit done。
 */
import { ApiError, REFUND_METHOD_TEXT, REFUND_STATUS_TEXT, type RefundPreview, type RefundResult } from '@climb/api';
import { parseYuanInput, refundBasisText } from '@climb/core';
import { Field, Modal, errorText, reasonError, UiButton } from '@climb/ui-web';
import { formatDot, formatYuan } from '@climb/utils';
import { computed, ref, useId, watch } from 'vue';
import { api } from '../api';

const props = defineProps<{ open: boolean; orderId: string }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; done: [result: RefundResult] }>();

const BLOCKED_TEXT: Record<string, string> = {
  'order-not-paid': '这个订单还没付款，不用退。',
  'refund-channel-unsupported': '美团的订单去美团后台退。',
  'order-fully-refunded': '这个订单已经退完了。',
};

const formId = useId();
const preview = ref<RefundPreview | null>(null);
const amount = ref('');
const reason = ref('');
const err = ref('');
const amountErr = ref('');
const reasonErr = ref('');
const busy = ref(false);
let requestId = '';

const yuanText = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const basis = computed(() => (preview.value ? refundBasisText(preview.value.basis) : ''));

watch(
  () => props.open,
  v => {
    if (!v) return;
    requestId = newRequestId();
    preview.value = null;
    amount.value = reason.value = err.value = amountErr.value = reasonErr.value = '';
    load();
  },
  { immediate: true },
);

async function load() {
  try {
    preview.value = await api.orders.refundPreview(props.orderId);
    if (!preview.value.blockedBy) amount.value = yuanText(preview.value.suggestedCents);
  } catch (e) {
    err.value = errorText(e, '订单加载失败');
  }
}

const close = () => emit('update:open', false);

async function submit() {
  const p = preview.value;
  if (busy.value || !p || p.blockedBy) return;
  amountErr.value = '';
  reasonErr.value = reasonError(reason.value);
  if (reasonErr.value) return;
  busy.value = true;
  err.value = '';
  try {
    const r = await api.orders.refund(props.orderId, { requestId, amountCents: parseYuanInput(amount.value), reason: reason.value.trim() });
    close();
    emit('done', r);
  } catch (e) {
    // 金额不对（400 amountCents）、超了（422 refund-exceeds）显示在金额下面
    const data = e instanceof ApiError ? (e.data as { code?: string; field?: string } | null) : null;
    if (data?.field === 'amountCents' || data?.code === 'refund-exceeds') amountErr.value = errorText(e);
    else err.value = errorText(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" title="退款" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <template v-if="preview">
        <p class="note">
          {{ preview.memberName }} · {{ preview.order.productName }} · 实付 {{ formatYuan(preview.order.amountCents) }}
          <template v-if="preview.order.paidOn">（{{ formatDot(preview.order.paidOn) }}）</template>
        </p>
        <ul v-if="preview.refunds.length" class="note history">
          <li v-for="r in preview.refunds" :key="r.id">
            {{ r.refundedOn ? formatDot(r.refundedOn) : '' }} {{ REFUND_STATUS_TEXT[r.status] }} {{ formatYuan(r.amountCents) }}：{{ r.reason }}
          </li>
        </ul>
        <p v-if="preview.blockedBy" class="warn" role="status">{{ BLOCKED_TEXT[preview.blockedBy] ?? '这个订单不能退' }}</p>
        <template v-else>
          <p class="note">
            最多还能退 {{ formatYuan(preview.refundableCents) }}，{{ preview.method ? REFUND_METHOD_TEXT[preview.method] : '' }}{{ preview.method === 'offline' ? '（钱在前台退给会员，这里只记录）' : '' }}。
            <template v-if="basis">按{{ basis }}折算，建议退 {{ formatYuan(preview.suggestedCents) }}。</template>
            <template v-if="preview.card">退款后{{ preview.card.name }}不能再用。</template>
          </p>
          <Field label="退款金额（元）" required :error="amountErr" v-slot="f">
            <input v-model="amount" v-bind="f.attrs" inputmode="decimal" :disabled="busy" />
          </Field>
          <Field label="原因" required :error="reasonErr" v-slot="f">
            <textarea v-model="reason" v-bind="f.attrs" rows="2" :disabled="busy" />
          </Field>
        </template>
      </template>
      <p v-else-if="!err" class="note">加载中…</p>
      <p v-if="err" class="err" role="alert">{{ err }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="close">取消</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :disabled="busy || !preview || !!preview.blockedBy">{{ busy ? '提交中…' : '确认退款' }}</UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 14px; }
.form input, .form textarea { font: inherit; }
.note { margin: 0; font-size: 13px; color: var(--ink-muted); }
.history { padding-left: 18px; }
.warn, .err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
