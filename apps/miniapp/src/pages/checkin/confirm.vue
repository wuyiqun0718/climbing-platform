<script setup lang="ts">
import type { CheckInPreview } from '@climb/api';
import { onLoad } from '@dcloudio/uni-app';
import gym from '@gym';
import { ref } from 'vue';
import { api, run } from '../../api';
import { errorMessage } from '../../lib/errors';
import { requireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { CHECKIN_PAGE, fromPageQuery, NOT_OURS_MESSAGE } from './scan';
import { startScan } from './start-scan';

// 签到页：微信扫前台的码直接打开，或者小程序里扫码后跳过来。
// 这里先解析码、确认登录、预览（验码，不作废）；选卡、保险、确认入场在任务 19。
const status = ref<'loading' | 'bad' | 'ready'>('loading');
const message = ref('');
const preview = ref<CheckInPreview | null>(null);

onLoad(async q => {
  const r = fromPageQuery(gym.entryQrLink, (q ?? {}) as Record<string, string | undefined>);
  if (!r.ok) {
    status.value = 'bad';
    message.value = r.reason === 'none' ? '没扫到码，对准前台平板上的码扫一下' : NOT_OURS_MESSAGE;
    return;
  }
  // 没登录：登录页替换掉这一页，登录完带着解析好的码回来
  if (!(await requireLogin({ route: CHECKIN_PAGE, query: { s: r.qr.storeId, t: r.qr.qrToken } }))) return;
  member.ensureLoaded().catch(() => {});
  try {
    preview.value = await run(() => api.checkIns.preview(r.qr), { silent: true });
    status.value = 'ready';
    uni.setNavigationBarTitle({ title: preview.value.store.name });
  } catch (e) {
    // 码过期、用过、不是本馆的：后端的原因翻成中文，让会员重新扫
    status.value = 'bad';
    message.value = errorMessage(e);
  }
});

const rescan = () => startScan('redirectTo');
</script>

<template>
  <view class="page">
    <view v-if="status === 'bad'" class="panel">
      <text class="h">没法入场</text>
      <text class="p">{{ message }}</text>
      <button class="btn primary" @tap="rescan">重新扫码</button>
    </view>

    <view v-else-if="status === 'ready' && preview" class="panel">
      <text class="h">{{ preview.store.name }}</text>
      <text v-if="preview.reentry" class="p">今天已经入过场了，这次不扣次</text>
      <text class="p">能用的卡 {{ preview.options.filter(o => o.usable).length }} 张</text>
      <!-- 选卡、当日保险、确认入场：任务 19 -->
    </view>
  </view>
</template>

<style scoped>
.page { padding: 16px; }
.panel { display: flex; flex-direction: column; padding: 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.h { font-family: var(--font-display); font-size: 24px; }
.p { margin-top: 6px; font-size: 14px; color: var(--ink-muted); }
.btn { margin: 14px 0 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 15px; font-weight: 600; }
.btn.primary { background: var(--brand); }
</style>
