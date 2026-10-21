<script setup lang="ts">
import { groupWallet } from '@climb/core';
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import { toDateKey } from '@climb/utils';
import { onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { cardView } from '../../lib/card-view';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

// 要登录：没登录先去登录页，登录完回到这里
useRequireLogin(() => member.ensureLoaded().catch(() => {}));

// 跨天后回到卡包要按新的一天算
const today = ref(toDateKey(new Date()));
onShow(() => { today.value = toDateKey(new Date()); });

// 哪些卡还能用、怎么排，规则在 @climb/core
const groups = computed(() => groupWallet([...member.state.cards], today.value));
const showDone = ref(false);

const entry = computed(() => groups.value.entry.map(c => ({ id: c.id, ...cardView(c, today.value, false) })));
const lessons = computed(() => groups.value.lessons.map(c => ({ id: c.id, ...cardView(c, today.value, false) })));
const done = computed(() => groups.value.done.map(c => ({ id: c.id, ...cardView(c, today.value, true) })));

// 下面这些页面还没做，做好后换成跳转
const SOON: Record<string, string> = {
  scan: '扫码入场（任务 18）',
  share: '次卡转赠（任务 24）',
  classes: '团课（任务 30）',
  pt: '私教（任务 33）',
  shop: '购卡（任务 13）',
};
function open(key: string, cardId?: string) {
  if (key === 'ledger' && cardId) {
    uni.navigateTo({ url: `/pages/cards/detail?id=${encodeURIComponent(cardId)}` });
    return;
  }
  uni.showToast({ title: `${SOON[key] ?? key}还在做`, icon: 'none' });
}
</script>

<template>
  <view class="page">
    <view v-if="member.state.loaded && !member.state.cards.length" class="empty">
      <text class="empty-h">卡包还是空的</text>
      <text class="empty-p">买一张卡，或者请有卡的朋友把次数送给你。</text>
      <button class="btn primary" size="mini" @tap="open('shop')">去购卡</button>
    </view>

    <template v-else>
      <template v-if="entry.length">
        <view class="sec-h"><text class="h">入场卡</text><text class="sub">{{ entry.length }} 张</text></view>
        <view class="cards">
          <MemberCard v-for="c in entry" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" :tone="c.tone">
            <view v-if="c.acts.length" class="acts">
              <button v-for="a in c.acts" :key="a.key" class="btn" :class="{ dark: a.dark }" size="mini" @tap="open(a.key, c.id)">{{ a.label }}</button>
            </view>
          </MemberCard>
        </view>
      </template>

      <template v-if="lessons.length">
        <view class="sec-h"><text class="h">课程</text></view>
        <view class="cards">
          <MemberCard v-for="c in lessons" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" :tone="c.tone">
            <view class="acts">
              <button v-for="a in c.acts" :key="a.key" class="btn" :class="{ dark: a.dark }" size="mini" @tap="open(a.key, c.id)">{{ a.label }}</button>
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
          <MemberCard v-for="c in done" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" tone="surface">
            <view v-if="c.acts.length" class="acts">
              <button v-for="a in c.acts" :key="a.key" class="btn" size="mini" @tap="open(a.key, c.id)">{{ a.label }}</button>
            </view>
          </MemberCard>
        </view>
      </template>

      <button v-if="member.state.loaded" class="btn block" @tap="open('shop')">+ 购买新卡</button>
    </template>
  </view>
</template>

<style scoped>
.page { padding: 4px 16px 32px; }
.sec-h { display: flex; align-items: baseline; justify-content: space-between; margin: 18px 0 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.sub { font-size: 12px; color: var(--ink-muted); }
.cards { display: flex; flex-direction: column; gap: 14px; }
.cards.done { margin-top: 10px; opacity: 0.6; }
.acts { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.done-h { display: flex; justify-content: space-between; margin-top: 22px; padding: 10px 0; font-size: 13px; color: var(--ink-muted); border-top: 1px dashed var(--ink-muted); }

.empty { display: flex; flex-direction: column; align-items: center; padding: 80px 16px; }
.empty-h { font-family: var(--font-display); font-size: 22px; }
.empty-p { margin: 6px 0 16px; font-size: 13px; color: var(--ink-muted); text-align: center; }

.btn { margin: 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600; }
.btn.primary { background: var(--brand); }
.btn.dark { background: var(--ink); color: var(--surface); }
.btn.block { margin-top: 22px; }
</style>
