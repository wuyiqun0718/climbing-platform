<script setup lang="ts">
/**
 * 线下收款开卡弹窗，用 v-model:open。规则（收款方式、实收和改价原因、卡从哪天算）都在 @climb/core 的 order.ts，这里只负责显示。
 * 传了 member 就直接给他开；没传先搜会员，或者当场建档（MemberForm）。开好 emit created。
 */
import { MEMBER_SOURCE_TEXT, PAY_CHANNEL_TEXT, REVENUE_CATEGORY_TEXT, type DeskOrderResult, type MemberListRow } from '@climb/api';
import {
  DEFAULT_DESK_PAY_CHANNEL,
  DESK_PAY_CHANNELS,
  DESK_PRICE_REASON_MAX,
  productRevenueCategory,
  deskOrderErrors,
  parseYuanInput,
  type DeskOrderErrors,
  type DeskPayChannel,
  type Product,
} from '@climb/core';
import { Field, Modal, errorText } from '@climb/ui-web';
import { formatYuan } from '@climb/utils';
import { computed, ref, useId, watch } from 'vue';
import { api } from '../api';
import { storeOptions } from '../permissions';
import { session } from '../session';
import MemberForm from './MemberForm.vue';
import { badField } from './memberForm';

const props = defineProps<{ open: boolean; /** 已经选好的会员（从会员详情进来） */ member?: { id: string; name: string } | null }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; created: [result: DeskOrderResult, memberId: string] }>();

const formId = useId();
const picked = ref<{ id: string; name: string } | null>(null);
const q = ref('');
const found = ref<MemberListRow[] | null>(null);
const searching = ref(false);
const searchErr = ref('');
const formOpen = ref(false);

const products = ref<Product[]>([]);
const productsErr = ref('');
const productId = ref('');
const channel = ref<DeskPayChannel>(DEFAULT_DESK_PAY_CHANNEL);
const amount = ref('');
const priceReason = ref('');
const storeId = ref('');
const errs = ref<DeskOrderErrors>({});
const submitErr = ref('');
const busy = ref(false);
let requestId = '';

const stores = computed(() => (session.state.staff ? storeOptions(session.state.staff, session.state.stores).filter(o => o.id !== null) : []));
const onSale = computed(() => products.value.filter(p => p.onSale));
const product = computed(() => onSale.value.find(p => p.id === productId.value) ?? null);
const amountCents = computed(() => parseYuanInput(amount.value));
const repriced = computed(() => !!product.value && Number.isInteger(amountCents.value) && amountCents.value !== product.value.priceCents);

const yuanText = (cents: number) => (cents / 100).toFixed(cents % 100 ? 2 : 0);
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

async function loadProducts() {
  productsErr.value = '';
  try {
    products.value = await api.products.list();
  } catch (e) {
    productsErr.value = errorText(e, '卡种加载失败');
  }
}

watch(
  () => props.open,
  v => {
    if (!v) return;
    requestId = newRequestId();
    picked.value = props.member ?? null;
    q.value = '';
    found.value = null;
    searchErr.value = '';
    productId.value = '';
    channel.value = DEFAULT_DESK_PAY_CHANNEL;
    amount.value = '';
    priceReason.value = '';
    storeId.value = session.state.storeId ?? stores.value[0]?.id ?? '';
    errs.value = {};
    submitErr.value = '';
    loadProducts();
  },
  { immediate: true },
);

// 换卡种时实收重置成标价
watch(product, p => {
  amount.value = p ? yuanText(p.priceCents) : '';
  priceReason.value = '';
  errs.value = {};
});

async function search() {
  const s = q.value.trim();
  if (!s || searching.value) return;
  searching.value = true;
  searchErr.value = '';
  try {
    found.value = (await api.members.list({ q: s })).items;
  } catch (e) {
    searchErr.value = errorText(e, '搜索失败');
  } finally {
    searching.value = false;
  }
}

function pick(id: string, name: string) {
  picked.value = { id, name };
  submitErr.value = '';
}

// 建档时发现手机号已有档案，直接选那个人；名字从详情里拿
async function pickExisting(id: string) {
  try {
    const m = await api.members.get(id);
    pick(m.id, m.name);
  } catch (e) {
    searchErr.value = errorText(e, '会员加载失败');
  }
}

const close = () => emit('update:open', false);

async function submit() {
  if (busy.value) return;
  submitErr.value = '';
  if (!picked.value) return void (submitErr.value = '先选会员');
  const p = product.value;
  if (!p) return void (submitErr.value = '请选卡种');
  if (!storeId.value) return void (submitErr.value = '请选门店');
  errs.value = deskOrderErrors(p, { channel: channel.value, amountCents: amountCents.value, priceReason: priceReason.value }) ?? {};
  if (Object.keys(errs.value).length) return;
  busy.value = true;
  try {
    const res = await api.orders.create({
      requestId,
      memberId: picked.value.id,
      productId: p.id,
      storeId: storeId.value,
      channel: channel.value,
      amountCents: amountCents.value,
      priceReason: repriced.value ? priceReason.value.trim() : '',
    });
    const memberId = picked.value.id;
    close();
    emit('created', res, memberId);
  } catch (e) {
    const field = badField(e);
    if (field === 'channel' || field === 'amountCents' || field === 'priceReason') errs.value = { [field]: errorText(e) };
    else submitErr.value = errorText(e, '开卡失败，请重试');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" title="收款开卡" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <section v-if="picked" class="picked">
        <span>会员：<b>{{ picked.name || '没填名字' }}</b></span>
        <button v-if="!member" type="button" class="btn sm" :disabled="busy" @click="picked = null">换一个</button>
      </section>
      <section v-else class="pick">
        <Field label="会员" required hint="输手机号（后四位也行）或名字" :error="searchErr" v-slot="f">
          <div class="row">
            <input v-model="q" v-bind="f.attrs" autocomplete="off" autofocus @keydown.enter.prevent="search" />
            <button type="button" class="btn" :disabled="searching || !q.trim()" @click="search">{{ searching ? '搜索中…' : '搜索' }}</button>
          </div>
        </Field>
        <ul v-if="found?.length" class="found">
          <li v-for="m in found" :key="m.id">
            <button type="button" @click="pick(m.id, m.name)">
              <b>{{ m.name || '没填名字' }}</b> <span class="num">{{ m.phoneMasked }}</span> <small>{{ MEMBER_SOURCE_TEXT[m.source] }}</small>
            </button>
          </li>
        </ul>
        <p v-else-if="found" class="hint">没找到这个人。</p>
        <button type="button" class="btn sm" @click="formOpen = true">当场建档</button>
      </section>

      <Field label="卡种" required :error="productsErr" v-slot="f">
        <select v-model="productId" v-bind="f.attrs">
          <option value="" disabled>选一个</option>
          <option v-for="p in onSale" :key="p.id" :value="p.id">
            {{ REVENUE_CATEGORY_TEXT[productRevenueCategory(p)] }} · {{ p.name }} · {{ formatYuan(p.priceCents) }}
          </option>
        </select>
      </Field>
      <Field label="收款方式" required :error="errs.channel" v-slot="f">
        <select v-model="channel" v-bind="f.attrs">
          <option v-for="c in DESK_PAY_CHANNELS" :key="c" :value="c">{{ PAY_CHANNEL_TEXT[c] }}</option>
        </select>
      </Field>
      <Field label="实收（元）" required :hint="product ? `标价 ${formatYuan(product.priceCents)}` : undefined" :error="errs.amountCents" v-slot="f">
        <input v-model="amount" v-bind="f.attrs" inputmode="decimal" autocomplete="off" :disabled="!product" @input="errs.amountCents = undefined" />
      </Field>
      <Field v-if="repriced" label="改价原因" required :error="errs.priceReason" v-slot="f">
        <input v-model="priceReason" v-bind="f.attrs" :maxlength="DESK_PRICE_REASON_MAX" autocomplete="off" @input="errs.priceReason = undefined" />
      </Field>
      <Field label="收款门店" required v-slot="f">
        <select v-model="storeId" v-bind="f.attrs">
          <option v-for="s in stores" :key="s.id!" :value="s.id">{{ s.name }}</option>
        </select>
      </Field>
      <p v-if="submitErr" class="err" role="alert">{{ submitErr }}</p>
    </form>
    <template #footer>
      <button type="button" class="btn" :disabled="busy" @click="close">取消</button>
      <button type="submit" class="btn primary" :form="formId" :disabled="busy">{{ busy ? '提交中…' : '确认收款，开卡' }}</button>
    </template>
  </Modal>

  <MemberForm v-model:open="formOpen" :phone="/^\d+$/.test(q.trim()) ? q.trim() : ''" @created="m => pick(m.id, m.name)" @open-existing="pickExisting" />
</template>

<style scoped>
.form { display: grid; gap: 14px; }
.picked { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 12px; background: var(--neutral-soft); border-radius: var(--radius-sm); }
.pick { display: grid; gap: 8px; justify-items: start; }
.pick > :first-child { justify-self: stretch; }
.row { display: flex; gap: 8px; }
.row input { flex: 1; min-width: 0; }
.found { width: 100%; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line); border-radius: var(--radius-sm); }
.found li + li { border-top: 1px solid var(--line); }
.found button { width: 100%; padding: 8px 12px; font: inherit; color: inherit; text-align: left; background: none; border: 0; cursor: pointer; }
.found button:hover { background: var(--neutral-soft); }
.found small, .hint { font-size: 12px; color: var(--ink-muted); }
.hint { margin: 0; }
.num { font-family: var(--font-number); font-variant-numeric: tabular-nums; }
.err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
.btn {
  height: 34px;
  padding: 0 14px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn.sm { height: 28px; padding: 0 10px; font-size: 12.5px; }
.btn:hover:not(:disabled) { border-color: var(--ink); }
.btn:disabled { cursor: default; opacity: 0.5; }
.btn.primary { color: var(--on-brand); background: var(--brand); border-color: var(--brand); }
</style>
