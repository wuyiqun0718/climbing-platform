<script setup lang="ts">
import { groupWallet, type ReferralStatus } from '@climb/core';
import Button from '@climb/ui-mp/Button.vue';
import Empty from '@climb/ui-mp/Empty.vue';
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import { toDateKey } from '@climb/utils';
import gym from '@gym';
import { onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api } from '../../api';
import { cardView } from '../../lib/card-view';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { startScan } from '../checkin/start-scan';
import AskSheet from '../../components/AskSheet.vue';

// 要登录：没登录先去登录页，登录完回到这里
useRequireLogin(() => {
  member.ensureLoaded().catch(() => {});
  loadReferral();
});

/** 期限卡上带一句本月还能带几位朋友；数据和老带新页同一个接口，拿不到就不显示 */
const referral = ref<ReferralStatus | null>(null);
async function loadReferral() {
  if (!gym.features.referral) return;
  referral.value = await api.me.referrals().then(r => r.status, () => null);
}
const referralLine = computed(() => {
  const r = referral.value;
  return r && r.blockedBy !== 'no-period-card' ? `本月还能带 ${r.left} 位朋友免费来爬` : '';
});

// 跨天后回到卡包要按新的一天算
const today = ref(toDateKey(new Date()));
onShow(() => { today.value = toDateKey(new Date()); });

// 哪些卡还能用、怎么排，规则在 @climb/core
const groups = computed(() => groupWallet([...member.state.cards], today.value));
const showDone = ref(false);

const entry = computed(() => groups.value.entry.map(c => ({ id: c.id, period: c.kind === 'period', ...cardView(c, today.value, false) })));
const lessons = computed(() => groups.value.lessons.map(c => ({ id: c.id, ...cardView(c, today.value, false) })));
const done = computed(() => groups.value.done.map(c => ({ id: c.id, ...cardView(c, today.value, true) })));

function open(key: string, cardId?: string) {
  if (key === 'ledger' && cardId) {
    uni.navigateTo({ url: `/pages/cards/detail?id=${encodeURIComponent(cardId)}` });
    return;
  }
  if (key === 'share' && cardId) {
    uni.navigateTo({ url: `/pages/share/count?id=${encodeURIComponent(cardId)}` });
    return;
  }
  if (key === 'shop') {
    uni.navigateTo({ url: '/pages/shop/index' });
    return;
  }
  if (key === 'scan') {
    startScan();
    return;
  }
  if (key === 'classes') {
    uni.navigateTo({ url: '/pages/classes/index' });
    return;
  }
  uni.showToast({ title: key === 'pt' ? '私教预约还没开放' : '这个入口还没开放', icon: 'none' });
}
</script>

<template>
  <view class="page">
    <Empty v-if="member.state.loaded && !member.state.cards.length" class="empty" title="卡包还是空的" text="买一张卡，或者请有卡的朋友把次数送给你。">
      <Button variant="primary" mini @tap="open('shop')">去购卡</Button>
    </Empty>

    <template v-else>
      <template v-if="entry.length">
        <view class="sec-h"><text class="h">入场卡</text><text class="sub">{{ entry.length }} 张</text></view>
        <view class="cards">
          <MemberCard v-for="c in entry" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" :tone="c.tone" :progress="c.progress">
            <text v-if="c.period && referralLine" class="extra">{{ referralLine }}</text>
            <view v-if="c.acts.length" class="acts">
              <Button v-for="a in c.acts" :key="a.key" :variant="a.dark ? 'dark' : 'default'" mini @tap="open(a.key, c.id)">{{ a.label }}</Button>
            </view>
          </MemberCard>
        </view>
      </template>

      <template v-if="lessons.length">
        <view class="sec-h"><text class="h">课程</text></view>
        <view class="cards">
          <MemberCard v-for="c in lessons" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" :tone="c.tone" :progress="c.progress">
            <view class="acts">
              <Button v-for="a in c.acts" :key="a.key" :variant="a.dark ? 'dark' : 'default'" mini @tap="open(a.key, c.id)">{{ a.label }}</Button>
            </view>
          </MemberCard>
        </view>
      </template>

      <template v-if="done.length">
        <view class="done-h" @tap="showDone = !showDone">
          <text>已用完或已过期（{{ done.length }}）</text>
          <text>{{ showDone ? '收起' : '展开' }}</text>
        </view>
        <view v-if="showDone" class="cards done">
          <MemberCard v-for="c in done" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" tone="surface" :progress="c.progress">
            <view v-if="c.acts.length" class="acts">
              <Button v-for="a in c.acts" :key="a.key" mini @tap="open(a.key, c.id)">{{ a.label }}</Button>
            </view>
          </MemberCard>
        </view>
      </template>

      <view v-if="member.state.loaded" class="buy-more"><Button block @tap="open('shop')">+ 购买新卡</Button></view>
    </template>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 4px 16px 32px; }
.sec-h { display: flex; align-items: baseline; justify-content: space-between; margin: 18px 0 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.sub { font-size: 12px; color: var(--ink-muted); }
.cards { display: flex; flex-direction: column; gap: 14px; }
.cards.done { margin-top: 10px; opacity: 0.6; }
.extra { margin-top: 10px; font-size: 12px; font-weight: 600; }
.acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.done-h { display: flex; justify-content: space-between; margin-top: 22px; padding: 10px 0; font-size: 13px; color: var(--ink-muted); border-top: 1px dashed var(--ink-muted); }

.empty { margin-top: 32px; }

.buy-more { margin-top: 22px; }
</style>
