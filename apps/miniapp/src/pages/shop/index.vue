<script setup lang="ts">
import { groupProducts, isSingleTicket, productPerks, SHOP_SECTION_LABELS, type Product, type ShopSection } from '@climb/core';
import { formatYuan } from '@climb/utils';
import gym from '@gym';
import Button from '@climb/ui-mp/Button.vue';
import { onLoad } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, run } from '../../api';

// 看卡种不用登录，到确认订单页再登录
const products = ref<Product[]>([]);
const loaded = ref(false);
const seg = ref<ShopSection | ''>('');

onLoad(async q => {
  seg.value = (q?.seg as ShopSection | undefined) ?? '';
  try {
    products.value = await run(() => api.products.list(), { loading: '加载中' });
  } catch {
    // run 已经提示过了
  } finally {
    loaded.value = true;
  }
});

// 分组、排序、哪些显示，规则在 @climb/core
const groups = computed(() => groupProducts(products.value, gym.features));
const current = computed(() => groups.value.find(g => g.section === seg.value) ?? groups.value[0]);

const INTRO: Record<ShopSection, string> = {
  period: `有效期内不限次数入场，每个月还能免费带 ${gym.rules.referralsPerMonth} 位新朋友来爬。`,
  count: '三店通用，次数可以分次送给朋友，朋友在小程序里领了就能扫码入场。',
  single: '第一次来可以先买一张，当天有效。',
  pt: '买好课包后，在「私教」里挑教练和时间。',
  class: '买次数包比单节划算，约课时自动抵扣。',
};

function desc(p: Product): string {
  if (p.category === 'period') return `${p.days} 天内不限次入场`;
  if (isSingleTicket(p)) return '购买当天有效';
  const valid = p.validMonths ? `${p.validMonths} 个月内有效` : '';
  if (p.category === 'count' && p.quantity) return `${valid}，约 ${formatYuan(Math.round(p.priceCents / p.quantity / 100) * 100)}/次`;
  return [p.quantity ? `${p.quantity} 节` : '', valid].filter(Boolean).join('，');
}

const list = computed(() => (current.value?.products ?? []).map(p => ({
  id: p.id, name: p.name, desc: desc(p), perks: productPerks(p), price: formatYuan(p.priceCents),
})));

function buy(productId: string) {
  uni.navigateTo({ url: `/pages/shop/checkout?id=${encodeURIComponent(productId)}` });
}
</script>

<template>
  <view class="page">
    <view v-if="groups.length" class="segs">
      <text v-for="g in groups" :key="g.section" class="seg" :class="{ on: g.section === current?.section }" @tap="seg = g.section">{{ SHOP_SECTION_LABELS[g.section] }}</text>
    </view>

    <view v-if="current" class="pad">
      <text class="hint">{{ INTRO[current.section] }}</text>
      <view class="list">
        <view v-for="p in list" :key="p.id" class="prod">
          <text class="name">{{ p.name }}</text>
          <text class="desc">{{ p.desc }}</text>
          <view v-if="p.perks.length" class="perks">
            <text v-for="x in p.perks" :key="x" class="perk">✓ {{ x }}</text>
          </view>
          <view class="foot">
            <text class="price">{{ p.price }}</text>
            <Button variant="primary" mini @tap="buy(p.id)">购买</Button>
          </view>
        </view>
      </view>
    </view>

    <view v-else-if="loaded" class="empty">
      <text class="empty-h">暂时没有在售的卡</text>
      <text class="empty-p">前台正在调整价格，稍后再来看看。</text>
    </view>
  </view>
</template>

<style scoped>
.page { padding-bottom: 32px; }
.segs { display: flex; gap: 8px; padding: 10px 16px; overflow-x: auto; background: var(--surface); border-bottom: var(--stroke) solid var(--ink); }
.seg { flex-shrink: 0; padding: 6px 12px; border-radius: var(--radius-sm); font-size: 14px; color: var(--ink-muted); }
.seg.on { background: var(--brand); color: var(--on-brand); font-weight: 600; }
.pad { padding: 12px 16px; }
.hint { display: block; font-size: 13px; color: var(--ink-muted); }
.list { display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }
.prod { display: flex; flex-direction: column; padding: 14px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.name { font-family: var(--font-display); font-size: 20px; }
.desc { margin-top: 4px; font-size: 13px; color: var(--ink-muted); }
.perks { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; }
.perk { font-size: 13px; }
.foot { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
.price { font-family: var(--font-number); font-size: 22px; font-weight: 700; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 80px 16px; }
.empty-h { font-family: var(--font-display); font-size: 22px; }
.empty-p { margin: 6px 0 16px; font-size: 13px; color: var(--ink-muted); text-align: center; }

</style>
