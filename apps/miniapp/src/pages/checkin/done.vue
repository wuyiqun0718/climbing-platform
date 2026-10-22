<script setup lang="ts">
import type { CheckInResult, ReferralWaitInfo } from '@climb/api';
import { checkInDoneView } from '@climb/core';
import Button from '@climb/ui-mp/Button.vue';
import { formatDot } from '@climb/utils';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import { errorMessage, isRetryable } from '../../lib/errors';
import { requireLogin } from '../../lib/use-login';
import { startScan } from './start-scan';
import AskSheet from '../../components/AskSheet.vue';

// 入场成功页：签到页入场后 redirectTo 过来（?id=入场记录），刷新页面也能按 id 再拉一次。
// 老带新的领取人被拦下、选了「等等再扫」时进 ?wait=1：等邀请人入场。
// 邀请人入场后的提醒是订阅消息（任务 40）；现在回到这页或点「刷新」就重新查一次。
// 文案和扣次、保单的说法按 @climb/core 的 checkInDoneView / referralWait，这里只显示。
const DONE_PAGE = 'pages/checkin/done';

const status = ref<'loading' | 'bad' | 'done' | 'wait'>('loading');
const message = ref('');
const result = ref<CheckInResult | null>(null);
const wait = ref<ReferralWaitInfo | null>(null);

const view = computed(() => {
  const r = result.value;
  return r && checkInDoneView({ reentry: r.reentry, deducted: r.deducted, cardKind: r.cardKind, policyStatus: r.policy.status });
});

/** 断网、服务器出错时能重试；记录不存在（404）就只给回首页 */
const checkInId = ref('');
const retryable = ref(false);
async function loadResult() {
  try {
    result.value = await run(() => api.checkIns.get(checkInId.value), { silent: true, loading: '加载中' });
    status.value = 'done';
  } catch (e) {
    status.value = 'bad';
    message.value = errorMessage(e);
    retryable.value = isRetryable(e);
  }
}

onLoad(async q => {
  const query = (q ?? {}) as Record<string, string | undefined>;
  if (!(await requireLogin({ route: DONE_PAGE, query }))) return;
  if (query.id) {
    checkInId.value = query.id;
    await loadResult();
  } else if (query.wait) {
    status.value = 'wait';
    await loadWait();
  } else {
    status.value = 'bad';
    message.value = '没找到这次入场记录';
  }
});

// 从后台回来（比如看到订阅消息点进来）时再查一次邀请人到了没有
onShow(() => { if (status.value === 'wait') loadWait(); });

async function loadWait() {
  try {
    wait.value = await run(() => api.checkIns.referralWait(), { silent: true });
  } catch (e) {
    uni.showToast({ title: errorMessage(e), icon: 'none' });
  }
}

const rescan = () => startScan('redirectTo');
const goHome = () => uni.switchTab({ url: '/pages/index/index' });
</script>

<template>
  <view class="page" :class="{ ok: status === 'done' && result && view }">
    <view v-if="status === 'bad'" class="panel">
      <text class="h">{{ message }}</text>
      <text v-if="retryable" class="p">入场已经办好了的话不会受影响，网络好了再看一眼结果。</text>
      <view v-if="retryable" class="act"><Button variant="primary" block @tap="loadResult">重试</Button></view>
      <view class="act"><Button :variant="retryable ? 'default' : 'primary'" block @tap="goHome">回首页</Button></view>
    </view>

    <template v-else-if="status === 'done' && result && view">
      <view class="done-hero">
        <text class="h">{{ view.title }}</text>
        <!-- 入场结果只有日期，没有几点几分 -->
        <text class="when">{{ formatDot(result.on) }}</text>
      </view>
      <view class="panel">
        <view class="row"><text class="k">门店</text><text class="v">{{ result.storeName }}</text></view>
        <view class="row"><text class="k">用的卡</text><text class="v">{{ result.cardName }}</text></view>
        <view class="row"><text class="k">扣次</text><text class="v">{{ view.deductText }}</text></view>
        <view class="row"><text class="k">当日保险</text><text class="tag">{{ view.policyText }}</text></view>
      </view>
      <text class="fine">{{ view.policyNote }}</text>
      <Button variant="dark" block @tap="goHome">完成</Button>
    </template>

    <template v-else-if="status === 'wait'">
      <view v-if="!wait" class="panel">
        <text class="h">不用等了</text>
        <text class="p">今天已经入过场，或者体验券已经用掉、过期了。</text>
        <view class="act"><Button variant="primary" block @tap="goHome">回首页</Button></view>
      </view>
      <view v-else-if="wait.inviterCheckedIn" class="panel hero">
        <text class="h">{{ wait.inviterName }} 到了</text>
        <text class="p">再扫一次前台平板上的码，就能用{{ wait.cardName }}进。</text>
        <view class="act"><Button variant="primary" block @tap="rescan">扫码入场</Button></view>
      </view>
      <view v-else class="panel">
        <text class="h">等邀请人入场</text>
        <text class="p">{{ wait.cardName }}要在 {{ wait.inviterName }} 到馆的当天用。TA 入场后会提醒你，再扫一次码就能进。</text>
        <view class="act"><Button variant="primary" block @tap="loadWait">刷新看看</Button></view>
        <view class="act"><Button block @tap="goHome">回首页</Button></view>
      </view>
    </template>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 16px 16px 40px; }
.panel { display: flex; flex-direction: column; margin-bottom: 10px; padding: 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.hero { background: var(--brand); }
/* 成功态整屏品牌色；等邀请人的几种还是白底面板 */
.page.ok { min-height: 100vh; box-sizing: border-box; padding: 32px 16px 40px; background: var(--brand); }
.done-hero { margin-bottom: 20px; }
.done-hero .h { font-size: 32px; color: var(--on-brand); }
.when { display: block; margin-top: 10px; font-family: var(--font-number); font-size: 40px; font-weight: 800; line-height: 1.1; color: var(--on-brand); }
.done-hero .p { color: var(--on-brand); opacity: 0.75; }
.page.ok .fine { color: var(--on-brand); opacity: 0.75; }
.h { display: block; font-family: var(--font-display); font-size: 24px; }
.p { display: block; margin-top: 6px; font-size: 14px; color: var(--ink-muted); }
/* 品牌底上的说明用正文色压淡，白底面板上的 .p 不变 */
.hero .p { color: var(--on-brand); opacity: 0.75; }
.row { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
.k { font-size: 14px; color: var(--ink-muted); }
.v { font-size: 15px; font-weight: 600; }
.tag { padding: 2px 8px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; }
.fine { display: block; margin-bottom: 16px; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.act { margin-top: 14px; }
</style>
