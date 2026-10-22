<script setup lang="ts">
import type { CoachSchedule, CoachSlotView } from '@climb/api';
import { addDays, formatMonthDay, toDateKey, weekdayOf } from '@climb/utils';
import Button from '@climb/ui-mp/Button.vue';
import Empty from '@climb/ui-mp/Empty.vue';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import { errorMessage, isRetryable, NETWORK_ERROR } from '../../lib/errors';
import LoadFailed from '../../components/LoadFailed.vue';
import AskSheet from '../../components/AskSheet.vue';
import { ask, choose, prompt } from '../../lib/ask';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

/**
 * 教练端「我的排班」：只有 Me.coach 不为 null 的人能进（接口也会拦，非教练返回 403）。
 * 能不能占格、确认、取消都由接口按 @climb/core pt.ts 判断，页面只根据格子状态给出能做的操作。
 */
const today = ref(toDateKey(new Date()));
const day = ref(today.value);
const data = ref<CoachSchedule | null>(null);
const denied = ref(false);
const busy = ref(false);

async function load() {
  try {
    error.value = '';
    data.value = await run(() => api.coach.schedule({ from: today.value, days: 7 }), { silent: true });
    denied.value = false;
  } catch (e) {
    // 只有接口明说不是教练（403）才算没权限；断网、5xx 显示重试
    if (isRetryable(e)) error.value = errorMessage(e);
    else denied.value = true;
  }
}

/** 拉失败的原因（网络、服务器）；跟「不是教练」分开 */
const error = ref('');
async function start() {
  today.value = toDateKey(new Date());
  if (day.value < today.value) day.value = today.value;
  error.value = '';
  await member.ensureLoaded().catch(() => {});
  if (!member.state.loaded) return void (error.value = NETWORK_ERROR);
  if (!member.state.me?.coach) return void (denied.value = true);
  await load();
}

useRequireLogin(start);

const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(today.value, i)));
const slots = computed(() => data.value?.days.find(d => d.on === day.value)?.slots ?? []);
/** 某天有几节会员约的私教（待确认的也算） */
const bookedOn = (on: string) => (data.value?.days.find(d => d.on === on)?.slots ?? []).filter(s => s.status === 'member' && s.booking).length;
const dayBooked = computed(() => bookedOn(day.value));
/** 信息条副标题：今天几节，下一节几点、谁 */
const todayText = computed(() => {
  const list = (data.value?.days.find(d => d.on === today.value)?.slots ?? []).filter(s => s.status === 'member' && s.booking);
  if (!list.length) return '今天没有私教';
  const next = list.find(s => !s.past);
  return `今天 ${list.length} 节私教${next ? `，下一节 ${hh(next.hour)} ${next.booking!.memberName}` : '，都上完了'}`;
});
const dayLabel = (d: string) => (d === today.value ? '今天' : d === addDays(today.value, 1) ? '明天' : weekdayOf(d));
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function slotText(s: CoachSlotView) {
  if (s.status === 'member' && s.booking) return `${s.booking.memberName}（${s.booking.status === 'pending' ? '等你确认' : '小程序约的'}，${s.booking.storeName}）`;
  if (s.status === 'offline') return `线下约的${s.mark?.note ? `：${s.mark.note}` : ''}`;
  if (s.status === 'off') return `不接课${s.mark?.note ? `：${s.mark.note}` : ''}`;
  return s.past ? '已过' : '空闲';
}


/** 格子右边写点了会怎样，空闲的格子看得出能点 */
function slotHint(s: CoachSlotView) {
  if (s.past) return '';
  if (s.status === 'free') return '点一下占上';
  if ((s.status === 'offline' || s.status === 'off') && s.mark) return '点一下取消';
  if (s.status === 'member' && s.booking?.status === 'pending') return '点一下确认';
  if (s.status === 'member' && s.booking?.status === 'booked') return '点一下取消';
  return '';
}

/** 提交中不能再点；做完重新拉一次 */
async function act(fn: () => Promise<unknown>, done: string) {
  busy.value = true;
  try {
    await run(fn, { loading: '提交中' });
    uni.showToast({ title: done, icon: 'none' });
  } catch {
    // run 已经提示过了
  } finally {
    busy.value = false;
  }
  await load();
}

async function tap(s: CoachSlotView) {
  if (busy.value || s.past) return;
  const when = `${dayLabel(s.on)} ${hh(s.hour)}`;
  if (s.status === 'free') {
    const i = await choose(`${when} 占上`, ['线下约的学员', '有事不接课']);
    if (i < 0) return;
    const kind = i === 0 ? 'offline' : 'off';
    const note = await prompt(i === 0 ? '学员名字（可以不填）' : '原因（可以不填）', i === 0 ? '比如：小王' : '比如：带队比赛');
    if (note === null) return;
    return act(() => api.coach.mark({ on: s.on, hour: s.hour, kind, note }), '占上了，会员那边约不了这个时段');
  }
  if ((s.status === 'offline' || s.status === 'off') && s.mark) {
    if (!(await ask({ title: '取消占用？', content: `${when} 会重新开放给会员约。`, confirmText: '取消占用', cancelText: '留着' }))) return;
    return act(() => api.coach.unmark(s.mark!.id), '取消了');
  }
  if (s.status === 'member' && s.booking && (s.booking.status === 'pending' || s.booking.status === 'booked')) {
    const items = s.booking.status === 'pending' ? ['确认这节课', '拒绝'] : ['取消这节课'];
    const i = await choose(`${when} ${s.booking.memberName}`, items);
    if (i < 0) return;
    if (items[i] === '确认这节课') return act(() => api.coach.confirm(s.booking!.id), '确认了');
    const reason = await prompt(`告诉${s.booking.memberName}为什么取消`, '会员能看到，课时会退回');
    if (reason === null) return;
    return act(() => api.coach.cancel(s.booking!.id, { reason }), '取消了，课时已退回');
  }
}
const goHome = () => uni.switchTab({ url: '/pages/index/index' });
</script>

<template>
  <view class="page">
    <LoadFailed v-if="error && !data" :text="error" @retry="start" />
    <Empty v-else-if="denied" title="这一页只有教练能看" text="你的账号没有绑定教练。是教练的话，找前台在后台把你设成教练。">
      <Button mini @tap="goHome">回首页</Button>
    </Empty>
    <template v-else-if="data">
      <!-- 顶部教练信息条，照原型：头像、名字、今天几节和下一节 -->
      <view class="coach">
        <view class="avatar"><text class="avatar-t">{{ data.coach.name.slice(0, 3) }}</text></view>
        <view class="who">
          <text class="h">{{ data.coach.name }} 教练</text>
          <text class="sub">{{ todayText }}</text>
        </view>
        <text class="tag">教练</text>
      </view>
      <view class="body">
        <text v-if="data.needConfirm && data.pendingCount" class="pending">有 {{ data.pendingCount }} 节等你确认</text>
        <view class="days">
          <view v-for="d in days" :key="d" class="day" :class="{ on: d === day }" role="button" :aria-pressed="d === day" :aria-label="`${dayLabel(d)} ${Number(d.slice(8))} 号`" @tap="day = d">
            <text class="dl">{{ dayLabel(d) }}</text>
            <text class="dn">{{ Number(d.slice(8)) }}</text>
          </view>
        </view>
        <view class="day-h">
          <text class="day-t">{{ dayLabel(day) }}（{{ formatMonthDay(day) }}）</text>
          <text class="day-n">{{ dayBooked ? `${dayBooked} 节` : '没有私教' }}</text>
        </view>
        <view v-for="s in slots" :key="s.hour" class="slot" :class="{ past: s.past }" :role="s.past ? undefined : 'button'" @tap="tap(s)">
          <text class="time">{{ hh(s.hour) }}</text>
          <view class="box" :class="s.status">
            <text class="what">{{ slotText(s) }}</text>
            <text v-if="slotHint(s)" class="act-hint">{{ slotHint(s) }}</text>
          </view>
        </view>
      </view>
    </template>
    <AskSheet />
  </view>
</template>

<style scoped>
.coach { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: var(--stroke) solid var(--ink); background: var(--accent-soft); }
.avatar { flex-shrink: 0; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border: var(--stroke) solid var(--ink); border-radius: 46% 54% 40% 60% / 55% 45% 55% 45%; background: var(--brand); }
.avatar-t { font-family: var(--font-number); font-size: 14px; font-weight: 700; color: var(--on-brand); }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.h { font-family: var(--font-display); font-size: 20px; line-height: 1.2; }
.sub { font-size: 13px; color: var(--ink-muted); }
.tag { flex-shrink: 0; padding: 2px 10px; border: var(--stroke) solid var(--ink); border-radius: 999px; background: var(--surface); font-size: 13px; font-weight: 600; }
.body { padding: 12px 16px 32px; }
.pending { display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600; }
.days { display: flex; gap: 6px; }
.day { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 6px 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); }
.day.on { background: var(--brand); color: var(--on-brand); }
.dl { font-size: 11px; }
.dn { font-family: var(--font-number); font-size: 16px; font-weight: 700; }
.day-h { display: flex; align-items: baseline; justify-content: space-between; margin: 18px 0 6px; }
.day-t { font-family: var(--font-display); font-size: 20px; }
.day-n { font-size: 13px; color: var(--ink-muted); }
.slot { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.slot.past { opacity: 0.5; }
.time { flex-shrink: 0; width: 48px; font-family: var(--font-number); font-size: 14px; font-weight: 700; }
.box { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 44px; box-sizing: border-box; padding: 8px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); font-size: 14px; }
.box.free { border-style: dashed; }
.box.free .what { font-weight: 600; }
.box.member { background: var(--brand-soft); }
.box.offline { background: var(--accent-soft); }
.box.off { background: var(--neutral); }
.what { flex: 1; min-width: 0; }
.act-hint { flex-shrink: 0; font-size: 12px; color: var(--ink-muted); }
</style>
