<script setup lang="ts">
/**
 * 新建、修改卡种的弹窗（任务 19），用 v-model:open；product 为空是新建。
 * 校验在 @climb/core 的 product.ts（newProductErrors / productPatchErrors），这里只负责显示和提交。改好 emit saved。
 * 建好以后品类和规格不能改，修改时只读显示；没有改价权限（product.price）的标价只读。
 */
import {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_TEXT,
  newProductErrors,
  parseYuanInput,
  productPatchErrors,
  type Product,
  type ProductCategory,
  type ProductErrors,
  type ProductInput,
  type ProductPatch,
} from '@climb/core';
import { Field, Modal, errorText, UiButton, UiSelect } from '@climb/ui-web';
import { formatYuan } from '@climb/utils';
import { computed, reactive, ref, useId, watch } from 'vue';
import { api } from '../api';
import { canDo } from '../permissions';
import { session } from '../session';
import { badField } from './memberForm';

const CATEGORY_OPTIONS = PRODUCT_CATEGORIES.map(c => ({ value: c, label: PRODUCT_CATEGORY_TEXT[c] }));

const props = defineProps<{ open: boolean; product: Product | null; products: Product[] }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; saved: [product: Product, created: boolean] }>();

const formId = useId();
const form = reactive({ category: 'period' as ProductCategory, name: '', price: '', days: '', quantity: '', validMonths: '', perks: '', onSale: true, sort: '' });
const errs = ref<ProductErrors>({});
const err = ref('');
const busy = ref(false);

const editing = computed(() => props.product !== null);
const canPrice = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'product.price'));
const title = computed(() => (props.product ? `修改 ${props.product.name}` : '新建卡种'));
const specText = computed(() => {
  const p = props.product;
  if (!p) return '';
  if (p.category === 'period') return `${PRODUCT_CATEGORY_TEXT.period}，${p.days} 天`;
  return `${PRODUCT_CATEGORY_TEXT[p.category]}，${p.quantity} 次，${p.validMonths ? `${p.validMonths} 个月有效` : p.quantity === 1 ? '当天有效' : '有效期按默认'}`;
});

watch(
  () => props.open,
  v => {
    if (!v) return;
    const p = props.product;
    Object.assign(form, {
      category: p?.category ?? 'period',
      name: p?.name ?? '',
      price: p ? String(p.priceCents / 100) : '',
      days: p?.days ? String(p.days) : '',
      quantity: p?.quantity ? String(p.quantity) : '',
      validMonths: p?.validMonths ? String(p.validMonths) : '',
      perks: p?.perks.join('\n') ?? '',
      onSale: p?.onSale ?? true,
      sort: p?.sort !== undefined ? String(p.sort) : '',
    });
    errs.value = {};
    err.value = '';
  },
  { immediate: true },
);

// 空的输入框传 undefined：选填的就是不填，必填的让校验报错
const int = (v: string) => (v.trim() === '' ? undefined : Number(v));
const perks = () => form.perks.split('\n');

function body(): ProductInput | ProductPatch {
  const common = { name: form.name, perks: perks(), onSale: form.onSale, sort: int(form.sort) };
  const priceCents = parseYuanInput(form.price);
  if (props.product) {
    const patch: ProductPatch = { ...common };
    if (patch.sort === undefined) delete patch.sort;
    if (canPrice.value) patch.priceCents = priceCents;
    return patch;
  }
  const spec = form.category === 'period' ? { days: int(form.days) } : { quantity: int(form.quantity), validMonths: int(form.validMonths) };
  return { ...common, category: form.category, priceCents, ...spec } as ProductInput;
}

async function submit() {
  if (busy.value) return;
  err.value = '';
  const b = body();
  errs.value = (props.product ? productPatchErrors(props.product, b, props.products) : newProductErrors(b, props.products)) ?? {};
  if (Object.keys(errs.value).length) return;
  busy.value = true;
  try {
    const saved = props.product ? await api.products.update(props.product.id, b as ProductPatch) : await api.products.create(b as ProductInput);
    emit('update:open', false);
    emit('saved', saved, !props.product);
  } catch (e) {
    const field = badField(e);
    if (field && field in form) errs.value = { [field]: errorText(e) };
    else if (field === 'priceCents') errs.value = { priceCents: errorText(e) };
    else err.value = errorText(e, '保存失败，请重试');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="title" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <template v-if="!editing">
        <Field label="品类" required :error="errs.category" v-slot="f">
          <UiSelect v-model="form.category" v-bind="f.attrs" :disabled="busy" :options="CATEGORY_OPTIONS" />
        </Field>
        <Field v-if="form.category === 'period'" label="天数" required :error="errs.days" v-slot="f">
          <input v-model="form.days" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
        </Field>
        <template v-else>
          <Field label="次数" required hint="单次票填 1" :error="errs.quantity" v-slot="f">
            <input v-model="form.quantity" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
          </Field>
          <Field label="有效月数" hint="不填：单次票当天有效，多次的按默认" :error="errs.validMonths" v-slot="f">
            <input v-model="form.validMonths" v-bind="f.attrs" type="number" min="1" step="1" :disabled="busy" />
          </Field>
        </template>
      </template>
      <p v-else class="note">{{ specText }}。品类和规格建好就不能改了，要换就新建一个、把这个下架。</p>

      <Field label="名称" required :error="errs.name" v-slot="f">
        <input v-model="form.name" v-bind="f.attrs" :disabled="busy" />
      </Field>
      <Field v-if="!editing || canPrice" label="标价（元）" required hint="改价只影响以后的订单，已经卖出去的不变" :error="errs.priceCents" v-slot="f">
        <input v-model="form.price" v-bind="f.attrs" inputmode="decimal" :disabled="busy" />
      </Field>
      <p v-else class="note">标价 {{ formatYuan(product!.priceCents) }}（改价要店长以上）</p>
      <Field label="卖点" hint="一行一条" :error="errs.perks" v-slot="f">
        <textarea v-model="form.perks" v-bind="f.attrs" rows="3" :disabled="busy" />
      </Field>
      <Field label="排序" hint="同一组里小的在前；新建不填排在最后" :error="errs.sort" v-slot="f">
        <input v-model="form.sort" v-bind="f.attrs" type="number" min="0" step="1" :disabled="busy" />
      </Field>
      <label class="check"><input v-model="form.onSale" type="checkbox" :disabled="busy" /> 在售（下架后小程序里看不到，前台也开不了）</label>
      <p v-if="errs.onSale" class="err" role="alert">{{ errs.onSale }}</p>
      <p v-if="err" class="err" role="alert">{{ err }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="emit('update:open', false)">取消</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 14px; }
.note { margin: 0; font-size: 13px; color: var(--ink-muted); }
.check { display: flex; align-items: center; gap: 8px; font-size: 13.5px; }
.err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
