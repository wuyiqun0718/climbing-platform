<script setup lang="ts">
/**
 * 分享记录（任务 21）：次卡转赠和老带新，挂在入场记录页的「分享」tab，跟顶部门店切换联动（按发起人的归属门店）。
 * 状态由接口按 @climb/core 的 shareRecordState 推导，文字用 core 的 SHARE_RECORD_STATE_TEXT，跟小程序一致。
 */
import type { ShareList, ShareRow } from '@climb/api';
import { SHARE_KIND_TEXT, SHARE_RECORD_STATE_TEXT, type Share } from '@climb/core';
import { DataTable, errorText, type Column } from '@climb/ui-web';
import { formatDot } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { createLatest } from '../pages/dashboard';
import { session } from '../session';

const kind = ref<Share['kind'] | ''>('');
const data = ref<ShareList | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();
const router = useRouter();

const storeNameOf = (id: string) => session.state.stores.find(s => s.id === id)?.name ?? id;

async function load() {
  const storeId = session.state.storeId;
  if (data.value && data.value.storeId !== storeId) data.value = null;
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.shares({ ...(storeId ? { store: storeId } : {}), ...(kind.value ? { kind: kind.value } : {}) }));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '分享记录加载失败');
}

watch(() => [session.state.staff?.id, session.state.storeId, kind.value], () => session.state.staff && load(), { immediate: true });

const stateText = (r: ShareRow) => (r.state === 'used' && r.usedOn ? `${SHARE_RECORD_STATE_TEXT.used}（${formatDot(r.usedOn)}）` : SHARE_RECORD_STATE_TEXT[r.state]);

const columns = computed<Column<ShareRow>[]>(() => [
  { key: 'createdOn', label: '发出', format: r => formatDot(r.createdOn) },
  { key: 'kind', label: '类型', format: r => SHARE_KIND_TEXT[r.kind] },
  { key: 'fromMemberName', label: '发起人', format: r => r.fromMemberName || '（没填名字）' },
  ...(session.state.storeId === null ? [{ key: 'storeId', label: '门店', format: (r: ShareRow) => storeNameOf(r.storeId) }] : []),
  { key: 'claimerName', label: '领取人', format: r => (r.claimerId ? r.claimerName || '（没填名字）' : '—') },
  { key: 'quantity', label: '次数', num: true, format: r => (r.quantity === null ? '—' : `${r.quantity} 次`) },
  { key: 'state', label: '状态', format: stateText },
  { key: 'expiresOn', label: '到期', format: r => formatDot(r.expiresOn) },
]);
</script>

<template>
  <div class="bar">
    <label>类型
      <select v-model="kind">
        <option value="">全部</option>
        <option value="count">{{ SHARE_KIND_TEXT.count }}</option>
        <option value="referral">{{ SHARE_KIND_TEXT.referral }}</option>
      </select>
    </label>
  </div>
  <p v-if="error" class="state error" role="alert">
    {{ error }}<button type="button" class="retry" @click="load">重试</button>
  </p>
  <section class="panel">
    <DataTable
      :columns="columns"
      :rows="data?.items ?? []"
      row-key="id"
      :loading="loading"
      empty="还没有分享"
      clickable
      @row-click="(r: ShareRow) => router.push({ name: 'member', params: { id: r.fromMemberId } })"
    />
  </section>
</template>

<style scoped>
.bar { display: flex; gap: 12px; margin-bottom: 12px; font-size: 13px; }
.bar label { display: flex; align-items: center; gap: 8px; }
.bar select { padding: 5px 8px; font: inherit; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 2px 10px; font: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
</style>
