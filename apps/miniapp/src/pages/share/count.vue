<script setup lang="ts">
import { shareBlockedBy, type Share } from '@climb/core';
import MemberCard from '@climb/ui-mp/MemberCard.vue';
import { formatDot, toDateKey } from '@climb/utils';
import { onLoad, onShareAppMessage } from '@dcloudio/uni-app';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
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
const step = (d: number) => { qty.value = Math.min(remaining.value, Math.max(1, qty.value + d)); };

/** 生成好的分享；生成时次数已经从卡里扣掉 */
const share = ref<Share | null>(null);

const confirm = (title: string, content: string) => new Promise<boolean>(resolve => {
  uni.showModal({ title, content, success: r => resolve(r.confirm), fail: () => resolve(false) });
});

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
    <view v-if="member.state.loaded && !card" class="empty">没有能送给朋友的次卡</view>
    <template v-else-if="view && card">
      <MemberCard :kind="view.kind" :name="view.name" :value="view.value" :unit="view.unit" :meta="view.meta" :tone="view.tone" />

      <view v-if="share" class="box">
        <text class="h">分享已生成</text>
        <text class="p">已经从卡里扣了 {{ share.quantity }} 次，发给朋友，TA 点开就能领。</text>
        <!-- #ifdef MP-WEIXIN -->
        <button class="btn dark" open-type="share">发给微信好友</button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <text class="fine">{{ message?.title }} · {{ claimPath(share.token) }}</text>
        <button class="btn dark" @click="copyPath">复制领取路径</button>
        <!-- #endif -->
      </view>

      <view v-else-if="blockedBy" class="box"><text class="p">这张卡现在不能送：{{ codeMessage(blockedBy) }}</text></view>

      <view v-else class="box">
        <text class="p">从「{{ card.name }}」里拿出几次送给朋友。朋友在微信里点开领取后，就能在 {{ formatDot(card.expiresOn) }} 前扫码入场。</text>
        <view class="stepper">
          <button class="sbtn" :disabled="qty <= 1" @click="step(-1)">−</button>
          <text class="num">{{ qty }}<text class="unit">次</text></text>
          <button class="sbtn" :disabled="qty >= remaining" @click="step(1)">+</button>
        </view>
        <text class="fine center">送出后你的卡还剩 {{ remaining - qty }} 次</text>
        <button class="btn dark" @click="create">生成分享</button>
      </view>
    </template>
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.box { margin-top: 16px; padding: 14px 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); display: flex; flex-direction: column; gap: 10px; }
.h { font-family: var(--font-display); font-size: 20px; }
.p { font-size: 14px; line-height: 1.6; }
.fine { font-size: 12px; line-height: 1.6; color: var(--ink-muted); word-break: break-all; }
.center { text-align: center; }
.stepper { display: flex; align-items: center; justify-content: center; gap: 24px; }
.sbtn { margin: 0; width: 44px; height: 44px; line-height: 40px; padding: 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 22px; }
.num { font-family: var(--font-number); font-size: 40px; font-weight: 700; }
.unit { font-size: 14px; margin-left: 2px; }
.btn { margin: 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 14px; font-weight: 600; }
.btn.dark { background: var(--ink); color: var(--surface); }
.empty { padding: 80px 0; text-align: center; color: var(--ink-muted); }
</style>
