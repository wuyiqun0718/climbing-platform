<script setup lang="ts">
import type { ClimbCalendar } from '@climb/api';
import { daysOfMonth, groupWallet, summarizeCards } from '@climb/core';
import { fromDateKey, monthOf, toDateKey } from '@climb/utils';
import { onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api } from '../../api';
import { iconStyle, type IconName } from '../../lib/icons';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import Button from '@climb/ui-mp/Button.vue';
import Empty from '@climb/ui-mp/Empty.vue';
import { NETWORK_ERROR } from '../../lib/errors';

// 要登录：没登录先去登录页，登录完回到这里
useRequireLogin(() => member.ensureLoaded().catch(() => {}));

const today = ref(toDateKey(new Date()));
const month = computed(() => monthOf(today.value));
/** 本月入场记录，只用来画预览和数到馆天数；哪些入场算由接口按 @climb/core 算好 */
const cal = ref<ClimbCalendar | null>(null);

async function loadCalendar() {
  const m = month.value;
  try {
    await member.ensureLoaded();
    if (!member.state.me) return;
    const res = await api.me.checkIns(m);
    if (res.month === month.value) cal.value = res;
  } catch {
    // 拉不到就不画来过的日子，统计显示 0
  }
}

onShow(() => {
  today.value = toDateKey(new Date());
  loadCalendar();
});

const me = computed(() => member.state.me);
const initial = computed(() => me.value?.name.slice(0, 1) ?? '');
const phone = computed(() => {
  const p = me.value?.phone ?? '';
  return p.length === 11 ? `${p.slice(0, 3)}****${p.slice(7)}` : p;
});
// 卡怎么算还能用、剩几次，规则在 @climb/core
const summary = computed(() => summarizeCards([...member.state.cards], today.value));
const wallet = computed(() => groupWallet([...member.state.cards], today.value));
const stats = computed(() => [
  { label: '本月到馆', value: cal.value?.month === month.value ? cal.value.days.length : 0 },
  { label: '持有卡', value: wallet.value.entry.length + wallet.value.lessons.length },
  { label: '剩余次数', value: summary.value.countLeft },
]);

const WD = ['一', '二', '三', '四', '五', '六', '日'];
const climbed = computed(() => new Set((cal.value?.month === month.value ? cal.value.days : []).map(d => d.on)));
/** 日历格子：周一开头，前面按 1 号是星期几补空 */
const cells = computed(() => {
  const days = daysOfMonth(month.value);
  const lead = (fromDateKey(days[0]).getDay() + 6) % 7;
  return [...Array<null>(lead).fill(null), ...days];
});
const calTitle = computed(() => `${Number(month.value.slice(5))} 月攀爬日历`);

const menu = computed(() => {
  const rows: { url: string; label: string; icon: IconName }[] = [];
  // 员工账号是教练的才有（Me.coach）
  if (me.value?.coach) rows.push({ url: '/pages/coach/schedule', label: '我的排班', icon: 'clock' });
  rows.push(
    { url: '/pages/me/calendar', label: '攀爬日历', icon: 'calendar' },
    { url: '/pages/me/orders', label: '订单记录', icon: 'list' },
    { url: '/pages/me/insurance', label: '保险与告知书', icon: 'shield' },
  );
  return rows.map(r => ({ ...r, style: iconStyle(r.icon) }));
});

/** 行尾箭头用图标，› 字符在字体里偏下，跟左边图标、文字对不齐 */
const chevron = iconStyle('chevron');
const go = (url: string) => uni.navigateTo({ url });
const retry = () => { member.load().catch(() => {}); loadCalendar(); };
</script>

<template>
  <view class="page">
    <Empty v-if="!member.state.loaded && member.state.failed" title="没加载出来" :text="NETWORK_ERROR">
      <Button mini @tap="retry">重试</Button>
    </Empty>
    <template v-else>
      <view v-if="me" class="head">
        <view class="avatar"><text>{{ initial }}</text></view>
        <view class="who">
          <text class="name">{{ me.name }}</text>
          <text class="phone">{{ phone }}</text>
        </view>
        <text v-if="summary.period" class="pill">{{ summary.period.card.name }}</text>
      </view>

      <view class="stats">
        <view v-for="s in stats" :key="s.label" class="stat">
          <text class="stat-n">{{ s.value }}</text>
          <text class="stat-l">{{ s.label }}</text>
        </view>
      </view>

      <view class="cal" @tap="go('/pages/me/calendar')">
        <view class="cal-h">
          <text class="cal-t">{{ calTitle }}</text>
          <view class="legend"><view class="legend-dot" /><text>来过</text></view>
        </view>
        <view class="grid">
          <text v-for="w in WD" :key="w" class="wd">{{ w }}</text>
          <view v-for="(d, i) in cells" :key="i" class="cell">
            <text v-if="d" class="dn" :class="{ on: climbed.has(d), today: d === today, future: d > today }">{{ Number(d.slice(8)) }}</text>
          </view>
        </view>
      </view>

      <view class="menu">
        <view v-for="r in menu" :key="r.url" class="item" hover-class="item-down" @tap="go(r.url)">
          <view class="item-ic" :style="r.style" />
          <text class="item-t">{{ r.label }}</text>
          <view class="item-arrow" :style="chevron" />
        </view>
      </view>
    </template>
  </view>
</template>

<style scoped>
.page { padding: 16px 16px 32px; }

.head { display: flex; align-items: center; gap: 14px; }
.avatar { flex: none; width: 56px; height: 56px; display: flex; align-items: center; justify-content: center; border: var(--stroke) solid var(--ink); border-radius: 50%; background: var(--brand); color: var(--on-brand); font-family: var(--font-display); font-size: 26px; }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.name { font-size: 18px; font-weight: 600; }
.phone { margin-top: 2px; font-family: var(--font-number); font-size: 13px; color: var(--ink-muted); }
.pill { flex: none; padding: 3px 10px; border: var(--stroke) solid var(--ink); border-radius: 99px; background: var(--brand-soft); font-size: 13px; font-weight: 600; }

.stats { display: flex; margin-top: 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); background: var(--surface); }
.stat { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 12px 0; }
.stat + .stat { border-left: 1px solid var(--line); }
.stat-n { font-family: var(--font-number); font-size: 28px; font-weight: 800; line-height: 1.1; }
.stat-l { margin-top: 2px; font-size: 12px; color: var(--ink-muted); }

.cal { margin-top: 16px; padding: 14px 12px 10px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); background: var(--surface); }
.cal-h { display: flex; align-items: center; justify-content: space-between; padding: 0 4px 8px; }
.cal-t { font-size: 15px; font-weight: 700; }
.legend { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink-muted); }
.legend-dot { width: 10px; height: 10px; border: 1px solid var(--ink); border-radius: 50%; background: var(--brand); }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); row-gap: 4px; }
.wd { padding-bottom: 4px; text-align: center; font-size: 12px; color: var(--ink-muted); }
.cell { height: 36px; display: flex; align-items: center; justify-content: center; }
.dn { width: 30px; height: 30px; line-height: 30px; text-align: center; border-radius: 50%; font-family: var(--font-number); font-size: 13px; font-weight: 600; }
.dn.on { box-sizing: border-box; line-height: 28px; border: 1px solid var(--ink); background: var(--brand); color: var(--on-brand); }
.dn.today { box-sizing: border-box; line-height: 26px; border: var(--stroke) solid var(--ink); }
.dn.future { color: var(--ink-muted); opacity: 0.6; }

.menu { margin-top: 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); background: var(--surface); overflow: hidden; }
.item { display: flex; align-items: center; height: 52px; padding: 0 16px; }
.item + .item { border-top: 1px solid var(--line); }
.item-down { background: var(--page); }
.item-ic { flex: none; width: 20px; height: 20px; margin-right: 12px; background: var(--ink); mask-size: 100% 100%; -webkit-mask-size: 100% 100%; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; }
.item-t { flex: 1; font-size: 16px; }
.item-arrow { flex: none; width: 16px; height: 16px; background: var(--ink-muted); mask-size: 100% 100%; -webkit-mask-size: 100% 100%; mask-repeat: no-repeat; -webkit-mask-repeat: no-repeat; }
</style>
