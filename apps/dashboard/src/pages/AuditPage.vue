<script setup lang="ts">
/**
 * 操作日志（任务 23），只读：谁、什么时候、做了什么、原因、改前改后。跟顶部门店切换联动；看全部门店时也有卡种、员工这类全馆的。
 * 动作名和文字在 @climb/core 的 audit.ts，改前改后的文字在 auditText.ts；能看哪些在 permissions.ts（audit 页、canSeeAllAuditLogs，等馆方）。
 */
import { type AuditLogRow, type PageOf } from '@climb/api';
import { AUDIT_ACTIONS, AUDIT_ACTION_TEXT, auditChangeLines, auditTargetText, type AuditAction } from '@climb/core';
import { DataTable, Pager, errorText, type Column, UiButton, UiSelect } from '@climb/ui-web';
import { formatDotTime } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { session, storeLabel } from '../session';
import { createLatest } from './dashboard';

const ACTION_OPTIONS = [{ value: '' as const, label: '全部' }, ...AUDIT_ACTIONS.map(a => ({ value: a, label: AUDIT_ACTION_TEXT[a] }))];

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

/** 员工 id → 名字（团课、私教的教练）：员工名单只有馆长能拿，拿不到用教练列表，都拿不到显示 id */
const staffNames = ref(new Map<string, string>());
async function loadStaffNames() {
  const rows = await api.staff.list().catch(() => api.coaches()).catch(() => []);
  staffNames.value = new Map(rows.map(s => [s.id, s.name]));
}
watch(() => session.state.staff?.id, id => id && loadStaffNames(), { immediate: true });

const storeNameOf = (id: string | null) => (id ? storeLabel(id) : '全馆');
const textCtx = computed(() => ({ storeName: storeLabel, staffName: (id: string) => staffNames.value.get(id) ?? id }));
/** 改前改后：一个字段一行，「字段：前 → 后」；新建的只列改后 */
const changeText = (r: AuditLogRow) => auditChangeLines(r, textCtx.value).join('\n') || '—';

const columns = computed<Column<AuditLogRow>[]>(() => [
  { key: 'at', label: '时间', format: r => formatDotTime(r.at) },
  { key: 'staffName', label: '操作人' },
  ...(session.state.storeId === null ? [{ key: 'storeId', label: '门店', format: (r: AuditLogRow) => storeNameOf(r.storeId) }] : []),
  { key: 'action', label: '操作', format: r => AUDIT_ACTION_TEXT[r.action] },
  { key: 'targetId', label: '对象', wrap: true, format: r => auditTargetText(r, textCtx.value) },
  { key: 'reason', label: '原因', wrap: true, format: r => r.reason || '—' },
  { key: 'change', label: '改前 → 改后', wrap: true },
]);
</script>

<template>
  <header class="page-h">
    <div>
      <h1>操作日志</h1>
      <p>开卡、入场、撤销、调整、冻结、退款、改卡种、员工变更都记在这里；只能看，不能改</p>
    </div>
    <label class="filter">操作
      <UiSelect v-model="action" size="sm" :options="ACTION_OPTIONS" />
    </label>
  </header>
  <p v-if="error" class="state error" role="alert">
    {{ error }}<UiButton size="sm" @click="load">重试</UiButton>
  </p>
  <section class="panel">
    <DataTable :columns="columns" :rows="data?.items ?? []" row-key="id" :loading="loading" :empty="action ? '这类操作还没有记录' : '还没有操作记录。开卡、入场、退款、改卡种这些操作做了以后会记在这里'" :error="!!error" stack>
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
.change { margin: 0; font: inherit; font-size: 12px; white-space: pre-wrap; word-break: break-all; color: var(--ink-muted); }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.pager { margin-top: 12px; }
</style>
