<script setup lang="ts">
import type { ShareView } from '@climb/api';
import { SHARE_STATUS_TEXT } from '@climb/core';
import { formatDot } from '@climb/utils';
import gym from '@gym';
import Button from '@climb/ui-mp/Button.vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, auth, run } from '../../api';
import { codeMessage } from '../../lib/errors';
import { requireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { CLAIM_PAGE } from './share-link';

const token = ref('');
onLoad(q => { token.value = (q?.t as string | undefined) ?? ''; });

/** 没登录也能看；能不能领由后端按 @climb/core claimBlockedBy 算好，领的时候还会再校验一遍 */
const share = ref<ShareView | null>(null);
const failed = ref(false);
async function load() {
  if (!token.value) return void (failed.value = true);
  await auth.whenReady();
  try {
    share.value = await run(() => api.shares.get(token.value));
  } catch {
    failed.value = !share.value;
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
  if (s.kind === 'count') return `领到后是一张「好友送的次卡」，${formatDot(s.expiresOn)} 前在${gym.shortName}任意一家店扫码入场。`;
  const sameDay = gym.rules.referralRequiresInviterSameDay ? `要跟 ${s.fromName} 同一天来，TA 先扫码入场，你再扫码。` : '';
  return `领到后是一张「老带新体验券」，${formatDot(s.expiresOn)} 前能免费入场一次。${sameDay}`;
});

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
    <view v-if="failed" class="box">
      <text class="p">这个分享打不开，可能链接不完整，让朋友重新发一次。</text>
      <Button block @click="goHome">去首页</Button>
    </view>

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
      <Button v-else variant="dark" block @click="claim">{{ auth.loggedIn() ? '领取' : '登录后领取' }}</Button>
    </view>
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.box { margin-top: 16px; padding: 14px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); display: flex; flex-direction: column; gap: 10px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.h { font-family: var(--font-display); font-size: 20px; }
.chip { flex-shrink: 0; font-size: 12px; padding: 2px 8px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--brand-soft); }
.chip.expired, .chip.returned, .chip.used { background: var(--surface); color: var(--ink-muted); }
.p { font-size: 14px; line-height: 1.6; }
.strong { font-weight: 600; }
</style>
