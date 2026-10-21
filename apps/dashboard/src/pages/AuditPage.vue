<script setup lang="ts">
/**
 * 操作日志（任务 23），只读：谁、什么时候、做了什么、原因、改前改后。跟顶部门店切换联动；看全部门店时也有卡种、员工这类全馆的。
 * 动作名和文字在 @climb/core 的 audit.ts，能看哪些在 permissions.ts（audit 页、canSeeAllAuditLogs，等馆方）。
 */
import { type AuditLogRow, type PageOf } from '@climb/api';
import { AUDIT_ACTIONS, AUDIT_ACTION_TEXT, type AuditAction } from '@climb/core';
import { DataTable, Pager, errorText, type Column, UiButton } from '@climb/ui-web';
import { formatDotTime } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { session, storeLabel } from '../session';
import { createLatest } from './dashboard';

const action = ref<AuditAction | ''>('');
const page = ref(1);
const data = ref<PageOf<AuditLogRow> | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();

async function load() {
  const storeId = session.state.storeId;
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.auditLogs({ ...(storeId ? { store: storeId } : {}), ...(action.value ? { action: action.value } : {}), page: page.value }));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '操作日志加载失败');
}

watch(() => [session.state.staff?.id, session.state.storeId, action.value], () => (page.value = 1));
watch(() => [session.state.staff?.id, session.state.storeId, action.value, page.value], () => session.state.staff && load(), { immediate: true });

const storeNameOf = (id: string | null) => (id ? storeLabel(id) : '全馆');
const show = (v: unknown) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
/** 改前改后：一个字段一行，「字段：前 → 后」；新建的只列改后 */
function changeText(r: AuditLogRow): string {
  const b = r.before ?? {};
  const a = r.after ?? {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
  return keys.map(k => (r.before ? `${k}：${show(b[k])} → ${show(a[k])}` : `${k}：${show(a[k])}`)).join('\n') || '—';
}

const columns = computed<Column<AuditLogRow>[]>(() => [
  { key: 'at', label: '时间', format: r => formatDotTime(r.at) },
  { key: 'staffName', label: '操作人' },
  ...(session.state.storeId === null ? [{ key: 'storeId', label: '门店', format: (r: AuditLogRow) => storeNameOf(r.storeId) }] : []),
  { key: 'action', label: '操作', format: r => AUDIT_ACTION_TEXT[r.action] },
  { key: 'targetId', label: '对象', format: r => `${r.targetType} ${r.targetId}` },
  { key: 'reason', label: '原因', format: r => r.reason || '—' },
  { key: 'change', label: '改前 → 改后' },
]);
</script>

<template>
  <header class="page-h">
    <div>
      <h1>操作日志</h1>
      <p>开卡、入场、撤销、调整、冻结、退款、改卡种、员工变更都记在这里；只能看，不能改</p>
    </div>
    <label class="filter">操作
      <select v-model="action">
        <option value="">全部</option>
        <option v-for="a in AUDIT_ACTIONS" :key="a" :value="a">{{ AUDIT_ACTION_TEXT[a] }}</option>
      </select>
    </label>
  </header>
  <p v-if="error" class="state error" role="alert">
    {{ error }}<UiButton size="sm" @click="load">重试</UiButton>
  </p>
  <section class="panel">
    <DataTable :columns="columns" :rows="data?.items ?? []" row-key="id" :loading="loading" empty="还没有操作记录">
      <template #cell-change="{ row }">
        <pre class="change">{{ changeText(row) }}</pre>
      </template>
    </DataTable>
    <Pager v-if="data && data.total > 0" class="pager" :page="data.page" :page-size="data.pageSize" :total="data.total" :disabled="loading" @update:page="p => (page = p)" />
  </section>
</template>

<style scoped>
.page-h { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0 16px; }
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.filter { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.filter select { padding: 5px 8px; font: inherit; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); }
.change { margin: 0; font: inherit; font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--ink-muted); }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.pager { margin-top: 12px; }
</style>
