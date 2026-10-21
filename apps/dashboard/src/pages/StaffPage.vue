<script setup lang="ts">
/**
 * 员工账号（任务 22）：列出全部员工（停用的也在），新增、修改、重置密码、停用和启用。只有馆长（permissions.ts 的 staff 页、staff.manage）。
 * 规则都在 @climb/core 的 staff.ts，接口拦下的（停用自己、降级自己、没有在用的馆长）直接显示接口的说法。
 * 教练也是员工：员工上勾「是教练」填教练资料（任务 28），小程序约私教的教练列表就是这里在用的教练。
 */
import type { StaffRow } from '@climb/api';
import { STAFF_ROLE_TEXT } from '@climb/core';
import { DataTable, errorText, useToast, type Column } from '@climb/ui-web';
import { formatYuan } from '@climb/utils';
import { onMounted, ref } from 'vue';
import { api } from '../api';
import StaffForm from '../components/StaffForm.vue';
import { session } from '../session';

const rows = ref<StaffRow[]>([]);
const loading = ref(true);
const error = ref('');
const toast = useToast();

async function load() {
  loading.value = true;
  error.value = '';
  try {
    rows.value = await api.staff.list();
  } catch (e) {
    error.value = errorText(e, '员工加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const storeText = (r: StaffRow) =>
  r.storeIds.length === 0 ? '全部门店' : r.storeIds.map(id => session.state.stores.find(s => s.id === id)?.name ?? id).join('、');
const isMe = (r: StaffRow) => r.id === session.state.staff?.id;

const columns: Column<StaffRow>[] = [
  { key: 'name', label: '名字', format: r => (isMe(r) ? `${r.name}（我）` : r.name) },
  { key: 'phone', label: '手机号', num: true },
  { key: 'role', label: '角色', format: r => STAFF_ROLE_TEXT[r.role] },
  { key: 'storeIds', label: '可操作门店', format: storeText },
  { key: 'coach', label: '教练', format: r => (r.coach ? `单节 ${formatYuan(r.coach.priceCents)}，${r.coach.storeIds.map(id => session.state.stores.find(s => s.id === id)?.name ?? id).join('、')}` : '—') },
  { key: 'active', label: '状态', width: '140px' },
];

const formOpen = ref(false);
const editing = ref<StaffRow | null>(null);
function openForm(r: StaffRow | null) {
  editing.value = r;
  formOpen.value = true;
}
function onSaved(r: StaffRow, created: boolean) {
  toast.success(created ? `已新增：${r.name}` : `已保存：${r.name}`);
  // 改了自己的密码，旧 token 失效，接口 401 时会回登录页
  load();
}

const toggling = ref<string | null>(null);
async function toggle(r: StaffRow) {
  if (toggling.value) return;
  toggling.value = r.id;
  try {
    const saved = await api.staff.update(r.id, { active: !r.active });
    toast.success(saved.active ? `已启用：${saved.name}` : `已停用：${saved.name}，已登录的也会被退出`);
    await load();
  } catch (e) {
    toast.error(errorText(e, '操作失败，请重试'));
  } finally {
    toggling.value = null;
  }
}
</script>

<template>
  <header class="page-h">
    <div>
      <h1>员工</h1>
      <p>停用的账号不能登录，已经登录的会马上退出；点一行修改或重置密码</p>
    </div>
    <button type="button" class="create" @click="openForm(null)">新增员工</button>
  </header>
  <StaffForm v-model:open="formOpen" :staff="editing" :all="rows" @saved="onSaved" />
  <p v-if="error" class="state error" role="alert">
    {{ error }}<button type="button" class="retry" @click="load">重试</button>
  </p>
  <section class="panel">
    <DataTable :columns="columns" :rows="rows" row-key="id" :loading="loading" empty="还没有员工" clickable @row-click="(r: StaffRow) => openForm(r)">
      <template #cell-active="{ row }">
        <span class="status" :class="{ off: !row.active }">{{ row.active ? '在用' : '已停用' }}</span>
        <button v-if="!isMe(row)" type="button" class="link" :disabled="toggling !== null" @click.stop="toggle(row)" @keydown.enter.stop>{{ row.active ? '停用' : '启用' }}</button>
      </template>
    </DataTable>
  </section>
</template>

<style scoped>
.page-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.create { padding: 6px 14px; font: inherit; font-weight: 600; color: var(--on-brand); background: var(--brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.status { margin-right: 10px; font-size: 13px; }
.off { color: var(--ink-muted); }
.link { padding: 0; font: inherit; font-size: 13px; color: var(--brand); background: none; border: 0; cursor: pointer; text-decoration: underline; }
.link:disabled { cursor: default; opacity: 0.5; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 2px 10px; font: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
</style>
