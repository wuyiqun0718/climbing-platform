<script setup lang="ts">
import type { MyInsurance } from '@climb/api';
import { POLICY_STATUS_TEXT, policyCheckInText, waiverStatusText } from '@climb/core';
import { formatDot, formatMonthDay, toDateKey } from '@climb/utils';
import { computed, ref } from 'vue';
import { api, run } from '../../api';
import { useRequireLogin } from '../../lib/use-login';

// 我的 → 保险与告知书：历次保单（每张下面是它保的那几次入场）、风险告知书签没签和签过的版本。
// 保单怎么挂入场、告知书算不算当前版由后端按 @climb/core 算好，这里只显示。
const data = ref<MyInsurance | null>(null);
const loaded = ref(false);
const expanded = ref(false);

async function load() {
  try {
    data.value = await run(() => api.me.insurance(), { loading: loaded.value ? false : '加载中' });
  } catch {
    // run 已经提示过了
  } finally {
    loaded.value = true;
  }
}

// 每次显示都重新拉：刚入场回来，保单可能从投保中变成已投保
useRequireLogin(load);

const policies = computed(() => (data.value?.policies ?? []).map(p => ({
  id: p.id,
  date: formatMonthDay(p.on),
  status: POLICY_STATUS_TEXT[p.status],
  off: p.status === 'refund_pending' || p.status === 'refunded' || p.status === 'failed',
  entries: p.checkIns.map(c => ({ id: c.id, text: `${c.storeName} · ${c.cardName}`, how: policyCheckInText(c) })),
})));

const waiver = computed(() => {
  const w = data.value?.waiver;
  return w && {
    current: w.current,
    status: waiverStatusText(w),
    signed: w.signed.map(s => ({ id: s.id, text: `${s.version.title}（${s.version.version}）`, at: formatDot(toDateKey(new Date(s.signedAt))), current: s.current })),
  };
});
</script>

<template>
  <view class="page">
    <template v-if="waiver">
      <text class="label">风险告知书</text>
      <view class="panel">
        <view class="row"><text class="k">现在这一版</text><text class="v">{{ waiver.status }}</text></view>
        <view v-for="s in waiver.signed" :key="s.id" class="row">
          <text class="k">{{ s.text }}{{ s.current ? '' : '（旧版）' }}</text><text class="v">{{ s.at }} 签</text>
        </view>
        <template v-if="waiver.current">
          <text class="toggle" @tap="expanded = !expanded">{{ expanded ? '收起' : '告知书内容' }}</text>
          <view v-if="expanded" class="points">
            <text v-for="(p, i) in waiver.current.points" :key="i" class="point">{{ i + 1 }}. {{ p }}</text>
            <text class="fine">版本 {{ waiver.current.version }}</text>
          </view>
        </template>
      </view>
    </template>

    <text class="label">当日保险</text>
    <text class="fine">每次扫码入场自动投当天的保险，期限卡、次卡、单次票、体验券都含，不用另外付钱。同一天再进用的是同一张。</text>
    <view v-for="p in policies" :key="p.id" class="panel">
      <view class="row"><text class="name">{{ p.date }}</text><text class="tag" :class="{ off: p.off }">{{ p.status }}</text></view>
      <view v-for="e in p.entries" :key="e.id" class="row">
        <text class="k">{{ e.text }}</text><text class="k">{{ e.how }}</text>
      </view>
    </view>
    <view v-if="loaded && !policies.length" class="empty">还没有保单，扫码入场后这里会有记录</view>
  </view>
</template>

<style scoped>
.page { padding: 12px 16px 32px; }
.label { display: block; margin: 12px 0 8px; font-size: 13px; font-weight: 600; color: var(--ink-muted); }
.panel { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; padding: 14px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.name { font-size: 16px; font-weight: 600; }
.k { font-size: 13px; color: var(--ink-muted); }
.v { font-size: 14px; font-weight: 600; }
.tag { padding: 2px 8px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; }
.tag.off { color: var(--ink-muted); }
.toggle { font-size: 12px; color: var(--ink-muted); text-decoration: underline; }
.points { display: flex; flex-direction: column; gap: 6px; }
.point { font-size: 13px; line-height: 1.6; }
.fine { display: block; margin-bottom: 10px; font-size: 12px; line-height: 1.6; color: var(--ink-muted); }
.empty { padding: 40px 0; text-align: center; color: var(--ink-muted); }
</style>
