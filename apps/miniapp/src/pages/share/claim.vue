<script setup lang="ts">
import type { ShareView } from '@climb/api';
import { SHARE_STATUS_TEXT } from '@climb/core';
import { formatDot } from '@climb/utils';
import gym from '@gym';
import Button from '@climb/ui-mp/Button.vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, auth, run } from '../../api';
import LoadFailed from '../../components/LoadFailed.vue';
import { codeMessage, errorMessage, isRetryable } from '../../lib/errors';
import { requireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { CLAIM_PAGE } from './share-link';

const token = ref('');
onLoad(q => { token.value = (q?.t as string | undefined) ?? ''; });

/** 没登录也能看；能不能领由后端按 @climb/core claimBlockedBy 算好，领的时候还会再校验一遍 */
const share = ref<ShareView | null>(null);
const failed = ref(false);
/** 网络、服务器出错：可以重试，跟「链接不对」分开 */
const error = ref('');
async function load() {
  if (!token.value) return void (failed.value = true);
  error.value = '';
  try {
    await auth.whenReady();
    share.value = await run(() => api.shares.get(token.value), { silent: true });
    failed.value = false;
  } catch (e) {
    if (share.value) return;
    if (isRetryable(e)) error.value = errorMessage(e);
    else failed.value = true;
  }
}
// 登录完回到这里会再走一次 onShow，按登录后的身份重新查
onShow(() => { load(); });

const title = computed(() => {
  const s = share.value;
  if (!s) return '';
  return s.kind === 'count' ? `${s.fromName} 送你 ${s.quantity} 次攀岩入场` : `${s.fromName} 邀请你免费来爬一次`;
});
const hint = computed(() => {
  const s = share.value;
  if (!s) return '';
  if (s.kind === 'count') return `领到后是一张「好友送的次卡」，${formatDot(s.expiresOn)} 前在 ${gym.shortName} 任意一家店扫码入场。`;
  const sameDay = gym.rules.referralRequiresInviterSameDay ? `要跟 ${s.fromName} 同一天来，TA 先扫码入场，你再扫码。` : '';
  return `领到后是一张「老带新体验券」，${formatDot(s.expiresOn)} 前能免费入场一次。${sameDay}`;
});

/** 朋友打开、还能领的那一态，用大卡显示 */
const claimable = computed(() => {
  const s = share.value;
  return !!s && !s.mine && !s.blockedBy && !s.claimedByMe;
});
const avatar = computed(() => share.value?.fromName.slice(0, 1) ?? '');

const justClaimed = ref(false);
async function claim() {
  if (!share.value || share.value.blockedBy) return;
  if (!(await requireLogin({ route: CLAIM_PAGE.slice(1), query: { t: token.value } }))) return;
  try {
    const res = await member.changeCards(() => run(() => api.shares.claim(token.value), { loading: '领取中' }));
    share.value = res.share;
    justClaimed.value = true;
  } catch {
    // run 已经提示过了；刷新一下看最新状态（可能刚被别人领走）
    await load();
  }
}

const goWallet = () => uni.switchTab({ url: '/pages/cards/index' });
const goHome = () => uni.switchTab({ url: '/pages/index/index' });
</script>

<template>
  <view class="page">
    <LoadFailed v-if="error && !share" :text="error" @retry="load" />
    <view v-else-if="failed" class="box bad">
      <text class="p">这个分享打不开，可能链接不完整，让朋友重新发一次。</text>
      <Button block @click="goHome">去首页</Button>
    </view>

    <template v-else-if="share && claimable">
      <view class="gift">
        <view class="from">
          <text class="avatar">{{ avatar }}</text>
          <text class="from-name">{{ share.kind === 'count' ? `${share.fromName} 送你` : `${share.fromName} 邀请你` }}</text>
        </view>
        <view v-if="share.kind === 'count'" class="big">
          <text class="num">{{ share.quantity }}</text><text class="unit">次攀岩</text>
        </view>
        <text v-else class="big-h">免费来爬一次</text>
        <text class="until">{{ formatDot(share.expiresOn) }} 前有效</text>
        <image class="mark" src="/static/gym/mark.png" mode="widthFix" />
      </view>
      <text class="p hint">{{ hint }}</text>
      <view class="foot">
        <Button variant="primary" block @click="claim">{{ auth.loggedIn() ? '领取到我的卡包' : '登录后领取' }}</Button>
      </view>
    </template>

    <view v-else-if="share" class="box">
      <view class="head">
        <text class="h">{{ title }}</text>
        <text class="chip" :class="share.display">{{ SHARE_STATUS_TEXT[share.display] }}</text>
      </view>
      <text class="p">{{ hint }}</text>

      <template v-if="share.claimedByMe">
        <text class="p strong">{{ justClaimed ? '领到了，已经放进你的卡包' : '你已经领过了，在卡包里' }}</text>
        <Button variant="dark" block @click="goWallet">去卡包看看</Button>
      </template>
      <template v-else-if="share.mine">
        <text class="p strong">这是你自己发出的，发给朋友让 TA 来领</text>
        <Button block @click="goHome">去首页</Button>
      </template>
      <template v-else-if="share.blockedBy">
        <text class="p strong">{{ codeMessage(share.blockedBy) }}</text>
        <Button block @click="goHome">去首页</Button>
      </template>
    </view>
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 96px; }
.box { margin-top: 16px; padding: 14px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.h { font-family: var(--font-display); font-size: 20px; }
.chip { flex-shrink: 0; font-size: 12px; padding: 2px 8px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--brand-soft); }
.chip.expired, .chip.returned, .chip.used { background: var(--surface); color: var(--ink-muted); }
.p { font-size: 14px; line-height: 1.6; }
.strong { font-weight: 600; }
.box.bad { margin-top: 48px; }

.gift { position: relative; overflow: hidden; margin-top: 16px; padding: 20px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); background: var(--accent); box-shadow: 0 4px 0 var(--ink); }
.from { display: flex; align-items: center; gap: 10px; }
.avatar { width: 36px; height: 36px; line-height: 36px; border-radius: 50%; text-align: center; background: var(--brand); color: var(--on-brand); font-weight: 700; }
.from-name { font-size: 15px; font-weight: 600; }
.big { display: flex; align-items: baseline; gap: 4px; margin-top: 18px; }
.num { font-family: var(--font-number); font-size: 48px; font-weight: 800; line-height: 1; }
.unit { font-size: 16px; font-weight: 600; }
.big-h { display: block; margin-top: 18px; font-family: var(--font-display); font-size: 28px; }
.until { display: block; margin-top: 8px; font-size: 13px; color: var(--ink-muted); }
.mark { position: absolute; right: 8px; bottom: 8px; width: 96px; opacity: 0.15; pointer-events: none; }
.hint { display: block; margin-top: 14px; color: var(--ink-muted); }
.foot { position: fixed; left: 16px; right: 16px; bottom: 24px; }
</style>
