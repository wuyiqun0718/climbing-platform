<script setup lang="ts">
import { entryOptions, type Card, type EntryOption } from '@climb/core';
// 小程序组件要按 .vue 路径引入，uni-app 才会生成 usingComponents
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import { addDays, daysBetween, formatDot, toDateKey } from '@climb/utils';
import { onLoad } from '@dcloudio/uni-app';
import gym from '@gym';
import DevPanel from '../../mock/dev-panel.vue';

const today = toDateKey(new Date());

// 示例数据：后端接好之前，先用本地数据把页面和共享逻辑跑通
const cards: Card[] = [
  { id: 'c1', kind: 'count', memberId: 'me', productId: 'c10', name: '10 次卡', total: 10, remaining: 6, expiresOn: addDays(today, 118) },
  { id: 'p1', kind: 'period', memberId: 'me', productId: 'y1', name: '年卡', startsOn: addDays(today, -209), expiresOn: addDays(today, 155) },
];

// 入场规则来自 @climb/core，和后台、后端用的是同一份
const options = entryOptions(cards, { today, rules: gym.rules, hasCheckedIn: () => false });
const logo = `/static/gym/${gym.logo}`;

function cardView(o: EntryOption) {
  const c = o.card;
  if (c.kind === 'period') {
    return { kind: '期限卡', tone: 'brand' as const, value: daysBetween(today, c.expiresOn) + 1, unit: '天后到期', meta: `${formatDot(c.startsOn)} – ${formatDot(c.expiresOn)}` };
  }
  if (c.kind === 'count' || c.kind === 'gift') {
    return { kind: c.kind === 'gift' ? '好友赠送' : '次卡', tone: 'accent' as const, value: c.remaining, unit: `/ ${c.total} 次`, meta: `${formatDot(c.expiresOn)} 前有效，这次入场扣 ${o.deducts} 次` };
  }
  return { kind: '老带新', tone: 'neutral' as const, value: o.usable ? '可用' : '等待', unit: '', meta: `${formatDot(c.expiresOn)} 前有效` };
}

// 导航栏颜色在 pages.json 里（按主题生成），这里只设标题
onLoad(() => {
  uni.setNavigationBarTitle({ title: gym.shortName });
});
</script>

<template>
  <view class="page">
    <view class="hero">
      <image class="logo" :src="logo" mode="aspectFill" />
      <view class="hero-text">
        <text class="title">{{ gym.name }}</text>
        <text class="sub">每天 {{ gym.openHours.open }}–{{ gym.openHours.close }} 营业</text>
      </view>
    </view>

    <view class="section">
      <text class="h">可以用来入场的卡</text>
    </view>
    <view class="cards">
      <MemberCard v-for="o in options" :key="o.card.id" :name="o.card.name" v-bind="cardView(o)" />
    </view>

    <text class="note">完整的交互原型在仓库的 prototype/ 目录。这里是正式工程的起点，页面会按原型逐个实现。</text>

    <DevPanel />
  </view>
</template>

<style scoped>
.page { padding-bottom: 32px; }
.hero { display: flex; align-items: center; padding: 16px; background: var(--brand); border-bottom: var(--stroke) solid var(--ink); }
.logo { flex: none; width: 56px; height: 56px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.hero-text { display: flex; flex-direction: column; margin-left: 12px; }
.title { font-family: var(--font-display); font-size: 24px; }
.sub { font-size: 13px; }
.section { margin: 22px 16px 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.cards { display: flex; flex-direction: column; gap: 14px; padding: 0 16px; }
.note { display: block; margin: 24px 16px 0; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
</style>
