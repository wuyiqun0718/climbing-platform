<script setup lang="ts">
import type { ClimbCalendar } from '@climb/api';
import { daysOfMonth, shiftMonth, type MonthKey } from '@climb/core';
import Empty from '@climb/ui-mp/Empty.vue';
import { fromDateKey, monthOf, toDateKey } from '@climb/utils';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import { useRequireLogin } from '../../lib/use-login';

/** 攀爬日历：按月看哪天来过、去了哪家店。哪些入场算、同一天怎么合并都由接口按 @climb/core climbCalendar 算 */
// 月份用本地日期算（toDateKey 是本地时间），不用 toISOString 截取，免得月初月末差一天
const thisMonth = ref<MonthKey>(monthOf(toDateKey(new Date())));
const month = ref<MonthKey>(thisMonth.value);
const data = ref<ClimbCalendar | null>(null);

async function load() {
  const m = month.value;
  const res = await run(() => api.me.checkIns(m)).catch(() => null);
  // 翻得快时只认最后一次
  if (res && res.month === month.value) data.value = res;
}

useRequireLogin(() => {
  thisMonth.value = monthOf(toDateKey(new Date()));
  load();
});

const go = (n: number) => {
  const next = shiftMonth(month.value, n);
  if (next > thisMonth.value) return;
  month.value = next;
  load();
};

const today = toDateKey(new Date());
const byDay = computed(() => new Map((data.value?.month === month.value ? data.value.days : []).map(d => [d.on, d])));
/** 周一开头，和「我的」里的预览一致 */
const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日'];
/** 日历格子：前面按 1 号是星期几补空 */
const cells = computed(() => {
  const days = daysOfMonth(month.value);
  const lead = (fromDateKey(days[0]).getDay() + 6) % 7;
  return [...Array<null>(lead).fill(null), ...days];
});
const title = computed(() => `${Number(month.value.slice(0, 4))} 年 ${Number(month.value.slice(5))} 月`);
const climbed = computed(() => [...byDay.value.values()]);
</script>

<template>
  <view class="page">
    <view class="nav">
      <text class="arrow" @tap="go(-1)">‹</text>
      <text class="title">{{ title }}</text>
      <text class="arrow" :class="{ off: month >= thisMonth }" @tap="go(1)">›</text>
    </view>
    <text class="sum">这个月来了 {{ climbed.length }} 天</text>

    <view class="grid">
      <text v-for="w in WEEK_HEAD" :key="w" class="wd">{{ w }}</text>
      <view v-for="(d, i) in cells" :key="i" class="cell" :class="{ on: d && byDay.has(d), today: d === today }">
        <template v-if="d">
          <text class="dn">{{ Number(d.slice(8)) }}</text>
          <text v-if="byDay.has(d)" class="dot">{{ byDay.get(d)!.stores.length > 1 ? `${byDay.get(d)!.stores.length}店` : '●' }}</text>
        </template>
      </view>
    </view>

    <view v-for="d in climbed" :key="d.on" class="row">
      <text class="date">{{ Number(d.on.slice(5, 7)) }}月{{ Number(d.on.slice(8)) }}日</text>
      <text class="stores">{{ d.stores.map(s => s.name).join('、') }}</text>
    </view>
    <Empty v-if="data && !climbed.length" title="这个月还没来过" />
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.nav { display: flex; align-items: center; justify-content: space-between; }
.arrow { padding: 4px 16px; font-size: 24px; }
.arrow.off { color: var(--ink-muted); opacity: 0.4; }
.title { font-family: var(--font-display); font-size: 20px; }
.sum { display: block; margin: 4px 0 10px; text-align: center; font-size: 13px; color: var(--ink-muted); }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; padding: 10px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.wd { text-align: center; font-size: 12px; color: var(--ink-muted); }
.cell { height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; border-radius: var(--radius-sm); }
.cell.on { background: var(--brand); color: var(--on-brand); }
.cell.today { outline: 2px solid var(--ink); }
.dn { font-family: var(--font-number); font-size: 15px; font-weight: 600; }
.dot { font-size: 9px; line-height: 1; }
.row { display: flex; justify-content: space-between; margin-top: 8px; padding: 10px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); font-size: 14px; }
.date { font-family: var(--font-number); font-weight: 600; }
.stores { color: var(--ink-muted); }
</style>
