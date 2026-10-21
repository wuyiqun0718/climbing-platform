<script setup lang="ts">
/**
 * 卡种与价格（任务 19）：按组（期限卡、次卡、单次票、私教、团课）列出全部卡种，含下架的；新建、修改、上下架。
 * 顺序和校验都在 @climb/core 的 product.ts，这里只负责显示和提交。页面店长以上能进（permissions.ts 的 products），改价看 product.price。
 */
import { SHOP_SECTION_LABELS, shopSectionOf, type Product, type ShopSection } from '@climb/core';
import { DataTable, errorText, useToast, type Column } from '@climb/ui-web';
import { formatYuan } from '@climb/utils';
import { computed, onMounted, ref } from 'vue';
import { api } from '../api';
import ProductForm from '../components/ProductForm.vue';
import { canDo } from '../permissions';
import { session } from '../session';

const products = ref<Product[]>([]);
const loading = ref(true);
const error = ref('');
const toast = useToast();

async function load() {
  loading.value = true;
  error.value = '';
  try {
    products.value = await api.products.list();
  } catch (e) {
    error.value = errorText(e, '卡种加载失败');
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// 接口已经按 sortProducts 排好，这里只按组切开
const SECTIONS: ShopSection[] = ['period', 'count', 'single', 'pt', 'class'];
const groups = computed(() => SECTIONS.map(section => ({ section, rows: products.value.filter(p => shopSectionOf(p) === section) })).filter(g => g.rows.length));

const spec = (p: Product) => {
  if (p.category === 'period') return `${p.days} 天`;
  const valid = p.validMonths ? `${p.validMonths} 个月有效` : p.quantity === 1 ? '当天有效' : '默认有效期';
  return `${p.quantity} 次 · ${valid}`;
};

const columns: Column<Product>[] = [
  { key: 'name', label: '名称' },
  { key: 'spec', label: '规格', format: spec },
  { key: 'priceCents', label: '标价', num: true, format: p => formatYuan(p.priceCents) },
  { key: 'perks', label: '卖点', format: p => p.perks.join('；') || '—' },
  { key: 'sort', label: '排序', num: true, width: '64px', format: p => p.sort ?? 0 },
  { key: 'onSale', label: '状态', width: '140px' },
];

const canEdit = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'product.edit'));
const canCreate = computed(() => canEdit.value && !!session.state.staff && canDo(session.state.staff.role, 'product.price'));

const formOpen = ref(false);
const editing = ref<Product | null>(null);
function openForm(p: Product | null) {
  editing.value = p;
  formOpen.value = true;
}
function onSaved(p: Product, created: boolean) {
  toast.success(created ? `已新建：${p.name}` : `已保存：${p.name}`);
  load();
}

const toggling = ref<string | null>(null);
async function toggle(p: Product) {
  if (toggling.value) return;
  toggling.value = p.id;
  try {
    const saved = await api.products.update(p.id, { onSale: !p.onSale });
    toast.success(saved.onSale ? `已上架：${saved.name}` : `已下架：${saved.name}`);
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
      <h1>卡种与价格</h1>
      <p>改价只影响以后的订单，已经卖出去的订单和卡不变；下架后小程序里看不到，前台也开不了</p>
    </div>
    <button v-if="canCreate" type="button" class="create" @click="openForm(null)">新建卡种</button>
  </header>
  <ProductForm v-model:open="formOpen" :product="editing" :products="products" @saved="onSaved" />
  <p v-if="error" class="state error" role="alert">
    {{ error }}<button type="button" class="retry" @click="load">重试</button>
  </p>
  <p v-else-if="loading && !products.length" class="state">加载中…</p>
  <section v-for="g in groups" :key="g.section" class="panel">
    <h2>{{ SHOP_SECTION_LABELS[g.section] }}</h2>
    <DataTable :columns="columns" :rows="g.rows" row-key="id" :clickable="canEdit" @row-click="(p: Product) => canEdit && openForm(p)">
      <template #cell-name="{ row }">
        <span :class="{ off: !row.onSale }">{{ row.name }}</span>
      </template>
      <template #cell-onSale="{ row }">
        <span class="status" :class="{ off: !row.onSale }">{{ row.onSale ? '在售' : '已下架' }}</span>
        <button v-if="canEdit" type="button" class="link" :disabled="toggling !== null" @click.stop="toggle(row)">{{ row.onSale ? '下架' : '上架' }}</button>
      </template>
    </DataTable>
  </section>
</template>

<style scoped>
.page-h { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 0 16px; }
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.create { flex: none; padding: 6px 14px; white-space: nowrap; font: inherit; font-weight: 600; color: var(--on-brand); background: var(--brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
.panel { margin-bottom: 20px; }
.panel h2 { margin: 0 0 8px; font-size: 15px; }
.off { color: var(--ink-muted); }
.status { margin-right: 10px; font-size: 13px; }
.link { padding: 0; font: inherit; font-size: 13px; color: var(--brand); background: none; border: 0; cursor: pointer; text-decoration: underline; }
.link:disabled { cursor: default; opacity: 0.5; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.retry { padding: 2px 10px; font: inherit; font-size: 13px; color: var(--ink); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
</style>
