<script setup lang="ts">
import type { ClassSessionView } from '@climb/api';
import { sessionStartsAt, summarizeCards } from '@climb/core';
import Button from '@climb/ui-mp/Button.vue';
import { formatMonthDay, monthOf, toDateKey } from '@climb/utils';
import { onLoad, onShow } from '@dcloudio/uni-app';
import gym from '@gym';
import { computed, ref } from 'vue';
import { iconStyle } from '../../lib/icons';
import { goLogin } from '../../lib/use-login';
import DevPanel from '../../mock/dev-panel.vue';
import { startScan } from '../checkin/start-scan';
import { api } from '../../api';
import { member } from '../../stores';
import { currentStoreName, ensureStores, storePick } from '../../stores/store-pick';

// 跨天后回到首页要按新的一天算
const today = ref(toDateKey(new Date()));
// 线稿水印；没有 mark.png 的岩馆加载失败时退回 logo
const mark = ref('/static/gym/mark.png');
const markFallback = () => { mark.value = `/static/gym/${gym.logo}`; };
const scanIcon = iconStyle('scan');

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
    { key: 'shop', label: '购卡', tone: 'accent', icon: iconStyle('card'), show: true },
    { key: 'classes', label: '团课', tone: 'neutral', icon: iconStyle('calendar'), show: gym.features.groupClasses },
    // 私教、活动页面还没开放：淡一点，点了只提示一句
    { key: 'pt', label: '私教', tone: 'brand', icon: iconStyle('person'), soon: true, show: gym.features.personalTraining },
    { key: 'events', label: '活动', tone: 'surface', icon: iconStyle('flag'), soon: true, show: gym.features.events },
  ].filter(q => q.show),
);

/** 底下的大块：期限卡会员看老带新，拿着体验券的看券，没卡的引导买卡 */
const board = computed(() => {
  if (!me.value) return null;
  const s = summary.value;
  if (s.period && gym.features.referral) {
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

function open(key: string) {
  if (key === 'wallet') return uni.switchTab({ url: '/pages/cards/index' });
  if (key === 'referral') return uni.navigateTo({ url: '/pages/share/referral' });
  if (key === 'classes') return uni.navigateTo({ url: '/pages/classes/index' });
  if (key === 'shop' || key === 'shop:single') {
    return uni.navigateTo({ url: key === 'shop' ? '/pages/shop/index' : '/pages/shop/index?seg=single' });
  }
  const title = key === 'pt' ? '私教预约还没开放' : key === 'events' ? '活动报名还没开放' : '这个入口还没开放';
  uni.showToast({ title, icon: 'none' });
}

function scan() {
  if (!me.value) return goLogin().catch(e => console.warn('跳转登录页失败', e));
  startScan();
}

onLoad(() => uni.setNavigationBarTitle({ title: gym.shortName }));
/** 今日团课：当前门店今天还没开始的课 */
const todayClasses = ref<ClassSessionView[] | null>(null);
async function loadTodayClasses() {
  if (!gym.features.groupClasses) return;
  try {
    await ensureStores();
    const list = await api.classes.list({ store: storePick.currentId, from: today.value, days: 1 });
    const now = Date.now();
    todayClasses.value = list.filter(c => sessionStartsAt(c).getTime() > now).slice(0, 3);
  } catch {
    todayClasses.value = todayClasses.value ?? [];
  }
}

/** 今天入过场没有：看本月入场记录里有没有今天。没登录或拉不到就当没入过 */
const enteredToday = ref(false);
async function loadEnteredToday() {
  const day = today.value;
  try {
    await member.ensureLoaded();
    if (!member.state.me) {
      enteredToday.value = false;
      return;
    }
    const cal = await api.me.checkIns(monthOf(day));
    enteredToday.value = cal.days.some(d => d.on === day);
  } catch {
    enteredToday.value = false;
  }
}

onShow(() => {
  today.value = toDateKey(new Date());
  member.ensureLoaded().catch(() => {});
  loadTodayClasses();
  loadEnteredToday();
});
</script>

<template>
  <view class="page">
    <view class="hero">
      <image class="hero-mark" :src="mark" mode="widthFix" @error="markFallback" />
      <text class="hello">{{ hello }}</text>
      <text class="hello-sub">{{ sub }}</text>
      <!-- 今天已经入过场也能再扫，扣不扣次由确认页说明 -->
      <view class="scan" hover-class="scan-down" @tap="scan">
        <view class="scan-in">
          <view class="scan-ic"><view class="ic" :style="scanIcon" /></view>
          <view class="scan-t">
            <text class="scan-title">{{ enteredToday ? '今天已入场' : '扫码入场' }}</text>
            <text class="scan-hint">{{ enteredToday ? '再扫一次不会重复扣次' : '对准前台的二维码扫一下' }}</text>
          </view>
          <text class="arrow">›</text>
        </view>
      </view>
    </view>

    <view class="quick">
      <view v-for="q in quick" :key="q.key" class="q" :class="{ soon: q.soon }" @tap="open(q.key)">
        <view class="q-ic" :class="`tone-${q.tone}`"><view class="ic" :style="q.icon" /></view>
        <text class="q-label">{{ q.label }}</text>
      </view>
    </view>

    <view v-if="!me && member.state.loaded" class="panel first-time">
      <text class="panel-h">还没登录</text>
      <text class="panel-p">登录后能看卡包、扫码入场、约课。</text>
      <view class="row"><Button variant="primary" mini @tap="goLogin()">去登录</Button></view>
    </view>

    <view v-if="board && board.kind !== 'buy'" class="board" @tap="open(board.kind === 'voucher' ? 'wallet' : 'referral')">
      <view class="plank" />
      <view class="board-t">
        <text class="board-title">{{ board.title }}</text>
        <text class="board-text">{{ board.text }}</text>
      </view>
      <Button class="board-btn" variant="dark" mini>{{ board.btn }}</Button>
    </view>

    <view v-else-if="board" class="panel first-time">
      <text class="panel-h">{{ firstTime ? '第一次来？' : '卡用完了' }}</text>
      <text class="panel-p">{{
        firstTime
          ? gym.features.referral ? '买一张单次票，或者让有期限卡的朋友用「老带新」带你免费来一次。' : '买一张单次票先来试试。'
          : '续一张卡就能接着来爬。'
      }}</text>
      <view class="row">
        <Button variant="primary" mini @tap="open(firstTime ? 'shop:single' : 'shop')">{{ firstTime ? '买单次票' : '去续卡' }}</Button>
        <Button mini @tap="open('shop')">看看其他卡</Button>
      </view>
    </view>

    <template v-if="gym.features.groupClasses">
      <view class="sec-h">
        <text class="h">今日团课<text class="sec-sub">{{ currentStoreName() }}</text></text>
        <text class="link" @tap="open('classes')">课表</text>
      </view>
      <view v-if="todayClasses && !todayClasses.length" class="panel placeholder"><text>今天这家店没有还没开始的团课了，看看明天的。</text></view>
      <scroll-view v-if="todayClasses?.length" class="class-scroll" scroll-x>
        <view class="class-track">
          <view v-for="c in todayClasses" :key="c.id" class="class-card" @tap="open('classes')">
            <text class="class-time">{{ c.startTime }}</text>
            <text class="class-name">{{ c.name }}</text>
            <text class="class-meta">{{ c.status === 'cancelled' ? `取消了：${c.cancelReason ?? ''}` : [c.storeName, c.coachName].filter(Boolean).join(' · ') }}</text>
            <text class="class-tag">{{ c.myBooking ? (c.myBooking.status === 'waitlisted' ? `候补第 ${c.myBooking.position} 位` : '已预约') : c.left > 0 ? `剩 ${c.left} 位` : '约满' }}</text>
          </view>
        </view>
      </scroll-view>
    </template>

    <!-- 活动报名还没开放，先放空状态 -->
    <template v-if="gym.features.events">
      <view class="sec-h">
        <text class="h">近期活动</text>
        <text class="link" @tap="open('events')">全部</text>
      </view>
      <view class="panel placeholder"><text>最近没有活动。</text></view>
    </template>

    <DevPanel />
  </view>
</template>

<style scoped>
.sec-sub { margin-left: 6px; font-size: 12px; font-family: inherit; color: var(--ink-muted); }
.class-scroll { width: 100%; white-space: nowrap; }
.class-track { display: flex; gap: 10px; padding: 0 16px 4px; }
.class-card { flex: 0 0 200px; box-sizing: border-box; display: flex; flex-direction: column; padding: 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); white-space: normal; }
.class-time { font-family: var(--font-number); font-size: 18px; font-weight: 800; }
.class-name { margin-top: 2px; font-size: 15px; font-weight: 600; }
.class-meta { margin-top: 2px; font-size: 12px; color: var(--ink-muted); }
.class-tag { margin-top: 8px; font-size: 12px; font-weight: 600; }
.page { padding-bottom: 32px; }

.hero { position: relative; display: flex; flex-direction: column; padding: 10px 16px 22px; background: var(--brand); border-bottom: var(--stroke) solid var(--ink); overflow: hidden; }
.hero-mark { position: absolute; right: -36px; top: -18px; width: 210px; opacity: 0.17; }
.hello { position: relative; font-family: var(--font-display); font-size: 30px; line-height: 1.15; }
.hello-sub { position: relative; margin-top: 2px; min-height: 18px; font-size: 13px; opacity: 0.8; }

.scan { position: relative; margin: 16px 6px 0 4px; background: var(--ink); color: var(--surface); border-radius: var(--radius-lg); transform: skewX(-8deg); box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.28); }
.scan-down { transform: skewX(-8deg) translate(3px, 3px); box-shadow: 3px 3px 0 rgba(0, 0, 0, 0.28); }
.scan-in { display: flex; align-items: center; padding: 16px 18px; transform: skewX(8deg); }
.scan-ic { flex: none; width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-md); background: var(--brand); color: var(--on-brand); }
.ic { width: 22px; height: 22px; background: currentColor; mask-size: 100% 100%; -webkit-mask-size: 100% 100%; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; }
.scan-t { flex: 1; display: flex; flex-direction: column; margin-left: 14px; }
.scan-title { font-family: var(--font-display); font-size: 30px; line-height: 1.1; }
.scan-hint { margin-top: 2px; font-size: 12px; opacity: 0.75; }
.arrow { font-size: 28px; }

.quick { display: flex; padding: 18px 10px 4px; }
.q { flex: 1; display: flex; flex-direction: column; align-items: center; }
.q-ic { width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; border: var(--stroke) solid var(--ink); border-radius: 46% 54% 40% 60% / 55% 45% 55% 45%; color: var(--ink); }
.q.soon { opacity: 0.45; }
.q-label { margin-top: 6px; font-size: 13px; font-weight: 600; }
.tone-brand { background: var(--brand); color: var(--on-brand); }
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

.board-btn { flex: none; }

.sec-h { display: flex; align-items: baseline; justify-content: space-between; margin: 22px 16px 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.link { font-size: 13px; color: var(--brand-strong); }
</style>
