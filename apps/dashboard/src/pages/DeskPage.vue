<script setup lang="ts">
/**
 * 前台平板页（任务 37）：不带侧栏的独立路由 /desk。
 * - 还没绑定：店长以上登录后选一家自己能操作的店绑定（POST /admin/desk-devices），设备 token 存在平板上，之后员工可以退出。
 * - 绑定后全屏显示入场码（GET /desk/qr，用设备 token），门店名、倒计时（按服务器时间）；断网或拉不到时不显示旧码、提示。
 * 换码、倒计时、断网的逻辑在 deskQr.ts；离开页面停止轮询。
 * 右侧实时入场列表（任务 38）：增量轮询 GET /desk/feed（deskFeed.ts），首次入场的高亮，提醒前台讲安全须知；撤销的从列表去掉。
 */
import { ApiError } from '@climb/api';
import { errorText, UiButton } from '@climb/ui-web';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { api, deskApi, deskDevice } from '../api';
import { canDo, canSeeStore } from '../permissions';
import { session } from '../session';
import { formatDotTime } from '@climb/utils';
import { createDeskFeedPoller, type DeskFeedState } from './deskFeed';
import { createDeskQrPoller, deskQrDisplay, type DeskQrState } from './deskQr';

const bound = ref(deskDevice.get());
const state = ref<DeskQrState>({ qr: null, offsetMs: 0, error: null });
const tick = ref(Date.now());
const display = computed(() => (tick.value, deskQrDisplay(state.value, Date.now())));

const poller = createDeskQrPoller({ fetch: () => deskApi.qr(), onState: s => (state.value = { ...s }) });
const feed = ref<DeskFeedState>({ today: null, cursor: 0, items: [], error: null });
const feedPoller = createDeskFeedPoller({ fetch: since => deskApi.feed(since), onState: s => (feed.value = { ...s }) });
const METHOD_TEXT = { scan: '扫码', desk: '前台登记' } as const;
let clock: ReturnType<typeof setInterval> | null = null;

function startShowing() {
  poller.stop();
  feedPoller.stop();
  state.value = { qr: null, offsetMs: 0, error: null };
  feed.value = { today: null, cursor: 0, items: [], error: null };
  poller.start();
  feedPoller.start();
}
onMounted(() => {
  clock = setInterval(() => (tick.value = Date.now()), 250);
  if (bound.value) startShowing();
});
onBeforeUnmount(() => {
  poller.stop();
  feedPoller.stop();
  if (clock) clearInterval(clock);
});

// 绑定（只给店长以上，门店是自己能操作的）
const canBind = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'desk.bind'));
const stores = computed(() => session.state.stores.filter(st => session.state.staff && canSeeStore(session.state.staff, st.id)));
const storeId = ref('');
const bindErr = ref('');
const binding = ref(false);
async function bind() {
  if (binding.value || !storeId.value) return;
  binding.value = true;
  bindErr.value = '';
  try {
    const b = await api.deskDevices.bind({ storeId: storeId.value });
    deskDevice.set({ token: b.deviceToken, storeId: b.storeId, deviceId: b.deviceId });
    bound.value = deskDevice.get();
    startShowing();
  } catch (e) {
    bindErr.value = errorText(e, '绑定失败，请重试');
  } finally {
    binding.value = false;
  }
}
function forget() {
  poller.stop();
  feedPoller.stop();
  deskDevice.set(null);
  bound.value = null;
}
const unbound = computed(() => display.value.kind === 'unbound' || (state.value.error instanceof ApiError && state.value.error.status === 401));
</script>

<template>
  <main class="desk">
    <section v-if="!bound || unbound" class="bind">
      <h1>前台入场码</h1>
      <p v-if="unbound">这台平板已经解绑了，请重新绑定门店。</p>
      <template v-if="!session.loggedIn">
        <p>请店长先登录后台，再回到这个页面绑定门店。</p>
        <RouterLink :to="{ name: 'login', query: { redirect: '/desk' } }" class="btn">去登录</RouterLink>
      </template>
      <p v-else-if="!canBind">只有店长以上能绑定前台平板。</p>
      <form v-else class="row" @submit.prevent="bind">
        <select v-model="storeId" aria-label="门店">
          <option value="" disabled>选门店</option>
          <option v-for="st in stores" :key="st.id" :value="st.id">{{ st.name }}</option>
        </select>
        <UiButton variant="primary" type="submit" :disabled="binding || !storeId">{{ binding ? '绑定中…' : '绑定这家店' }}</UiButton>
      </form>
      <p v-if="bindErr" class="warn" role="alert">{{ bindErr }}</p>
      <UiButton variant="link" v-if="unbound" @click="forget">清掉这台平板上的绑定</UiButton>
    </section>

    <div v-else class="layout">
      <section class="show">
        <template v-if="display.kind === 'show'">
          <h1>{{ display.qr.storeName }}</h1>
          <p class="hint">微信扫码入场</p>
          <img v-if="display.qr.imageUrl" class="qr" :src="display.qr.imageUrl" alt="入场二维码" />
          <div v-else class="placeholder">
            <span>接口还没返回二维码图片，下面是{{ display.qr.kind === 'link' ? '码的内容（链接）' : '小程序码的 scene' }}</span>
            <code>{{ display.qr.content }}</code>
          </div>
          <p class="count">{{ display.secondsLeft }} 秒后换码</p>
        </template>
        <div v-else-if="display.kind === 'offline'" class="offline" role="alert">
          <h1>网络断了</h1>
          <p>入场码暂时不能用，请会员稍等，或者找前台登记。网络恢复后会自动显示新码。</p>
        </div>
        <p v-else class="hint">加载中…</p>
      </section>
      <aside class="feed" aria-live="polite">
        <h2>刚入场</h2>
        <p v-if="!feed.items.length" class="hint">今天还没人入场</p>
        <ul>
          <li v-for="r in feed.items" :key="r.id" :class="{ first: r.first }">
            <img v-if="r.avatarUrl" :src="r.avatarUrl" alt="" class="avatar" />
            <span v-else class="avatar">{{ r.memberName.slice(0, 1) || '?' }}</span>
            <span class="who">
              <strong>{{ r.memberName || '会员' }}</strong>
              <small>{{ r.cardName }} · {{ METHOD_TEXT[r.method] }}{{ r.at ? ` · ${formatDotTime(r.at).slice(-5)}` : '' }}</small>
            </span>
            <span v-if="r.first" class="tag">首次，讲安全须知</span>
          </li>
        </ul>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.desk { display: grid; min-height: 100vh; place-items: center; padding: 24px; background: var(--page); }
.layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 32px; align-items: start; width: 100%; }
.feed { align-self: start; max-height: calc(100vh - 48px); padding: 16px; overflow-y: auto; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.feed h2 { margin: 0 0 12px; font-size: 18px; }
.feed ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.feed li { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: var(--radius-sm); }
.feed li.first { background: var(--accent-soft); outline: 2px solid var(--accent); }
.avatar { display: grid; flex: none; width: 36px; height: 36px; place-items: center; object-fit: cover; font-weight: 700; background: var(--brand-soft); border-radius: 50%; }
.who { display: grid; flex: 1; min-width: 0; text-align: left; }
.who small { color: var(--ink-muted); }
.tag { flex: none; padding: 2px 8px; font-size: 12px; font-weight: 700; background: var(--accent); border-radius: var(--radius-sm); }
@media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
.bind, .show { display: grid; gap: 16px; justify-items: center; text-align: center; }
h1 { margin: 0; font-family: var(--font-display); font-size: 40px; font-weight: 400; }
.hint { margin: 0; font-size: 18px; color: var(--ink-muted); }
.qr { width: min(70vmin, 520px); height: min(70vmin, 520px); background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.placeholder { display: grid; gap: 8px; width: 100%; max-width: 320px; padding: 16px; font-size: 14px; text-align: left; overflow-wrap: anywhere; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.placeholder span { color: var(--ink-muted); }
.count { margin: 0; font-family: var(--font-number); font-size: 28px; }
.offline { max-width: 520px; padding: 32px; background: var(--accent-soft); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.row { display: flex; gap: 8px; }
.row select { padding: 6px 10px; font: inherit; }
.btn { padding: 8px 16px; font: inherit; font-weight: 600; color: var(--on-brand); text-decoration: none; background: var(--brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); }
.warn { margin: 0; padding: 8px 12px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
