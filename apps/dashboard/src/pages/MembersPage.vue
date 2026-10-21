<script setup lang="ts">
import { MEMBER_SOURCE_TEXT, type DeskOrderResult, type MemberDetail, type MemberListRow, type PageOf } from '@climb/api';
import { DataTable, Pager, errorText, useToast, type Column } from '@climb/ui-web';
import { formatDot } from '@climb/utils';
import { onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import DeskOrderModal from '../components/DeskOrderModal.vue';
import MemberForm from '../components/MemberForm.vue';
import { canDo } from '../permissions';
import { session } from '../session';
import { createLatest } from './dashboard';

// 搜索词和页码放在地址里，刷新、从详情返回都还在
const route = useRoute();
const router = useRouter();
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const qFromRoute = () => String(one(route.query.q) ?? '');
const pageFromRoute = () => Math.max(1, Math.floor(Number(one(route.query.page))) || 1);

const input = ref(qFromRoute());
const data = ref<PageOf<MemberListRow> | null>(null);
const loading = ref(false);
const error = ref('');
const latest = createLatest();

async function load() {
  loading.value = true;
  error.value = '';
  const res = await latest(() => api.members.list({ q: qFromRoute(), page: pageFromRoute() }));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else error.value = errorText(res.error, '会员列表加载失败');
}

watch(() => [session.state.staff?.id, route.query.q, route.query.page], () => session.state.staff && load(), { immediate: true });

function setQuery(q: string, page: number) {
  const query = { ...(q ? { q } : {}), ...(page > 1 ? { page: String(page) } : {}) };
  router.replace({ query });
}

// 打字停 300ms 再搜，回车立即搜；换了搜索词回到第一页
let timer: ReturnType<typeof setTimeout> | undefined;
watch(input, v => {
  clearTimeout(timer);
  timer = setTimeout(() => search(v), 300);
});
onBeforeUnmount(() => clearTimeout(timer));
function search(v = input.value) {
  clearTimeout(timer);
  const q = v.trim();
  if (q !== qFromRoute()) setQuery(q, 1);
}

const columns: Column<MemberListRow>[] = [
  { key: 'name', label: '名字', format: r => r.name || '（没填）' },
  { key: 'phoneMasked', label: '手机号', num: true },
  { key: 'source', label: '来源', format: r => MEMBER_SOURCE_TEXT[r.source] },
  { key: 'firstVisitOn', label: '首次到店', format: r => (r.firstVisitOn ? formatDot(r.firstVisitOn) : '还没来过') },
  { key: 'validCards', label: '有效卡', num: true, format: r => (r.validCards ? `${r.validCards} 张` : '没有') },
  { key: 'lastEntryOn', label: '最近入场', format: r => (r.lastEntryOn ? formatDot(r.lastEntryOn) : '—') },
];

// 新建会员；搜的是手机号就预填进去
const toast = useToast();
const formOpen = ref(false);
const canCreate = () => !!session.state.staff && canDo(session.state.staff.role, 'member.create');
const prefillPhone = () => (/^\d+$/.test(qFromRoute()) ? qFromRoute() : '');
const openMember = (id: string) => router.push({ name: 'member', params: { id } });
function onCreated(m: MemberDetail) {
  toast.success(`已建档：${m.name || m.phone}`);
  openMember(m.id);
}

// 收款开卡：开好跳到会员详情，新卡和订单在那里
const orderOpen = ref(false);
const canOrder = () => !!session.state.staff && canDo(session.state.staff.role, 'order.create');
function onOrdered(r: DeskOrderResult, memberId: string) {
  toast.success(`已开卡：${r.card.name}`);
  openMember(memberId);
}

const emptyText = () => (qFromRoute() ? `没找到「${qFromRoute()}」，换个手机号或名字试试` : '还没有会员');
</script>

<template>
  <header class="page-h">
    <div>
      <h1>会员</h1>
      <p>所有门店的会员；点一行看详情</p>
    </div>
    <div class="actions">
      <button v-if="canOrder()" type="button" class="create" @click="orderOpen = true">收款开卡</button>
      <button v-if="canCreate()" type="button" class="create" @click="formOpen = true">新建会员</button>
    </div>
  </header>
  <DeskOrderModal v-model:open="orderOpen" @created="onOrdered" />
  <MemberForm v-model:open="formOpen" :phone="prefillPhone()" @created="onCreated" @open-existing="openMember" />
  <form class="search" role="search" @submit.prevent="search()">
    <input v-model="input" type="search" placeholder="手机号（后四位也行）或名字" aria-label="搜索会员" maxlength="30" />
    <button type="submit">搜索</button>
  </form>
  <p v-if="error" class="state error" role="alert">
    {{ error }}<button type="button" class="retry" @click="load">重试</button>
  </p>
  <section class="panel">
    <DataTable
      :columns="columns"
      :rows="data?.items ?? []"
      row-key="id"
      :loading="loading"
      :empty="emptyText()"
      clickable
      @row-click="(r: MemberListRow) => openMember(r.id)"
    />
    <Pager
      v-if="data && data.total > 0"
      class="pager"
      :page="data.page"
      :page-size="data.pageSize"
      :total="data.total"
      :disabled="loading"
      @update:page="p => setQuery(qFromRoute(), p)"
    />
  </section>
</template>

<style scoped>
.page-h { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.actions { display: flex; gap: 8px; }
.create { padding: 6px 14px; font: inherit; font-weight: 600; color: var(--on-brand); background: var(--brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.search { display: flex; gap: 8px; max-width: 420px; margin-bottom: 16px; }
.search input { flex: 1; min-width: 0; padding: 6px 10px; font: inherit; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); }
.search button { padding: 6px 14px; font: inherit; font-weight: 600; color: var(--on-brand); background: var(--brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 4px 10px; font: inherit; font-weight: 600; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.panel { min-width: 0; padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.pager { margin-top: 12px; }
</style>
