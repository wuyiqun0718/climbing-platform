<script setup lang="ts">
import { ApiError, type CreateOrderResult, type EntryQrBody } from '@climb/api';
import { entryBlockedText, entrySheet, pickEntryCard, type EntryOption, type EntrySheet, type WaiverVersion } from '@climb/core';
import { formatDot, formatYuan } from '@climb/utils';
import Button from '@climb/ui-mp/Button.vue';
import { onLoad } from '@dcloudio/uni-app';
import gym from '@gym';
import { computed, ref } from 'vue';
import { api, pay, run } from '../../api';
import { errorCode, errorMessage } from '../../lib/errors';
import { requireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { CHECKIN_PAGE, fromPageQuery, NOT_OURS_MESSAGE } from './scan';
import { startScan } from './start-scan';
import WaiverAgree from './waiver.vue';

// 签到页：微信扫前台的码直接打开，或者小程序里扫码后跳过来。
// 解析码、确认登录、预览（验码，不作废）→ 选卡（没卡就买单次票）→ 确认入场。
// 选哪张、能不能用、保险怎么标都按 @climb/core 的 entrySheet，这里只显示。
// 没签当前版本的风险告知书时预览会带上它：勾选同意后先签（POST /waivers），再付款或入场。
// 入场后换成成功页（done?id=）；体验券等邀请人时可以去 done?wait=1 等着。
const status = ref<'loading' | 'bad' | 'ready'>('loading');
const message = ref('');
const qr = ref<EntryQrBody | null>(null);
const storeName = ref('');
const reentry = ref(false);
const sheet = ref<EntrySheet | null>(null);
const selected = ref<string | null>(null);
const submitting = ref(false);
/** 要签的告知书；签过为 null */
const waiver = ref<WaiverVersion | null>(null);
const agreed = ref(false);
/** 进页面时生成一次，重试、连点都带同一个，后端只入场一次 */
const idempotencyKey = `ci-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
/** 买单次票时取消没付的订单，再点接着付 */
let pendingOrder: CreateOrderResult | null = null;

const bad = (text: string) => {
  status.value = 'bad';
  message.value = text;
};

onLoad(async q => {
  const r = fromPageQuery(gym.entryQrLink, (q ?? {}) as Record<string, string | undefined>);
  if (!r.ok) return bad(r.reason === 'none' ? '没扫到码，对准前台平板上的码扫一下' : NOT_OURS_MESSAGE);
  // 没登录：登录页替换掉这一页，登录完带着解析好的码回来
  if (!(await requireLogin({ route: CHECKIN_PAGE, query: { s: r.qr.storeId, t: r.qr.qrToken } }))) return;
  member.ensureLoaded().catch(() => {});
  qr.value = r.qr;
  await loadPreview();
});

/** 验码、列卡、看要不要签告知书。告知书中途换了版本时也重新拉一次 */
async function loadPreview() {
  try {
    const [preview, products] = await run(() => Promise.all([api.checkIns.preview(qr.value!), api.products.list()]), { silent: true, loading: '加载中' });
    storeName.value = preview.store.name;
    reentry.value = preview.reentry;
    sheet.value = entrySheet({ options: preview.options, products, todayPolicy: preview.todayPolicy });
    if (!selected.value || !sheet.value.options.some(o => o.card.id === selected.value && o.usable)) selected.value = sheet.value.selected;
    if (preview.waiver?.id !== waiver.value?.id) agreed.value = false;
    waiver.value = preview.waiver;
    status.value = 'ready';
    uni.setNavigationBarTitle({ title: preview.store.name });
  } catch (e) {
    // 码过期、用过、不是本馆的：后端的原因翻成中文，让会员重新扫
    bad(errorMessage(e));
  }
}

const rescan = () => startScan('redirectTo');
const pick = (cardId: string) => { if (sheet.value) selected.value = pickEntryCard({ options: sheet.value.options, selected: selected.value }, cardId); };

function optionSub(o: EntryOption): string {
  const blocked = entryBlockedText(o);
  if (blocked) return `${blocked}，等 TA 入场后再扫一次就能用`;
  const c = o.card;
  if (c.kind === 'period') return `${formatDot(c.expiresOn)} 到期，不扣次`;
  if (c.kind === 'referral') return `免费入场一次，${formatDot(c.expiresOn)} 前有效`;
  return o.deducts ? `扣 ${o.deducts} 次，还剩 ${c.remaining} 次` : `今天再入场不扣次，还剩 ${c.remaining} 次`;
}

const single = computed(() => sheet.value?.singleTicket ?? null);
const confirmText = computed(() => (sheet.value?.mustBuy && single.value ? `微信支付 ${formatYuan(single.value.priceCents)} 并入场` : '确认入场'));
const canSubmit = computed(() => !!sheet.value && (sheet.value.mustBuy ? !!single.value : !!selected.value) && (!waiver.value || agreed.value));

const modal = (title: string, content: string) => uni.showModal({ title, content, showCancel: false, confirmText: '知道了' });

/** 用某张卡入场。码在买票时过期了就让会员重新扫，卡已经在卡包里了 */
async function enter(cardId: string, cardName: string, bought: boolean) {
  try {
    const checkIn = await run(() => api.checkIns.create({ ...qr.value!, cardId, idempotencyKey }), { loading: '入场中', silent: true });
    uni.redirectTo({ url: `/pages/checkin/done?id=${encodeURIComponent(checkIn.id)}` });
  } catch (e) {
    const code = errorCode(e);
    if (code === 'waiver-required') {
      // 告知书刚换了新版：重新拉，让会员看新版再同意
      await loadPreview();
      modal('告知书更新了', bought ? `${cardName}已经买好，放进卡包了。告知书刚更新，看一下新版再同意就能进。` : '告知书刚更新，看一下新版再同意就能进。');
    } else if (code === 'qr-expired' || code === 'qr-used') {
      bad(bought ? `${cardName}已经买好，放进卡包了。${errorMessage(e)}` : errorMessage(e));
    } else {
      uni.showToast({ title: errorMessage(e), icon: 'none' });
    }
  } finally {
    member.refreshCards().catch(() => {});
  }
}

/** 没卡：买单次票，付完用新发的卡入场 */
async function buyAndEnter() {
  const p = single.value!;
  const order = await run(() => pay.order(p.id, pendingOrder), { loading: '下单中' }).catch(() => null);
  if (!order) return;
  pendingOrder = order;
  const outcome = await pay.pay(order).catch(e => {
    uni.showToast({ title: e instanceof ApiError ? errorMessage(e) : '支付没成功，再试一次', icon: 'none' });
    return null;
  });
  if (!outcome) return;
  if (outcome.status === 'cancelled') return modal('还没付款', '订单还在，再点一次接着付，或者去订单里付。');
  pendingOrder = null;
  member.refreshCards().catch(() => {});
  if (outcome.status === 'closed') return modal('订单已关闭', '超过付款时间了，再点一次重新下单。扣了款的话找前台退。');
  if (outcome.status === 'waiting' || !outcome.order.cardId) return modal('付款结果还没回来', '扣了款的话票会自动到账，稍等一会儿再扫一次码；一直没到找前台。');
  await enter(outcome.order.cardId, p.name, true);
}

/** 先签告知书（没签当前版本时）；签不成功就不付款、不入场。返回签好了没有 */
async function signWaiver(): Promise<boolean> {
  const w = waiver.value;
  if (!w) return true;
  try {
    await run(() => api.waivers.sign({ waiverVersionId: w.id }), { loading: '提交中', silent: true });
  } catch (e) {
    if (errorCode(e) !== 'waiver-outdated') {
      uni.showToast({ title: errorMessage(e), icon: 'none' });
      return false;
    }
    await loadPreview();
    modal('告知书更新了', '告知书刚更新，看一下新版再同意。');
    return false;
  }
  waiver.value = null;
  member.markWaiverSigned();
  return true;
}

async function submit() {
  const s = sheet.value;
  if (!s || !canSubmit.value || submitting.value) return;
  submitting.value = true;
  try {
    if (!(await signWaiver())) return;
    if (s.mustBuy) await buyAndEnter();
    else await enter(selected.value!, s.options.find(o => o.card.id === selected.value)!.card.name, false);
  } finally {
    submitting.value = false;
  }
}

const waitInviter = () => uni.redirectTo({ url: '/pages/checkin/done?wait=1' });
const goShop = () => uni.navigateTo({ url: '/pages/shop/index' });
</script>

<template>
  <view class="page">
    <view v-if="status === 'bad'" class="panel">
      <text class="h">没法入场</text>
      <text class="p">{{ message }}</text>
      <view class="act"><Button variant="primary" block @tap="rescan">重新扫码</Button></view>
    </view>

    <template v-else-if="status === 'ready' && sheet">
      <text class="h">{{ storeName }}</text>
      <text v-if="reentry" class="p">今天已经入过场了，这次不扣次</text>

      <text class="label">用哪张卡</text>
      <view v-if="sheet.mustBuy" class="panel">
        <text class="p first">{{ sheet.waitingInviter ? '老带新体验券要在邀请人到馆的当天用。可以等 TA 入场后再扫，或者先买单次票进。' : '还没有能用的入场卡，买一张单次票就能进。' }}</text>
      </view>
      <view v-for="o in sheet.options" :key="o.card.id" class="opt" :class="{ on: o.card.id === selected, off: !o.usable }" @tap="pick(o.card.id)">
        <view class="radio" />
        <view class="opt-t"><text class="b">{{ o.card.name }}</text><text class="small">{{ optionSub(o) }}</text></view>
      </view>
      <view v-if="sheet.mustBuy && single" class="opt on">
        <view class="radio" />
        <view class="opt-t"><text class="b">{{ single.name }} {{ formatYuan(single.priceCents) }}</text><text class="small">今天有效，含当日保险</text></view>
      </view>
      <view v-if="sheet.mustBuy && !single" class="panel">
        <text class="p first">现在没在卖单次票，去看看其他卡，或者找前台。</text>
        <view class="act"><Button block @tap="goShop">看看其他卡</Button></view>
      </view>

      <text class="label">当日保险</text>
      <view class="panel ins">
        <text class="b">入场当日保险</text>
        <text class="tag">{{ sheet.insurance.tag }}</text>
      </view>
      <text class="fine">{{ sheet.insurance.note }}</text>

      <template v-if="waiver">
        <text class="label">风险告知书</text>
        <WaiverAgree v-model="agreed" :waiver="waiver" />
        <text class="fine">只在第一次入场时签，告知书更新了会请你再看一次。签了以后不用到前台签纸质单。</text>
      </template>

      <view class="act block"><Button variant="primary" block :disabled="!canSubmit || submitting" @tap="submit">{{ confirmText }}</Button></view>
      <view v-if="sheet.mustBuy && sheet.waitingInviter" class="act block"><Button block @tap="waitInviter">我等等再扫</Button></view>
    </template>
  </view>
</template>

<style scoped>
.page { padding: 16px 16px 40px; }
.panel { display: flex; flex-direction: column; margin-bottom: 10px; padding: 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.h { display: block; font-family: var(--font-display); font-size: 24px; }
.p { display: block; margin-top: 6px; font-size: 14px; color: var(--ink-muted); }
.p.first { margin-top: 0; }
.label { display: block; margin: 18px 0 8px; font-size: 13px; font-weight: 600; }
.opt { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; padding: 12px 14px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.opt.on { background: var(--brand); }
.opt.off { opacity: 0.5; }
.radio { width: 16px; height: 16px; border: var(--stroke) solid var(--ink); border-radius: 50%; background: var(--surface); }
.opt.on .radio { background: var(--ink); }
.opt-t { display: flex; flex-direction: column; gap: 2px; }
.b { font-size: 15px; font-weight: 600; }
.small { font-size: 12px; color: var(--ink-muted); }
/* 品牌底上的说明用正文色压淡，灰字对比度不够 */
.opt.on .small { color: var(--on-brand); opacity: 0.75; }
.ins { flex-direction: row; align-items: center; justify-content: space-between; }
.tag { padding: 2px 8px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; }
.fine { display: block; margin-bottom: 16px; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.act { margin-top: 14px; }
.act.block { margin-top: 10px; }
</style>
