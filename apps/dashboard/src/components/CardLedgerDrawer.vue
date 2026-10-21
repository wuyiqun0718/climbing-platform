<script setup lang="ts">
/** 一张卡的流水，从会员详情点卡打开。最新的在上面 */
import type { CardLedger, CardLedgerRow } from '@climb/api';
import { LEDGER_REASON_TEXT, ledgerAfterText, ledgerDeltaText } from '@climb/core';
import { DataTable, Modal, errorText, type Column } from '@climb/ui-web';
import { formatDotTime } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { createLatest } from '../pages/dashboard';

const props = defineProps<{ cardId: string | null; title: string }>();
const emit = defineEmits<{ close: [] }>();

const data = ref<CardLedger | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();

async function load() {
  if (!props.cardId) return;
  data.value = null;
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.cards.ledger(props.cardId!));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '卡流水加载失败');
}

watch(() => props.cardId, load, { immediate: true });

type Row = CardLedgerRow & { deltaText: string; afterText: string };
const rows = computed<Row[]>(() => {
  const d = data.value;
  if (!d) return [];
  return d.entries
    .map((e, i) => ({ ...e, deltaText: ledgerDeltaText(d.card, e, d.entries[i - 1]), afterText: ledgerAfterText(d.card, e) }))
    .reverse();
});

const columns: Column<Row>[] = [
  { key: 'at', label: '时间', format: r => formatDotTime(r.at) },
  { key: 'reason', label: '原因', format: r => LEDGER_REASON_TEXT[r.reason] },
  { key: 'deltaText', label: '变化', num: true },
  { key: 'afterText', label: '变化后' },
  { key: 'operatorName', label: '操作人', format: r => r.operatorName || '—' },
  { key: 'note', label: '备注', format: r => r.note || '—' },
];
</script>

<template>
  <Modal :open="!!cardId" :title="`${title} · 流水`" width="820px" @close="emit('close')">
    <p v-if="error" class="state error" role="alert">
      {{ error }}<button type="button" class="retry" @click="load">重试</button>
    </p>
    <DataTable v-else :columns="columns" :rows="rows" row-key="id" :loading="loading" empty="这张卡还没有流水" />
  </Modal>
</template>

<style scoped>
.state { margin: 0; font-size: 13px; }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 4px 10px; font: inherit; font-weight: 600; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
</style>
