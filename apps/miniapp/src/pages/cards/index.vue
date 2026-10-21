<script setup lang="ts">
import { cardBalance, groupWallet, type Card } from '@climb/core';
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import { formatDot, formatMonthDay, toDateKey } from '@climb/utils';
import { onShow } from '@dcloudio/uni-app';
import gym from '@gym';
import { computed, ref } from 'vue';
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

type Tone = 'brand' | 'accent' | 'neutral' | 'surface';
type Action = { key: string; label: string; dark?: boolean };

/** 把一张卡翻成 MemberCard 要的文字；剩多少由 cardBalance 算 */
function view(card: Card, done: boolean) {
  const b = cardBalance(card, today.value);
  const until = `${formatDot(card.expiresOn)} 前有效`;
  const acts: Action[] = [];
  if (card.kind === 'period' && b.type === 'days') {
    const future = !!b.startsOn;
    if (!done && !future) acts.push({ key: 'scan', label: '入场', dark: true });
    return {
      kind: future ? `期限卡 · ${formatMonthDay(b.startsOn!)}生效` : '期限卡',
      name: card.name,
      value: done ? 0 : b.left,
      unit: done ? '天，已到期' : future ? '天' : '天后到期',
      meta: `${formatDot(card.startsOn)} – ${formatDot(card.expiresOn)}`,
      tone: 'brand' as Tone,
      acts,
    };
  }
  if (b.type === 'voucher') {
    const hint = b.used ? '已使用，欢迎常来'
      : gym.rules.referralRequiresInviterSameDay ? '邀请你的朋友当天到馆扫码后，这张券当天就能用' : '到馆扫码就能免费入场一次';
    if (!done) acts.push({ key: 'scan', label: '扫码入场', dark: true });
    return { kind: '老带新', name: '免费体验券', value: b.used ? '已用' : 1, unit: b.used ? '' : '次', meta: `${hint}\n${until}`, tone: 'neutral' as Tone, acts };
  }
  const lesson = card.kind === 'pt' || card.kind === 'class';
  if (!done) {
    if (card.kind === 'count') {
      if (gym.features.countCardSharing) acts.push({ key: 'share', label: '送给朋友' });
      acts.push({ key: 'ledger', label: '记录' });
    }
    acts.push(lesson ? { key: card.kind === 'pt' ? 'pt' : 'classes', label: '去约课', dark: true } : { key: 'scan', label: '入场', dark: true });
  }
  return {
    kind: card.kind === 'gift' ? '好友赠送' : card.kind === 'pt' ? '私教课时' : card.kind === 'class' ? '团课次数' : '次卡',
    name: card.kind === 'gift' ? '攀岩次卡' : card.name,
    value: b.left,
    unit: `/ ${b.total} ${card.kind === 'pt' ? '节' : '次'}`,
    meta: until,
    tone: (lesson ? 'surface' : 'accent') as Tone,
    acts,
  };
}

const entry = computed(() => groups.value.entry.map(c => ({ id: c.id, ...view(c, false) })));
const lessons = computed(() => groups.value.lessons.map(c => ({ id: c.id, ...view(c, false) })));
const done = computed(() => groups.value.done.map(c => ({ id: c.id, ...view(c, true) })));

// 下面这些页面还没做，做好后换成跳转
const SOON: Record<string, string> = {
  scan: '扫码入场（任务 18）',
  share: '次卡转赠（任务 24）',
  ledger: '使用记录（任务 11）',
  classes: '团课（任务 30）',
  pt: '私教（任务 33）',
  shop: '购卡（任务 13）',
};
function open(key: string) {
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
              <button v-for="a in c.acts" :key="a.key" class="btn" :class="{ dark: a.dark }" size="mini" @tap="open(a.key)">{{ a.label }}</button>
            </view>
          </MemberCard>
        </view>
      </template>

      <template v-if="lessons.length">
        <view class="sec-h"><text class="h">课程</text></view>
        <view class="cards">
          <MemberCard v-for="c in lessons" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" :tone="c.tone">
            <view class="acts">
              <button v-for="a in c.acts" :key="a.key" class="btn" :class="{ dark: a.dark }" size="mini" @tap="open(a.key)">{{ a.label }}</button>
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
          <MemberCard v-for="c in done" :key="c.id" :kind="c.kind" :name="c.name" :value="c.value" :unit="c.unit" :meta="c.meta" tone="surface" />
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
