<script setup lang="ts">
// 开发用：切换示例会员、重置 mock 数据，顺便能发分享、领分享，方便两个人的流程在一台电脑上走通。
// 只在走 mock 时显示；真后端下 mock 为 null，这个组件什么都不渲染。
import { ApiError } from '@climb/api';
import type { Card, Share } from '@climb/core';
import { computed, ref } from 'vue';
import { api, mock } from '../api';

const open = ref(false);
const cards = ref<Card[]>([]);
const current = ref(mock?.currentMember() ?? '');

const members = computed(() => mock?.db.members ?? []);
const nameOf = (id: string) => members.value.find(m => m.id === id)?.name ?? id;
/** 别人发的、还没领的分享；接口里没有「列出分享」，开发面板直接看 mock 的数据 */
const claimable = ref<Share[]>([]);
const countCard = computed(() => cards.value.find(c => c.kind === 'count' && c.remaining > 0));

function cardText(c: Card) {
  if (c.kind === 'period') return `${c.name}，${c.expiresOn} 到期`;
  if (c.kind === 'referral') return `${c.name}，${c.expiresOn} 前有效`;
  return `${c.name}，剩 ${c.remaining} / ${c.total}`;
}

function shareText(s: Share) {
  return s.kind === 'count' ? `${nameOf(s.fromMemberId)} 送的 ${s.quantity} 次` : `${nameOf(s.fromMemberId)} 的老带新邀请`;
}

async function refresh() {
  cards.value = await api.me.cards();
  claimable.value = (mock?.db.shares ?? []).filter(s => s.status === 'pending' && s.fromMemberId !== current.value);
}

async function run(task: () => Promise<unknown>, done: string) {
  try {
    await task();
    uni.showToast({ title: done, icon: 'none' });
  } catch (e) {
    const msg = e instanceof ApiError ? (e.data as { message?: string })?.message : String(e);
    uni.showToast({ title: msg || '出错了', icon: 'none' });
  }
  await refresh();
}

/** 换了身份或数据，重开当前页面，让页面重新拉数据 */
function reloadPage() {
  const pages = getCurrentPages();
  const route = pages[pages.length - 1]?.route;
  uni.reLaunch({ url: route ? `/${route}` : '/pages/index/index' });
}

function toggle() {
  open.value = !open.value;
  if (open.value) refresh();
}

function switchTo(id: string) {
  if (!mock || id === current.value) return;
  mock.switchMember(id);
  current.value = id;
  reloadPage();
}

function reset() {
  uni.showModal({
    title: '重置 mock 数据',
    content: '卡包、分享、入场记录都回到初始状态',
    success: r => {
      if (!r.confirm || !mock) return;
      mock.reset();
      reloadPage();
    },
  });
}

const giveOne = () => countCard.value && run(() => api.shares.createCount({ cardId: countCard.value!.id, quantity: 1 }), '送出 1 次');
const invite = () => run(() => api.shares.createReferral(), '发了一张老带新邀请');
const claim = (s: Share) => run(() => api.shares.claim(s.id), '领到了');
</script>

<template>
  <view v-if="mock" class="dev">
    <view v-if="open" class="panel">
      <text class="h">开发面板（mock）</text>

      <text class="label">当前身份</text>
      <view class="row">
        <text v-for="m in members" :key="m.id" class="chip" :class="{ on: m.id === current }" @click="switchTo(m.id)">{{ m.name }}</text>
      </view>

      <text class="label">卡包</text>
      <text v-for="c in cards" :key="c.id" class="line">{{ cardText(c) }}</text>
      <text v-if="!cards.length" class="line muted">还没有卡</text>

      <text class="label">发分享</text>
      <view class="row">
        <text class="chip" :class="{ off: !countCard }" @click="giveOne">次卡送 1 次</text>
        <text class="chip" @click="invite">老带新邀请</text>
      </view>

      <text class="label">可以领的分享</text>
      <view v-for="s in claimable" :key="s.id" class="row between">
        <text class="line">{{ shareText(s) }}</text>
        <text class="chip" @click="claim(s)">领取</text>
      </view>
      <text v-if="!claimable.length" class="line muted">没有</text>

      <view class="row foot">
        <text class="chip" @click="reset">重置数据</text>
      </view>
    </view>
    <text class="fab" @click="toggle">{{ open ? '收起' : nameOf(current) }}</text>
  </view>
</template>

<style scoped>
.dev { position: fixed; right: 12px; bottom: 24px; z-index: 999; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.panel { width: 280px; max-height: 70vh; overflow-y: auto; padding: 12px; background: var(--surface); color: var(--ink); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 6px; }
.h { font-weight: 700; font-size: 15px; }
.label { margin-top: 6px; font-size: 12px; color: var(--ink-muted); }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.between { justify-content: space-between; flex-wrap: nowrap; }
.foot { margin-top: 10px; }
.line { font-size: 13px; }
.muted { color: var(--ink-muted); }
.chip { padding: 4px 10px; font-size: 13px; border: var(--stroke) solid var(--ink); border-radius: 999px; }
.chip.on { background: var(--brand); color: var(--on-brand); }
.chip.off { opacity: 0.4; }
.fab { padding: 8px 14px; font-size: 13px; background: var(--ink); color: var(--page); border-radius: 999px; }
</style>
