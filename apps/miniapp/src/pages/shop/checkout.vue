<script setup lang="ts">
import type { CreateOrderResult } from '@climb/api';
import { cardFromProduct, isSingleTicket, productPerks, SHOP_SECTION_LABELS, shopSectionOf, snapshotOf, type Product } from '@climb/core';
import { formatDot, formatYuan, toDateKey } from '@climb/utils';
import Button from '@climb/ui-mp/Button.vue';
import Empty from '@climb/ui-mp/Empty.vue';
import { onLoad } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, pay, run } from '../../api';
import LoadFailed from '../../components/LoadFailed.vue';
import AskSheet from '../../components/AskSheet.vue';
import { ask } from '../../lib/ask';
import { REFUND_NOTE } from '../../config/checkout';
import { errorMessage, payFailedText } from '../../lib/errors';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

const productId = ref('');
onLoad(q => { productId.value = (q?.id as string | undefined) ?? ''; });

const product = ref<Product | null>(null);
const loaded = ref(false);
const paying = ref(false);
/** 上次取消没付的订单，再点支付时接着付 */
let pending: CreateOrderResult | null = null;

/** 拉失败的原因；失败时显示重试，不说「已经不卖了」 */
const error = ref('');
async function load() {
  error.value = '';
  try {
    const list = await run(() => api.products.list(), { loading: '加载中', silent: true });
    product.value = list.find(p => p.id === productId.value && p.onSale) ?? null;
    loaded.value = true;
  } catch (e) {
    error.value = errorMessage(e);
  }
}

useRequireLogin(() => {
  if (!loaded.value) load();
});

// 有效期按 @climb/core 发卡的规则预先算一遍，和付款后发的卡一致
/** 一行：标题、值，和值下面一行小字说明（可选） */
type Row = [label: string, value: string, note?: string];
const rows = computed((): Row[] => {
  const p = product.value;
  if (!p) return [];
  const today = toDateKey(new Date());
  const { me, cards } = member.state;
  const card = cardFromProduct({ id: 'preview', product: snapshotOf(p), memberId: me?.id ?? '', cards, today });
  if (card.kind === 'period') {
    // 手上的期限卡还没到期时，新卡接在后面
    if (card.startsOn === today) return [['生效时间', '付款后立即生效'], ['到期时间', formatDot(card.expiresOn)]];
    return [['生效时间', `${formatDot(card.startsOn)} 起`, '接在现有期限卡后面'], ['到期时间', formatDot(card.expiresOn)]];
  }
  if (isSingleTicket(p)) return [['有效期', '仅限今天']];
  return [['有效期至', formatDot(card.expiresOn)]];
});

const view = computed(() => product.value && {
  section: SHOP_SECTION_LABELS[shopSectionOf(product.value)],
  name: product.value.name,
  perks: productPerks(product.value),
  price: formatYuan(product.value.priceCents),
});

const backToShop = () => uni.navigateBack({ fail: () => uni.redirectTo({ url: '/pages/shop/index' }) });

const modal = (title: string, content: string) => ask({ title, content, showCancel: false, confirmText: '知道了' });

async function submit() {
  const p = product.value;
  if (!p || paying.value) return;
  paying.value = true;
  try {
    // 下单出错 run 会提示
    const result = await run(() => pay.order(p.id, pending), { loading: '下单中' }).catch(() => null);
    if (!result) return;
    pending = result;
    const outcome = await pay.pay(result).catch(e => {
      // 拉起支付本身失败（不是取消）或者查单出错
      modal('支付没成功', payFailedText(e));
      return null;
    });
    if (!outcome) return;
    if (outcome.status === 'cancelled') {
      modal('还没付款', '订单还在，可以去订单里继续付。');
      return;
    }
    pending = null;
    // 付了以后不管结果先刷新卡包；回调晚到的话卡包下次进来也能看到
    await member.refreshCards().catch(() => {});
    if (outcome.status === 'paid') {
      uni.showToast({ title: '买好了，已放进卡包', icon: 'none' });
      uni.switchTab({ url: '/pages/cards/index' });
    } else if (outcome.status === 'waiting') {
      modal('付款结果还没回来', '扣了款的话卡会自动到账，稍等一会儿去卡包看看；一直没到找前台。');
    } else {
      modal('订单已关闭', '超过付款时间了，重新下一单吧。扣了款的话找前台退。');
    }
  } finally {
    paying.value = false;
  }
}
</script>

<template>
  <view class="page">
    <template v-if="view">
      <view class="panel sum">
        <text class="cat">{{ view.section }}</text>
        <text class="name">{{ view.name }}</text>
        <text v-for="x in view.perks" :key="x" class="perk">✓ {{ x }}</text>
      </view>
      <view class="panel kv">
        <view v-for="[k, v, n] in rows" :key="k" class="kv-row">
          <text class="k">{{ k }}</text>
          <view class="v-col"><text class="v">{{ v }}</text><text v-if="n" class="v-note">{{ n }}</text></view>
        </view>
      </view>
      <text class="fine">{{ REFUND_NOTE }}</text>

      <view class="foot">
        <view class="sum-l"><text class="small">合计</text><text class="price">{{ view.price }}</text></view>
        <Button variant="primary" :disabled="paying" @tap="submit">微信支付</Button>
      </view>
    </template>
    <LoadFailed v-else-if="error" :text="error" @retry="load" />
    <Empty v-else-if="loaded" title="这个已经不卖了" text="回去换一个看看。">
      <Button mini @tap="backToShop">回购卡页</Button>
    </Empty>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 120px; }
.panel { margin-bottom: 12px; padding: 14px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.sum { display: flex; flex-direction: column; gap: 6px; }
.cat { align-self: flex-start; padding: 2px 8px; border-radius: var(--radius-sm); background: var(--ink); color: var(--surface); font-size: 12px; font-weight: 600; }
.name { font-family: var(--font-display); font-size: 22px; }
.perk { font-size: 13px; }
.kv { padding-top: 4px; padding-bottom: 4px; }
.kv-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 12px 0; font-size: 14px; }
.kv-row + .kv-row { border-top: 1px solid var(--line); }
.k { flex-shrink: 0; color: var(--ink-muted); }
.v-col { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.v { text-align: right; font-weight: 600; line-height: 1.6; }
.v-note { font-size: 12px; color: var(--ink-muted); }
.fine { display: block; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.foot { position: fixed; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: space-between; padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); border-top: var(--stroke) solid var(--ink); background: var(--surface); }
.sum-l { display: flex; align-items: baseline; gap: 6px; }
.small { font-size: 12px; color: var(--ink-muted); }
.price { font-family: var(--font-number); font-size: 24px; font-weight: 700; }
.empty { padding: 80px 0; text-align: center; color: var(--ink-muted); }
</style>
