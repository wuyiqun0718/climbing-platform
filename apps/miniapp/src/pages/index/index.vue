<script setup lang="ts">
import { summarizeCards } from '@climb/core';
import { formatMonthDay, toDateKey } from '@climb/utils';
import { onLoad, onShow } from '@dcloudio/uni-app';
import gym from '@gym';
import { computed, ref } from 'vue';
import { goLogin } from '../../lib/use-login';
import DevPanel from '../../mock/dev-panel.vue';
import { member } from '../../stores';

// 跨天后回到首页要按新的一天算
const today = ref(toDateKey(new Date()));
// 每个岩馆都有 logo；mark 不一定有
const mark = `/static/gym/${gym.logo}`;

const me = computed(() => member.state.me);
// 哪些卡算能入场、还剩多少，规则在 @climb/core
const summary = computed(() => summarizeCards([...member.state.cards], today.value));

function greet() {
  const h = new Date().getHours();
  return h < 5 ? '晚上好' : h < 11 ? '早上好' : h < 14 ? '中午好' : h < 18 ? '下午好' : '晚上好';
}

const hello = computed(() => (me.value ? `${greet()}，${me.value.name}` : greet()));

const sub = computed(() => {
  if (!me.value) return member.state.loaded ? '登录后看你的卡和预约' : '';
  const s = summary.value;
  if (s.period) return `${s.period.card.name}还有 ${s.period.daysLeft} 天到期`;
  if (s.countLeft) return `次卡还剩 ${s.countLeft} 次`;
  if (s.voucher) return '你有一张老带新体验券';
  if (s.upcomingPeriod) return `${s.upcomingPeriod.name}${formatMonthDay(s.upcomingPeriod.startsOn)}生效`;
  return '还没有入场卡';
});

const quick = computed(() =>
  [
    { key: 'shop', label: '购卡', tone: 'accent', show: true },
    { key: 'classes', label: '团课', tone: 'neutral', show: gym.features.groupClasses },
    { key: 'pt', label: '私教', tone: 'brand', show: gym.features.personalTraining },
    { key: 'events', label: '活动', tone: 'surface', show: gym.features.events },
  ].filter(q => q.show),
);

/** 底下的大块：期限卡会员看老带新，拿着体验券的看券，没卡的引导买卡 */
const board = computed(() => {
  if (!me.value) return null;
  const s = summary.value;
  if (s.period && gym.features.referral) {
    // 本月还剩几个名额要「已发记录」接口，任务 25 接上
    return { kind: 'referral' as const, title: '老带新', text: `期限卡会员每个月可以带 ${gym.rules.referralsPerMonth} 位新朋友免费来爬一次`, btn: '去邀请' };
  }
  if (s.voucher) {
    const text = gym.rules.referralRequiresInviterSameDay ? '邀请你的朋友当天到馆扫码后，你就能免费入场' : '到馆扫码就能免费入场一次';
    return { kind: 'voucher' as const, title: '老带新体验券', text, btn: '查看' };
  }
  if (!s.canEnter && !s.upcomingPeriod) return { kind: 'buy' as const };
  return null;
});
const firstTime = computed(() => member.state.cards.length === 0);

// 下面这些页面还没做，做好后把对应的 case 换成跳转
const SOON: Record<string, string> = {
  scan: '扫码入场（任务 18）',
  shop: '购卡（任务 13）',
  classes: '团课（任务 30）',
  pt: '私教（任务 33）',
  events: '活动（任务 36）',
  referral: '老带新（任务 25）',
};
function open(key: string) {
  if (key === 'wallet') return uni.switchTab({ url: '/pages/cards/index' });
  uni.showToast({ title: `${SOON[key] ?? key}还在做`, icon: 'none' });
}

function scan() {
  if (!me.value) return goLogin().catch(e => console.warn('跳转登录页失败', e));
  open('scan');
}

onLoad(() => uni.setNavigationBarTitle({ title: gym.shortName }));
onShow(() => {
  today.value = toDateKey(new Date());
  member.ensureLoaded().catch(() => {});
});
</script>

<template>
  <view class="page">
    <view class="hero">
      <image class="hero-mark" :src="mark" mode="widthFix" />
      <text class="hello">{{ hello }}</text>
      <text class="hello-sub">{{ sub }}</text>
      <!-- 今天入没入过场要等「我的入场记录」接口（任务 22/37），现在一直显示扫码 -->
      <view class="scan" hover-class="scan-down" @tap="scan">
        <view class="scan-in">
          <text class="scan-ic">⌗</text>
          <view class="scan-t">
            <text class="scan-title">扫码入场</text>
            <text class="scan-hint">对准前台的二维码扫一下</text>
          </view>
          <text class="arrow">›</text>
        </view>
      </view>
    </view>

    <view class="quick">
      <view v-for="q in quick" :key="q.key" class="q" @tap="open(q.key)">
        <view class="q-ic" :class="`tone-${q.tone}`"><text>{{ q.label.slice(0, 1) }}</text></view>
        <text class="q-label">{{ q.label }}</text>
      </view>
    </view>

    <view v-if="!me && member.state.loaded" class="panel first-time">
      <text class="panel-h">还没登录</text>
      <text class="panel-p">登录后能看卡包、扫码入场、约课。</text>
      <view class="row"><button class="btn primary" size="mini" @tap="goLogin()">去登录</button></view>
    </view>

    <view v-if="board && board.kind !== 'buy'" class="board" @tap="open(board.kind === 'voucher' ? 'wallet' : 'referral')">
      <view class="plank" />
      <view class="board-t">
        <text class="board-title">{{ board.title }}</text>
        <text class="board-text">{{ board.text }}</text>
      </view>
      <text class="btn dark">{{ board.btn }}</text>
    </view>

    <view v-else-if="board" class="panel first-time">
      <text class="panel-h">{{ firstTime ? '第一次来？' : '卡用完了' }}</text>
      <text class="panel-p">{{
        firstTime
          ? gym.features.referral ? '买一张单次票，或者让有期限卡的朋友用「老带新」带你免费来一次。' : '买一张单次票先来试试。'
          : '续一张卡就能接着来爬。'
      }}</text>
      <view class="row">
        <button class="btn primary" size="mini" @tap="open('shop')">{{ firstTime ? '买单次票' : '去续卡' }}</button>
        <button class="btn" size="mini" @tap="open('shop')">看看其他卡</button>
      </view>
    </view>

    <!-- 课表接口在任务 29，接上后显示今天还没开始的课 -->
    <template v-if="gym.features.groupClasses">
      <view class="sec-h">
        <text class="h">今日团课</text>
        <text class="link" @tap="open('classes')">课表</text>
      </view>
      <view class="panel placeholder"><text>课表还在做，先去前台问问今天的课。</text></view>
    </template>

    <!-- 活动接口在任务 35 -->
    <template v-if="gym.features.events">
      <view class="sec-h">
        <text class="h">近期活动</text>
        <text class="link" @tap="open('events')">全部</text>
      </view>
      <view class="panel placeholder"><text>活动报名还在做。</text></view>
    </template>

    <DevPanel />
  </view>
</template>

<style scoped>
.page { padding-bottom: 32px; }

.hero { position: relative; display: flex; flex-direction: column; padding: 10px 16px 22px; background: var(--brand); border-bottom: var(--stroke) solid var(--ink); overflow: hidden; }
.hero-mark { position: absolute; right: -36px; top: -18px; width: 210px; opacity: 0.17; }
.hello { position: relative; font-family: var(--font-display); font-size: 30px; line-height: 1.15; }
.hello-sub { position: relative; margin-top: 2px; min-height: 18px; font-size: 13px; opacity: 0.8; }

.scan { position: relative; margin: 16px 6px 0 4px; background: var(--ink); color: var(--surface); border-radius: var(--radius-lg); transform: skewX(-8deg); box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.28); }
.scan-down { transform: skewX(-8deg) translate(3px, 3px); box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.28); }
.scan-in { display: flex; align-items: center; padding: 16px 18px; transform: skewX(8deg); }
.scan-ic { flex: none; width: 52px; height: 52px; line-height: 52px; text-align: center; border-radius: var(--radius-md); background: var(--brand); color: var(--ink); font-size: 28px; }
.scan-t { flex: 1; display: flex; flex-direction: column; margin-left: 14px; }
.scan-title { font-family: var(--font-display); font-size: 30px; line-height: 1.1; }
.scan-hint { margin-top: 2px; font-size: 12px; opacity: 0.75; }
.arrow { font-size: 28px; }

.quick { display: flex; padding: 18px 10px 4px; }
.q { flex: 1; display: flex; flex-direction: column; align-items: center; }
.q-ic { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border: var(--stroke) solid var(--ink); border-radius: 46% 54% 40% 60% / 55% 45% 55% 45%; font-family: var(--font-display); font-size: 22px; }
.q-label { margin-top: 6px; font-size: 13px; font-weight: 600; }
.tone-brand { background: var(--brand); }
.tone-accent { background: var(--accent); }
.tone-neutral { background: var(--neutral); }
.tone-surface { background: var(--surface); }

.board { position: relative; display: flex; align-items: center; margin: 16px 16px 0; padding: 14px 14px 14px 30px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); background: var(--accent); overflow: hidden; box-shadow: 0 3px 0 var(--ink); }
.plank { position: absolute; left: 8px; top: -10px; bottom: -10px; width: 11px; background: var(--neutral); border: var(--stroke) solid var(--ink); transform: skewX(-14deg); }
.board-t { flex: 1; display: flex; flex-direction: column; margin-right: 12px; }
.board-title { font-family: var(--font-display); font-size: 22px; line-height: 1.15; }
.board-text { font-size: 12px; opacity: 0.8; }

.panel { margin: 0 16px; padding: 14px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.first-time { display: flex; flex-direction: column; margin-top: 16px; background: var(--accent-soft); }
.panel-h { font-family: var(--font-display); font-size: 22px; }
.panel-p { margin-top: 4px; font-size: 13px; color: var(--ink-muted); }
.row { display: flex; gap: 8px; margin-top: 12px; }
.placeholder { font-size: 13px; color: var(--ink-muted); }

.btn { margin: 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600; }
.btn.primary { background: var(--brand); }
.btn.dark { flex: none; padding: 6px 12px; background: var(--ink); color: var(--surface); }

.sec-h { display: flex; align-items: baseline; justify-content: space-between; margin: 22px 16px 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.link { font-size: 13px; color: var(--brand-strong); }
</style>
