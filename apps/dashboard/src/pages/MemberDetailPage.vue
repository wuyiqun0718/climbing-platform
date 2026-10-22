<script setup lang="ts">
import { ApiError, ENTRY_METHOD_TEXT, type RefundResult, type DeskCheckInResult, type DeskOrderResult, type VoidCheckInResult, MEMBER_SOURCE_TEXT, PAY_CHANNEL_TEXT, REVENUE_CATEGORY_TEXT, type MemberDetail, type MemberEntryRow, type MemberOrderRow } from '@climb/api';
import { CARD_STATE_TEXT, cardState, cardText, type Card, ORDER_STATUS_LABELS } from '@climb/core';
import { ConfirmButton, DataTable, errorText, useToast, type Column, UiButton } from '@climb/ui-web';
import { formatDot, formatYuan, toDateKey } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { entryInsuranceText, voidMessage, voidResultText, voidText } from '../components/checkInVoid';
import CardAdjustModal, { type CardAdjustMode } from '../components/CardAdjustModal.vue';
import CardLedgerDrawer from '../components/CardLedgerDrawer.vue';
import DeskCheckInModal from '../components/DeskCheckInModal.vue';
import DeskOrderModal from '../components/DeskOrderModal.vue';
import RefundModal from '../components/RefundModal.vue';
import { canDo, canSeeStore } from '../permissions';
import { session, storeLabel } from '../session';
import { createLatest } from './dashboard';

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id ?? ''));

const data = ref<MemberDetail | null>(null);
const loading = ref(false);
const error = ref('');
const notFound = ref(false);
const latest = createLatest();

async function load() {
  if (data.value && data.value.id !== id.value) data.value = null;
  loading.value = true;
  error.value = '';
  notFound.value = false;
  const res = await latest(() => api.members.get(id.value));
  if (res.stale) return;
  loading.value = false;
  if (res.ok) data.value = res.value;
  else if (res.error instanceof ApiError && res.error.status === 404) notFound.value = true;
  else error.value = errorText(res.error, '会员信息加载失败');
}

watch(() => [session.state.staff?.id, id.value], () => session.state.staff && id.value && load(), { immediate: true });

const today = toDateKey(new Date());
const storeName = (sid: string | null) => (sid ? storeLabel(sid) : '—');

// 卡的文字和状态都来自 @climb/core，跟小程序卡包一样
const cards = computed(() =>
  (data.value?.cards ?? []).map((c: Card) => {
    const state = cardState(c, today);
    return { card: c, text: cardText(c, today), state, stateText: CARD_STATE_TEXT[state], dim: state !== 'normal' && state !== 'not_started' };
  }),
);

// 点卡看流水
const ledgerCard = ref<Card | null>(null);

const orderColumns: Column<MemberOrderRow>[] = [
  { key: 'paidOn', label: '付款日期', format: r => (r.paidOn ? formatDot(r.paidOn) : '没付款') },
  { key: 'productName', label: '商品' },
  { key: 'category', label: '品类', format: r => REVENUE_CATEGORY_TEXT[r.category] },
  { key: 'storeId', label: '门店', format: r => storeName(r.storeId) },
  { key: 'channel', label: '支付方式', format: r => PAY_CHANNEL_TEXT[r.channel] },
  { key: 'amountCents', label: '金额', num: true, format: r => formatYuan(r.amountCents) },
  { key: 'refundedCents', label: '已退', num: true, format: r => (r.refundedCents ? formatYuan(r.refundedCents) : '—') },
  { key: 'status', label: '状态', format: r => ORDER_STATUS_LABELS[r.status] },
];

const entryColumns: Column<MemberEntryRow>[] = [
  { key: 'on', label: '日期', format: r => formatDot(r.on) },
  { key: 'storeId', label: '门店', format: r => storeName(r.storeId) },
  { key: 'cardName', label: '用的卡' },
  { key: 'deducted', label: '扣次', num: true, format: r => (r.deducted ? `${r.deducted} 次` : '不扣') },
  { key: 'method', label: '方式', format: r => ENTRY_METHOD_TEXT[r.method] },
  { key: 'insurance', label: '保险', format: entryInsuranceText },
  { key: 'voided', label: '', format: r => voidText(r) },
];

// 收款开卡：开好重新拉详情，新卡和订单马上出现
const toast = useToast();
const orderOpen = ref(false);
const canOrder = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'order.create'));
function onOrdered(r: DeskOrderResult) {
  toast.success(`已开卡：${r.card.name}`);
  load();
}

// 手动登记入场：登记好重新拉详情，剩余次数和最近入场马上更新
const checkInOpen = ref(false);
const canCheckIn = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'checkIn.create'));
function onCheckedIn(r: DeskCheckInResult) {
  toast.success(r.deducted ? `已入场：${r.card.name}扣 ${r.deducted} 次` : `已入场：${r.card.name}，不扣次`);
  if (!r.waiverSigned) toast.info('还没签风险告知书，记得让会员在小程序里补签');
  load();
}

// 撤销入场：退几次、体验券、保险都按接口返回的说，撤完重新拉详情
const canVoid = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'checkIn.void'));
// 别的店的入场接口会 403，不给按钮
const canVoidRow = (r: MemberEntryRow) => canVoid.value && !!session.state.staff && canSeeStore(session.state.staff, r.storeId);
let lastVoid: VoidCheckInResult | null = null;
const voidAction = (r: MemberEntryRow) => async (reason: string) => {
  lastVoid = await api.checkIns.void(r.id, { reason });
};
function onVoided() {
  if (!lastVoid) return;
  toast.success(voidResultText(lastVoid));
  load();
}

// 调整、冻结、解冻：能不能做由接口按 @climb/core 判断，这里只按权限和卡的状态给入口，做完重新拉详情
const canAdjust = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'card.adjust'));
const canFreeze = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'card.freeze'));
const adjusting = ref<{ card: Card; mode: CardAdjustMode } | null>(null);
const adjustOpen = ref(false);
function openAdjust(card: Card, mode: CardAdjustMode) {
  adjusting.value = { card, mode };
  adjustOpen.value = true;
}
const editable = (c: Card) => c.status !== 'void' && c.status !== 'refunded';
function onAdjusted(msg: string) {
  toast.success(msg);
  load();
}

// 退款：只有店长以上有入口（权限 order.refund），能不能退、退多少由接口按 @climb/core 的 refund.ts 判断
const canRefund = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'order.refund'));
const refundOrderId = ref<string | null>(null);
const refundOpen = ref(false);
const refundable = (r: MemberOrderRow) => r.status === 'paid' || r.status === 'partially_refunded';
function openRefund(r: MemberOrderRow) {
  refundOrderId.value = r.id;
  refundOpen.value = true;
}
function onRefunded(r: RefundResult) {
  const where = r.refund.method === 'offline' ? '，记得在前台把钱退给会员' : '，原路退回微信';
  toast.success(`已退款 ${formatYuan(r.refund.amountCents)}${where}${r.card ? `；${r.card.name}已经不能用了` : ''}`);
  load();
}

const back = () => (window.history.state?.back ? router.back() : router.push({ name: 'members' }));
</script>

<template>
  <header class="page-h">
    <button type="button" class="back" @click="back"><svg class="arr" viewBox="0 0 14 14" aria-hidden="true"><path d="M12 7H2.5M6.5 3 2.5 7l4 4" /></svg><span>返回</span></button>
    <div class="title">
      <h1>{{ data?.name ?? '会员详情' }}</h1>
      <span class="actions">
        <UiButton variant="primary" v-if="data && canCheckIn" @click="checkInOpen = true">登记入场</UiButton>
        <UiButton variant="primary" v-if="data && canOrder" @click="orderOpen = true">收款开卡</UiButton>
      </span>
    </div>
  </header>
  <DeskCheckInModal v-if="data" v-model:open="checkInOpen" :member="{ id: data.id, name: data.name }" @created="onCheckedIn" />
  <DeskOrderModal v-if="data" v-model:open="orderOpen" :member="{ id: data.id, name: data.name }" @created="onOrdered" />

  <p v-if="notFound" class="state error" role="alert">
    没有这个会员，可能已经被合并或删除了。<UiButton size="sm" @click="router.push({ name: 'members' })">回会员列表</UiButton>
  </p>
  <p v-else-if="error" class="state error" role="alert">
    {{ error }}<UiButton size="sm" @click="load">重试</UiButton>
  </p>
  <p v-else-if="loading && !data" class="state">加载中…</p>

  <template v-if="data">
    <section class="panel info">
      <dl>
        <div><dt>手机号</dt><dd class="num">{{ data.phone }}</dd></div>
        <div><dt>来源</dt><dd>{{ MEMBER_SOURCE_TEXT[data.source] }}</dd></div>
        <div><dt>归属门店</dt><dd>{{ storeName(data.homeStoreId) }}</dd></div>
        <div>
          <dt>首次到店</dt>
          <dd>{{ data.firstVisitOn ? `${formatDot(data.firstVisitOn)}，${storeName(data.firstVisitStoreId)}` : '还没来过' }}</dd>
        </div>
        <div>
          <dt>风险告知书</dt>
          <dd :class="{ warn: !data.waiver }">
            <span v-if="data.waiver" class="nowrap">{{ formatDot(data.waiver.signedOn) }} 签的（{{ data.waiver.version }} 版）</span>
            <template v-else>还没签，第一次入场时让会员在小程序里签</template>
          </dd>
        </div>
      </dl>
    </section>

    <h2>卡</h2>
    <p v-if="!cards.length" class="state">还没有卡</p>
    <ul v-else class="cards">
      <li v-for="c in cards" :key="c.card.id" :class="{ dim: c.dim }">
        <button type="button" class="card-btn" :aria-label="`${c.card.name}，看流水`" @click="ledgerCard = c.card">
        <div class="card-h">
          <span class="kind">{{ c.text.kind }}</span>
          <span class="badge" :class="`st-${c.state}`">{{ c.stateText }}</span>
        </div>
        <strong class="name">{{ c.card.name }}</strong>
        <span class="value"><b>{{ c.text.value }}</b> {{ c.text.unit }}</span>
        <small>{{ c.text.meta }}</small>
        <span class="more"><span>看流水</span><svg class="arr" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9.5M7.5 3l4 4-4 4" /></svg></span>
        </button>
        <div v-if="editable(c.card) && (canAdjust || canFreeze)" class="card-ops">
          <UiButton variant="link" v-if="canAdjust" @click="openAdjust(c.card, 'adjust')">调整</UiButton>
          <template v-if="canFreeze && c.card.kind === 'period'">
            <UiButton variant="link" v-if="c.card.status === 'frozen'" @click="openAdjust(c.card, 'unfreeze')">解冻</UiButton>
            <UiButton variant="link" v-else-if="c.state === 'normal'" @click="openAdjust(c.card, 'freeze')">冻结</UiButton>
          </template>
        </div>
      </li>
    </ul>

    <CardAdjustModal v-if="adjusting" v-model:open="adjustOpen" :mode="adjusting.mode" :card="adjusting.card" @done="onAdjusted" />
    <CardLedgerDrawer :card-id="ledgerCard?.id ?? null" :title="ledgerCard?.name ?? ''" @close="ledgerCard = null" />

    <h2>最近订单</h2>
    <section class="panel">
      <DataTable plain :columns="orderColumns" :rows="data.recentOrders" row-key="id" empty="还没有订单">
        <template #cell-status="{ row }">
          {{ ORDER_STATUS_LABELS[row.status] }}
          <UiButton variant="link" v-if="canRefund && refundable(row)" @click="openRefund(row)">退款</UiButton>
        </template>
      </DataTable>
    </section>
    <RefundModal v-if="refundOrderId" v-model:open="refundOpen" :order-id="refundOrderId" @done="onRefunded" />

    <h2>最近入场</h2>
    <section class="panel">
      <DataTable plain :columns="entryColumns" :rows="data.recentEntries" row-key="id" empty="还没入过场">
        <template #cell-voided="{ row }">
          <span v-if="row.voided" class="voided">{{ voidText(row) }}</span>
          <ConfirmButton
            v-else-if="canVoidRow(row)"
            label="撤销"
            title="撤销这次入场"
            variant="link"
            danger
            :message="voidMessage(row, { memberName: data.name, storeName: storeName(row.storeId) })"
            :action="voidAction(row)"
            @done="onVoided"
          />
        </template>
      </DataTable>
    </section>
  </template>
</template>

<style scoped>
.page-h h1 { margin: 4px 0 16px; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.actions { display: flex; gap: 8px; }
.back { display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0; font: inherit; font-size: 14px; font-weight: 600; color: var(--ink); background: none; border: 0; cursor: pointer; }
.back:hover span { text-decoration: underline; }
/* 文字旁的小箭头：14px SVG，和文字间距 4px（前置图标是 10px），不用字符箭头，免得大小跟着字体变 */
.arr { flex: none; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

h2 { margin: 22px 0 10px; font-family: var(--font-display); font-size: 22px; font-weight: 400; }
.state { margin: 0 0 16px; font-size: 13px; color: var(--ink-muted); }
.state.error { display: flex; align-items: center; gap: 12px; padding: 10px 14px; color: var(--ink); background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.panel { min-width: 0; padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.info dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px 24px; margin: 0; }
.info dt { font-size: 12px; color: var(--ink-muted); }
.info dd { margin: 2px 0 0; font-weight: 600; }
.info dd.warn { color: var(--ink); background: var(--accent-soft); padding: 2px 6px; border-radius: var(--radius-sm); }
.nowrap { white-space: nowrap; }
.voided { font-size: 12px; color: var(--ink-muted); }
.num { font-family: var(--font-number); font-variant-numeric: tabular-nums; }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 0; padding: 0; list-style: none; }
.cards li { display: flex; flex-direction: column; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.card-btn { display: flex; flex: 1; flex-direction: column; gap: 2px; padding: 12px 14px; font: inherit; color: inherit; text-align: left; background: none; border: 0; border-radius: inherit; cursor: pointer; }
.card-ops { display: flex; gap: 14px; margin-top: -6px; padding: 0 14px 12px; }
.more { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--ink); }
.more span { text-decoration: underline; }
.cards li.dim { opacity: 0.6; }
.card-h { display: flex; justify-content: space-between; align-items: center; }
.kind { font-size: 12px; font-weight: 700; }
.badge { padding: 1px 8px; font-size: 12px; font-weight: 600; border: 1px solid var(--ink); border-radius: 999px; background: var(--neutral-soft); }
.badge.st-normal, .badge.st-not_started { background: var(--brand); color: var(--on-brand); }
.badge.st-frozen { background: var(--accent-soft); }
.name { font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.value b { font-family: var(--font-number); font-size: 26px; }
.cards small { font-size: 12px; color: var(--ink-muted); }
/* 触屏（平板前台）：能点的地方至少 44px，桌面鼠标不变 */
@media (pointer: coarse) {
  .back { min-height: 44px; }
}
</style>
