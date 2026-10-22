<script setup lang="ts">
import type { MyReferrals, ReferralRecordView } from '@climb/api';
import { SHARE_STATUS_TEXT } from '@climb/core';
import { formatDot } from '@climb/utils';
import gym from '@gym';
import Button from '@climb/ui-mp/Button.vue';
import { onShareAppMessage } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import LoadFailed from '../../components/LoadFailed.vue';
import AskSheet from '../../components/AskSheet.vue';
import { ask } from '../../lib/ask';
import { codeMessage, errorMessage } from '../../lib/errors';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { claimPath, shareMessage } from './share-link';

/** 名额和能不能发都由后端按 @climb/core referralStatus 算好，页面只显示 */
const data = ref<MyReferrals | null>(null);
/** 拉失败的原因；没拉到过时整页显示重试，不留空白 */
const error = ref('');
const load = async () => {
  error.value = '';
  data.value = await run(() => api.me.referrals(), { silent: true }).catch(e => {
    error.value = errorMessage(e);
    return data.value;
  });
};
useRequireLogin(() => {
  load();
  member.ensureLoaded().catch(() => {});
});

const status = computed(() => data.value?.status);
const pending = computed(() => data.value?.records.find(r => r.state === 'pending') ?? null);
/** 刚生成或还没人领的邀请，可以（再）发给朋友 */
const toSend = ref<string | null>(null);
const sendToken = computed(() => toSend.value ?? pending.value?.token ?? null);

const confirm = (title: string, content: string) => ask({ title, content });

async function create() {
  if (!status.value || status.value.blockedBy) return;
  const ok = await confirm('发一个老带新邀请？', `这个月的名额会用掉 1 个。朋友领取后，月底前跟你同一天来就能免费入场一次。`);
  if (!ok) return;
  try {
    const share = await run(() => api.shares.createReferral(), { loading: '生成中' });
    toSend.value = share.token;
  } catch {
    // run 已经提示过了
  }
  await load();
}

const message = computed(() => sendToken.value && shareMessage({ kind: 'referral', token: sendToken.value }, member.state.me?.name ?? ''));
onShareAppMessage(() => message.value || { title: '一起来攀岩', path: '/pages/index/index' });
const copyPath = () => sendToken.value && uni.setClipboardData({ data: claimPath(sendToken.value) });

const recordText = (r: ReferralRecordView) => {
  if (r.state === 'used') return `${r.claimerName} ${formatDot(r.usedOn!)} 来过了`;
  if (r.state === 'claimed') return `${r.claimerName} 领了，${formatDot(r.expiresOn)} 前有效`;
  return SHARE_STATUS_TEXT[r.state];
};
const sameDay = gym.rules.referralRequiresInviterSameDay;
const goShop = () => uni.navigateTo({ url: '/pages/shop/index?seg=period' });
</script>

<template>
  <view class="page">
    <LoadFailed v-if="error && !data" :text="error" @retry="load" />
    <view v-if="status" class="board">
      <text class="h">老带新</text>
      <text class="p">期限卡会员每个月可以带 {{ status.perMonth }} 位新朋友免费来爬一次。{{ sameDay ? '朋友要跟你同一天来，你先扫码入场，TA 再扫码。' : '' }}体验券当月底前有效。</text>
      <!-- 没期限卡、冻结中时名额没意义，只写原因；名额用完的还显示 0/N -->
      <view v-if="status.blockedBy !== 'no-period-card' && status.blockedBy !== 'referral-card-frozen'" class="quota">
        <text class="num">{{ status.left }}<text class="unit">/ {{ status.perMonth }}</text></text>
        <text class="fine">本月还能发</text>
      </view>

      <template v-if="sendToken">
        <text class="p">邀请已生成，发给朋友，TA 点开就能领。</text>
        <!-- #ifdef MP-WEIXIN -->
        <Button variant="dark" block open-type="share">发给微信好友</Button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view>
          <text class="share-title">{{ message && message.title }}</text>
          <text class="share-path">{{ claimPath(sendToken) }}</text>
        </view>
        <Button variant="dark" block @click="copyPath">复制领取路径</Button>
        <!-- #endif -->
      </template>
      <text v-else-if="status.blockedBy" class="p warn">{{ codeMessage(status.blockedBy) }}</text>
      <Button v-if="status.blockedBy === 'no-period-card'" variant="primary" block @click="goShop">去办期限卡</Button>
      <Button v-if="!status.blockedBy" :variant="sendToken ? 'default' : 'dark'" block @click="create">发一个新邀请</Button>
    </view>

    <view v-if="data" class="box">
      <text class="h2">已发记录</text>
      <text v-if="!data.records.length" class="fine">还没发过</text>
      <view v-for="r in data.records" :key="r.token" class="row">
        <text class="date">{{ formatDot(r.createdOn) }}</text>
        <text class="state" :class="r.state">{{ recordText(r) }}</text>
      </view>
    </view>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.box { margin-top: 16px; padding: 14px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); display: flex; flex-direction: column; gap: 10px; }
.board { margin-top: 16px; padding: 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); background: var(--accent); box-shadow: 0 4px 0 var(--ink); display: flex; flex-direction: column; gap: 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.h2 { font-size: 16px; font-weight: 600; }
.p { font-size: 14px; line-height: 1.6; }
.warn { color: var(--ink-muted); }
.fine { font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.share-title { display: block; font-size: 14px; color: var(--ink); }
.share-path { display: block; margin-top: 8px; font-size: 12px; line-height: 1.5; color: var(--ink-muted); overflow-wrap: anywhere; }
.quota { display: flex; flex-direction: column; align-items: center; }
.num { font-family: var(--font-number); font-size: 40px; font-weight: 700; }
.unit { font-size: 14px; margin-left: 4px; }
.row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; padding: 6px 0; border-top: 1px solid var(--line); }
.date { font-family: var(--font-number); }
.state.expired { color: var(--ink-muted); }
</style>
