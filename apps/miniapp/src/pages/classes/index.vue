<script setup lang="ts">
import type { ClassSessionView, MyClassBooking } from '@climb/api';
import { isCardValid, type Card, type LessonCard, type RuleErrorCode } from '@climb/core';
import gym from '@gym';
import { addDays, formatMonthDay, toDateKey, weekdayOf } from '@climb/utils';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, auth, run } from '../../api';
import { codeMessage } from '../../lib/errors';
import { requireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { ensureStores, pickStore, storePick } from '../../stores/store-pick';

/**
 * 团课课表：按门店、日期看；预约、取消、我的预约。
 * 能不能约（bookBlockedBy）、能不能取消（cancelBlockedBy）、候补第几（position）都用接口按 @climb/core 算好的结果，页面不另判断。
 */
const today = ref(toDateKey(new Date()));
const days = computed(() => Array.from({ length: 7 }, (_, i) => addDays(today.value, i)));
const day = ref(today.value);
const tab = ref<'schedule' | 'mine'>('schedule');

onLoad(q => {
  if (q?.store) pickStore(q.store as string);
  if (q?.tab === 'mine') tab.value = 'mine';
});

const sessions = ref<ClassSessionView[]>([]);
const mine = ref<MyClassBooking[]>([]);
const loaded = ref(false);

async function loadSchedule() {
  sessions.value = await run(() => api.classes.list({ store: storePick.currentId, from: day.value, days: 1 })).catch(() => sessions.value);
  loaded.value = true;
}
async function loadMine() {
  if (!auth.loggedIn()) return void (mine.value = []);
  mine.value = await run(() => api.classes.mine()).catch(() => mine.value);
}
const reload = () => Promise.all([loadSchedule(), loadMine()]);

onShow(async () => {
  today.value = toDateKey(new Date());
  if (day.value < today.value) day.value = today.value;
  await auth.whenReady();
  await ensureStores().catch(() => {});
  await reload();
  member.ensureLoaded().catch(() => {});
});

const chooseStore = (id: string) => { pickStore(id); loadSchedule(); };
const chooseDay = (d: string) => { day.value = d; loadSchedule(); };

// 只用来显示「还剩几次」；能不能约看每节课的 bookBlockedBy
const classPack = computed(() => (member.state.cards as Card[]).find((c): c is LessonCard => c.kind === 'class' && isCardValid(c, today.value)));
const goBuy = () => uni.navigateTo({ url: '/pages/shop/index?seg=class' });
const dayLabel = (d: string) => (d === today.value ? '今天' : d === addDays(today.value, 1) ? '明天' : weekdayOf(d));
const endTime = (s: { startTime: string; minutes: number }) => {
  const [h, m] = s.startTime.split(':').map(Number);
  const t = h * 60 + m + s.minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** 课表右侧按钮：全部按接口返回的 myBooking / bookBlockedBy 定 */
function action(s: ClassSessionView): { label: string; kind: 'book' | 'buy' | 'cancel' | 'none'; tone: string } {
  if (s.myBooking) {
    const label = s.myBooking.status === 'waitlisted' ? `候补第 ${s.myBooking.position} 位` : '已预约';
    return { label, kind: 'cancel', tone: 'ghost' };
  }
  const b = s.bookBlockedBy;
  if (b === 'class-no-card') return { label: '买团课包', kind: 'buy', tone: '' };
  if (b === 'class-cancelled') return { label: '已取消', kind: 'none', tone: 'off' };
  if (b === 'class-started') return { label: '已开始', kind: 'none', tone: 'off' };
  if (b === 'class-full' || b === 'class-waitlist-full') return { label: '约满了', kind: 'none', tone: 'off' };
  if (b) return { label: '约不了', kind: 'none', tone: 'off' };
  return { label: s.left > 0 ? '预约' : '排候补', kind: 'book', tone: 'dark' };
}

const confirm = (title: string, content: string, confirmText = '确定') => new Promise<boolean>(resolve => {
  uni.showModal({ title, content, confirmText, success: r => resolve(r.confirm), fail: () => resolve(false) });
});

/** 正在提交的课；提交中不能再点（防连点） */
const busy = ref('');

/**
 * 一次「预约尝试」的幂等键：第一次打开某节课的确认框时生成，失败了（网络断、超时）再点同一节课还用它，
 * 后端已经约上的会原样返回，不会约两次。约成功或者换了一节课才换新的。
 */
let attempt: { sessionId: string; key: string } | null = null;
const attemptKey = (sessionId: string) => {
  if (attempt?.sessionId !== sessionId) attempt = { sessionId, key: `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` };
  return attempt.key;
};

const cancelHours = gym.rules.classRules.cancelBeforeMinutes / 60;
const cancelHint = `开课前 ${cancelHours} 小时以前可以自己取消，次数退回；之后要找前台。`;

async function book(s: ClassSessionView) {
  // 提交中（包括确认框开着）不能再点，防连点
  if (busy.value) return;
  busy.value = s.id;
  try {
    if (!(await requireLogin({ route: 'pages/classes/index', query: { store: s.storeId } }))) return;
    const waitlist = s.left <= 0;
    const content = waitlist
      ? `${s.name}已经约满，排候补不扣次；有人取消时按顺序自动补上，补上时从团课课包扣 ${s.credits} 次。`
      : `${dayLabel(s.on)} ${s.startTime}，${s.storeName}。从${classPack.value ? `「${classPack.value.name}」` : '团课课包'}扣 ${s.credits} 次。${cancelHint}`;
    const idempotencyKey = attemptKey(s.id);
    if (!(await confirm(waitlist ? '排候补？' : `约${s.name}？`, content))) return;
    const b = await member.changeCards(() => run(() => api.classes.book(s.id, { idempotencyKey }), { loading: '预约中' }));
    attempt = null;
    uni.showToast({ title: b.status === 'waitlisted' ? `已排候补第 ${b.position} 位` : '约好了', icon: 'none' });
  } catch {
    // run 已经提示过了
  } finally {
    busy.value = '';
  }
  await reload();
}

async function cancel(bookingId: string, blockedBy: RuleErrorCode | null, name: string) {
  if (busy.value) return;
  if (blockedBy) {
    // 过了截止时间：codeMessage 里会说找前台
    uni.showModal({ title: '不能自己取消', content: codeMessage(blockedBy), showCancel: false });
    return;
  }
  busy.value = bookingId;
  try {
    if (!(await confirm(`取消${name}？`, '取消后次数退回课包；空出的位置会给排候补的人。', '取消预约'))) return;
    await member.changeCards(() => run(() => api.classes.cancel(bookingId), { loading: '取消中' }));
    uni.showToast({ title: '已取消', icon: 'none' });
  } catch {
    // run 已经提示过了
  } finally {
    busy.value = '';
  }
  await reload();
}

function tap(s: ClassSessionView) {
  const a = action(s);
  if (a.kind === 'book') return book(s);
  if (a.kind === 'buy') return goBuy();
  if (a.kind === 'cancel' && s.myBooking) return cancel(s.myBooking.id, s.myBooking.cancelBlockedBy, s.name);
}

const STATUS_TEXT: Record<MyClassBooking['status'], string> = {
  booked: '已预约',
  waitlisted: '候补',
  cancelled: '已取消',
  voided: '课程取消，次数已退回',
  attended: '已上课',
  absent: '没来',
};
const bookingStatus = (b: MyClassBooking) => (b.status === 'waitlisted' ? `候补第 ${b.position} 位` : STATUS_TEXT[b.status]);
const active = computed(() => mine.value.filter(b => b.status === 'booked' || b.status === 'waitlisted'));
const history = computed(() => mine.value.filter(b => b.status !== 'booked' && b.status !== 'waitlisted'));
</script>

<template>
  <view class="page">
    <view class="segs">
      <text class="seg" :class="{ on: tab === 'schedule' }" @tap="tab = 'schedule'">课表</text>
      <text class="seg" :class="{ on: tab === 'mine' }" @tap="tab = 'mine'">我的预约{{ active.length ? ` ${active.length}` : '' }}</text>
    </view>

    <template v-if="tab === 'schedule'">
      <scroll-view scroll-x class="stores">
        <text v-for="s in storePick.stores" :key="s.id" class="chip" :class="{ on: s.id === storePick.currentId }" @tap="chooseStore(s.id)">{{ s.name }}</text>
      </scroll-view>
      <view class="days">
        <view v-for="d in days" :key="d" class="day" :class="{ on: d === day }" @tap="chooseDay(d)">
          <text class="dl">{{ dayLabel(d) }}</text>
          <text class="dn">{{ Number(d.slice(8)) }}</text>
        </view>
      </view>

      <view class="hint">
        <text v-if="classPack">你的「{{ classPack.name }}」还剩 {{ classPack.remaining }} 次，约课时自动扣。</text>
        <text v-else-if="member.state.me">还没有团课课包，<text class="link" @tap="goBuy">先买一个</text>再约。</text>
        <text v-else>登录后就能约课。</text>
        <text class="fine">{{ cancelHint }}</text>
      </view>

      <view v-if="loaded && !sessions.length" class="empty">这天没有团课，换一天看看。</view>
      <view v-for="s in sessions" :key="s.id" class="row" :class="{ off: s.status === 'cancelled' }">
        <view class="time">
          <text class="t1">{{ s.startTime }}</text>
          <text class="t2">{{ endTime(s) }}</text>
        </view>
        <view class="main">
          <text class="name">{{ s.name }}</text>
          <text class="meta">{{ s.coachName ? `${s.coachName}，` : '' }}{{ s.storeName }}</text>
          <text v-if="s.status === 'cancelled'" class="meta warn">这节取消了：{{ s.cancelReason || '馆里临时调整' }}</text>
          <text v-else class="meta">已约 {{ s.booked }}/{{ s.capacity }}{{ s.waitlisted ? `，候补 ${s.waitlisted} 人` : '' }}</text>
        </view>
        <button class="btn" :class="action(s).tone" size="mini" :disabled="action(s).kind === 'none' || busy === s.id" @tap="tap(s)">{{ action(s).label }}</button>
      </view>
    </template>

    <template v-else>
      <view v-if="!member.state.me" class="empty">登录后看你的预约</view>
      <view v-else-if="!mine.length" class="empty">还没有预约，去课表里约一节吧。</view>
      <view v-for="b in [...active, ...history]" :key="b.id" class="row" :class="{ off: !active.includes(b) }">
        <view class="time">
          <text class="t1">{{ formatMonthDay(b.session.on) }}</text>
          <text class="t2">{{ b.session.startTime }}</text>
        </view>
        <view class="main">
          <text class="name">{{ b.session.name }}</text>
          <text class="meta">{{ b.session.storeName }}{{ b.cardName ? `，${b.cardName}` : '' }}</text>
          <text class="meta">{{ bookingStatus(b) }}</text>
          <text v-if="b.status === 'booked' && b.cancelBlockedBy === 'class-cancel-too-late'" class="meta warn">已过取消时间，要取消找前台</text>
          <text v-if="b.session.status === 'cancelled'" class="meta warn">课程取消：{{ b.session.cancelReason || '馆里临时调整' }}</text>
        </view>
        <button
          v-if="active.includes(b)" class="btn ghost" size="mini" :disabled="busy === b.id"
          @tap="cancel(b.id, b.cancelBlockedBy, b.session.name)"
        >{{ b.status === 'waitlisted' ? '不排了' : '取消' }}</button>
      </view>
    </template>
  </view>
</template>

<style scoped>
.page { padding-bottom: 32px; }
.segs { display: flex; gap: 8px; padding: 10px 16px; background: var(--surface); border-bottom: var(--stroke) solid var(--ink); }
.seg { padding: 6px 12px; border-radius: var(--radius-sm); font-size: 14px; color: var(--ink-muted); }
.seg.on { background: var(--brand); color: var(--on-brand); font-weight: 600; }
.stores { white-space: nowrap; padding: 10px 16px 0; }
.chip { display: inline-block; margin-right: 8px; padding: 4px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); font-size: 13px; background: var(--surface); }
.chip.on { background: var(--ink); color: var(--surface); }
.days { display: flex; gap: 6px; padding: 10px 16px; }
.day { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 6px 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); }
.day.on { background: var(--brand); color: var(--on-brand); }
.dl { font-size: 11px; }
.dn { font-family: var(--font-number); font-size: 16px; font-weight: 700; }
.hint { display: flex; flex-direction: column; gap: 2px; padding: 0 16px 8px; font-size: 13px; line-height: 1.6; }
.fine { font-size: 12px; color: var(--ink-muted); }
.link { color: var(--brand-strong); text-decoration: underline; }
.row { display: flex; align-items: center; gap: 12px; margin: 8px 16px 0; padding: 10px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.row.off { opacity: 0.6; }
.time { display: flex; flex-direction: column; align-items: center; width: 48px; }
.t1 { font-family: var(--font-number); font-size: 16px; font-weight: 700; }
.t2 { font-size: 12px; color: var(--ink-muted); }
.main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.name { font-size: 15px; font-weight: 600; }
.meta { font-size: 12px; color: var(--ink-muted); }
.warn { color: var(--ink); }
.btn { margin: 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 13px; font-weight: 600; }
.btn.dark { background: var(--ink); color: var(--surface); }
.btn.ghost { background: var(--brand-soft); }
.btn.off { color: var(--ink-muted); }
.empty { padding: 60px 0; text-align: center; color: var(--ink-muted); }
</style>
