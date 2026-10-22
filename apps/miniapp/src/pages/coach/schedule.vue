<script setup lang="ts">
import type { CoachSchedule, CoachSlotView } from '@climb/api';
import { addDays, toDateKey, weekdayOf } from '@climb/utils';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
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
    data.value = await run(() => api.coach.schedule({ from: today.value, days: 7 }), { silent: true });
    denied.value = false;
  } catch {
    denied.value = true;
  }
}

useRequireLogin(async () => {
  today.value = toDateKey(new Date());
  if (day.value < today.value) day.value = today.value;
  await member.ensureLoaded().catch(() => {});
  if (!member.state.me?.coach) return void (denied.value = true);
  await load();
});

const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(today.value, i)));
const slots = computed(() => data.value?.days.find(d => d.on === day.value)?.slots ?? []);
const dayLabel = (d: string) => (d === today.value ? '今天' : d === addDays(today.value, 1) ? '明天' : weekdayOf(d));
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

function slotText(s: CoachSlotView) {
  if (s.status === 'member' && s.booking) return `${s.booking.memberName}（${s.booking.status === 'pending' ? '等你确认' : '小程序约的'}，${s.booking.storeName}）`;
  if (s.status === 'offline') return `线下约的${s.mark?.note ? `：${s.mark.note}` : ''}`;
  if (s.status === 'off') return `不接课${s.mark?.note ? `：${s.mark.note}` : ''}`;
  return s.past ? '已过' : '空闲';
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
</script>

<template>
  <view class="page">
    <view v-if="denied" class="empty">这一页只有教练能看</view>
    <template v-else-if="data">
      <view class="head">
        <text class="h">{{ data.coach.name }} 的排班</text>
        <text v-if="data.needConfirm && data.pendingCount" class="fine">有 {{ data.pendingCount }} 节等你确认</text>
        <text class="fine">点空闲的时段占上（线下约的、有事），会员那边马上约不了。</text>
      </view>
      <view class="days">
        <view v-for="d in days" :key="d" class="day" :class="{ on: d === day }" @tap="day = d">
          <text class="dl">{{ dayLabel(d) }}</text>
          <text class="dn">{{ Number(d.slice(8)) }}</text>
        </view>
      </view>
      <view v-for="s in slots" :key="s.hour" class="row" :class="[s.status, { past: s.past }]" @tap="tap(s)">
        <text class="time">{{ hh(s.hour) }}</text>
        <text class="what">{{ slotText(s) }}</text>
      </view>
    </template>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.head { display: flex; flex-direction: column; gap: 4px; }
.h { font-family: var(--font-display); font-size: 22px; }
.fine { font-size: 12px; color: var(--ink-muted); }
.days { display: flex; gap: 6px; margin: 12px 0; }
.day { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 6px 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); }
.day.on { background: var(--brand); color: var(--on-brand); }
.dl { font-size: 11px; }
.dn { font-family: var(--font-number); font-size: 16px; font-weight: 700; }
.row { display: flex; align-items: center; gap: 12px; margin-top: 6px; padding: 10px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); font-size: 14px; }
.row.free { border-style: dashed; }
.row.member { background: var(--brand-soft); }
.row.offline { background: var(--accent-soft); }
.row.off { background: var(--neutral); }
.row.past { opacity: 0.5; }
.time { font-family: var(--font-number); font-weight: 700; width: 52px; }
.what { flex: 1; }
.empty { padding: 80px 0; text-align: center; color: var(--ink-muted); }
</style>
