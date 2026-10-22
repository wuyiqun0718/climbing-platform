<script setup lang="ts">
import { shareBlockedBy, type Share } from '@climb/core';
import Button from '@climb/ui-mp/Button.vue';
import Stepper from '@climb/ui-mp/Stepper.vue';
import Empty from '@climb/ui-mp/Empty.vue';
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import { formatDot, toDateKey } from '@climb/utils';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import AskSheet from '../../components/AskSheet.vue';
import { ask } from '../../lib/ask';
import { cardView } from '../../lib/card-view';
import { codeMessage } from '../../lib/errors';
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';
import { claimPath, shareMessage } from './share-link';

const cardId = ref('');
onLoad(q => { cardId.value = (q?.id as string | undefined) ?? ''; });

const today = ref(toDateKey(new Date()));
useRequireLogin(async () => {
  today.value = toDateKey(new Date());
  await member.ensureLoaded().catch(() => {});
});

// 没带卡 id 时用第一张能送的次卡
const card = computed(() => (cardId.value
  ? member.state.cards.find(c => c.id === cardId.value)
  : member.state.cards.find(c => !shareBlockedBy(c, today.value))));
const view = computed(() => card.value && cardView(card.value, today.value, false));
// 能不能送由 @climb/core 判断，后端还会再校验一遍
const blockedBy = computed(() => (card.value ? shareBlockedBy(card.value, today.value) : null));
const remaining = computed(() => (card.value?.kind === 'count' ? card.value.remaining : 0));

const qty = ref(1);

/** 生成好的分享；生成时次数已经从卡里扣掉 */
const share = ref<Share | null>(null);

const confirm = (title: string, content: string) => ask({ title, content });

async function create() {
  const c = card.value;
  if (!c || blockedBy.value) return;
  const ok = await confirm(`送出 ${qty.value} 次？`, `这 ${qty.value} 次马上从「${c.name}」里扣掉，朋友领取后在 ${formatDot(c.expiresOn)} 前能用。`);
  if (!ok) return;
  try {
    share.value = await member.changeCards(() => run(() => api.shares.createCount({ cardId: c.id, quantity: qty.value }), { loading: '生成中' }));
  } catch {
    // run 已经提示过了
  }
}

const message = computed(() => share.value && shareMessage(share.value, member.state.me?.name ?? ''));

// 点「发给微信好友」（button open-type="share"）或右上角转发时调用
onShareAppMessage(() => message.value ?? { title: '一起来攀岩', path: '/pages/index/index' });

// H5 没有微信转发，开发时把领取路径复制出来
const copyPath = () => share.value && uni.setClipboardData({ data: claimPath(share.value.token) });
</script>

<template>
  <view class="page">
    <Empty v-if="member.state.loaded && !card" title="没有能送给朋友的次卡" />
    <template v-else-if="view && card">
      <MemberCard :kind="view.kind" :name="view.name" :value="view.value" :unit="view.unit" :meta="view.meta" :tone="view.tone" :progress="view.progress" />

      <view v-if="share" class="box">
        <text class="h">分享已生成</text>
        <text class="p">已经从卡里扣了 {{ share.quantity }} 次，发给朋友，TA 点开就能领。</text>
        <!-- #ifdef MP-WEIXIN -->
        <Button variant="dark" block open-type="share">发给微信好友</Button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view>
          <text class="share-title">{{ message?.title }}</text>
          <text class="share-path">{{ claimPath(share.token) }}</text>
        </view>
        <Button variant="dark" block @click="copyPath">复制领取路径</Button>
        <!-- #endif -->
      </view>

      <view v-else-if="blockedBy" class="box"><text class="p">这张卡现在不能送：{{ codeMessage(blockedBy) }}</text></view>

      <view v-else class="box">
        <text class="p">从「{{ card.name }}」里拿出几次送给朋友。朋友在微信里点开领取后，就能在 {{ formatDot(card.expiresOn) }} 前扫码入场。</text>
        <Stepper v-model="qty" :min="1" :max="remaining" unit="次" size="lg" />
        <text class="fine center">送出后你的卡还剩 {{ remaining - qty }} 次</text>
        <Button variant="dark" block @click="create">生成分享</Button>
      </view>
    </template>
    <AskSheet />
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.box { margin-top: 16px; padding: 14px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); display: flex; flex-direction: column; gap: 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.p { font-size: 14px; line-height: 1.6; }
.fine { font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.share-title { display: block; font-size: 14px; color: var(--ink); }
.share-path { display: block; margin-top: 8px; font-size: 12px; line-height: 1.5; color: var(--ink-muted); overflow-wrap: anywhere; }
.center { text-align: center; }
</style>
