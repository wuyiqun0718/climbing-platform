<script setup lang="ts">
// 开发用：切换示例会员、重置 mock 数据，顺便能发分享、领分享，方便两个人的流程在一台电脑上走通。
// 只在走 mock 时显示；真后端下 mock 为 null，这个组件什么都不渲染。
import type { Card, Share } from '@climb/core';
import { computed, ref } from 'vue';
import { api, auth, mock, privacy, run } from '../api';
import { member } from '../stores';

const open = ref(false);
const cards = computed(() => member.state.cards);
/** 当前微信绑着的会员；新微信还没验证手机号时为空 */
const current = ref(mock?.currentMember() ?? '');

/** 只列登录过小程序的；青橙导入还没绑微信的老会员要走登录认领 */
const members = computed(() => (mock?.db.members ?? []).filter(m => m.openid));
const nameOf = (id: string) => members.value.find(m => m.id === id)?.name ?? id;
/** 别人发的、还没领的分享；接口里没有「列出分享」，开发面板直接看 mock 的数据 */
const claimable = ref<Share[]>([]);
const countCard = computed(() => cards.value.find(c => c.kind === 'count' && c.remaining > 0));
/** 当前会员手上还没用的体验券的邀请人；模拟 TA 入场，领取人那边刷新后就能用 */
const inviter = computed(() => {
  const v = cards.value.find(c => c.kind === 'referral' && !c.usedOn);
  return v?.kind === 'referral' ? v.fromMemberId : null;
});

function cardText(c: Card) {
  if (c.kind === 'period') return `${c.name}，${c.expiresOn} 到期`;
  if (c.kind === 'referral') return `${c.name}，${c.expiresOn} 前有效`;
  return `${c.name}，剩 ${c.remaining} / ${c.total}`;
}

function shareText(s: Share) {
  return s.kind === 'count' ? `${nameOf(s.fromMemberId)} 送的 ${s.quantity} 次` : `${nameOf(s.fromMemberId)} 的老带新邀请`;
}

async function refresh() {
  await member.ensureLoaded().catch(() => {});
  claimable.value = (mock?.db.shares ?? []).filter(s => s.status === 'pending' && s.fromMemberId !== current.value);
}

/** 出错的中文提示由 run 统一弹；成功后卡包经 store 刷新，打开的页面跟着变 */
async function act(task: () => Promise<unknown>, done: string) {
  try {
    await member.changeCards(() => run(task));
    uni.showToast({ title: done, icon: 'none' });
  } catch {
    // run 已经提示过了
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

/** 换了微信：重新登录、重新拉会员，再重开页面（要登录的页面会跳去登录页） */
async function relogin() {
  current.value = mock?.currentMember() ?? '';
  await auth.relaunch();
  member.reset().catch(() => {});
  reloadPage();
}

function switchTo(id: string) {
  if (!mock || id === current.value) return;
  mock.switchMember(id);
  relogin();
}

/** 没登录过的新微信：去卡包会跳登录页，输入老周的手机号 13800000003 能认领老卡 */
function newWx() {
  mock?.switchToNewWx();
  // 新微信也没同意过隐私指引
  privacy.clear();
  relogin();
}

function reset() {
  uni.showModal({
    title: '重置 mock 数据',
    content: '卡包、分享、入场记录都回到初始状态',
    success: r => {
      if (!r.confirm || !mock) return;
      mock.reset();
      // 重置后新微信绑的会员没了，重新登录一次
      relogin();
    },
  });
}

/** 后台上了新版告知书：本地标记跟着刷新，下次扫码要重签 */
function newWaiver() {
  if (!mock) return;
  const v = mock.publishWaiver();
  member.load().catch(() => {});
  uni.showToast({ title: `告知书换成 ${v.version}，入场前要重签`, icon: 'none' });
}

const giveOne = () => countCard.value && act(() => api.shares.createCount({ cardId: countCard.value!.id, quantity: 1 }), '送出 1 次');
const invite = () => act(() => api.shares.createReferral(), '发了一张老带新邀请');
const claim = (s: Share) => act(() => api.shares.claim(s.token), '领到了');

async function inviterCheckIn() {
  if (!mock || !inviter.value) return;
  try {
    await mock.checkInAs(inviter.value, mock.db.stores[0].id);
    uni.showToast({ title: `${nameOf(inviter.value)} 入场了`, icon: 'none' });
  } catch (e) {
    uni.showToast({ title: (e as Error).message, icon: 'none' });
  }
}
</script>

<template>
  <view v-if="mock" class="dev">
    <view v-if="open" class="panel">
      <text class="h">开发面板（mock）</text>

      <text class="label">当前身份</text>
      <view class="row">
        <text v-for="m in members" :key="m.id" class="chip" :class="{ on: m.id === current }" @click="switchTo(m.id)">{{ m.name }}</text>
        <text class="chip" :class="{ on: !current }" @click="newWx">新微信</text>
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

      <template v-if="inviter">
        <text class="label">老带新</text>
        <view class="row"><text class="chip" @click="inviterCheckIn">让 {{ nameOf(inviter) }} 入场</text></view>
      </template>

      <view class="row foot">
        <text class="chip" @click="newWaiver">告知书出新版</text>
        <text class="chip" @click="reset">重置数据</text>
      </view>
    </view>
    <text class="fab" @click="toggle">{{ open ? '收起' : current ? nameOf(current) : '没登录' }}</text>
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
