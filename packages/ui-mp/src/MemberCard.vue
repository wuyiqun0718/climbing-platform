<script setup lang="ts">
/** 卡包里的一张卡：期限卡、次卡、课时都用它，靠 tone 区分底色 */
withDefaults(defineProps<{
  kind: string;
  name: string;
  value: number | string;
  unit?: string;
  meta?: string;
  tone?: 'brand' | 'accent' | 'neutral' | 'surface';
  /** 还剩多少，0 到 1；比例由调用方算好，不传不画进度条 */
  progress?: number;
}>(), { tone: 'brand' });
</script>

<template>
  <view class="mcard" :class="`tone-${tone}`">
    <text class="kind">{{ kind }}</text>
    <text class="name">{{ name }}</text>
    <view class="num">
      <text class="big">{{ value }}</text>
      <text v-if="unit" class="unit">{{ unit }}</text>
    </view>
    <text v-if="meta" class="meta">{{ meta }}</text>
    <view v-if="progress !== undefined" class="bar">
      <view class="track" />
      <view class="fill" :style="{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }" />
    </view>
    <image class="mark" src="/static/gym/mark.png" mode="widthFix" />
    <!-- 按钮等盖在水印上面 -->
    <view class="slot"><slot /></view>
  </view>
</template>

<style scoped>
.mcard {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 14px 16px 16px;
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 0 var(--ink);
}
.tone-brand { background: var(--brand); }
.tone-accent { background: var(--accent); }
.tone-neutral { background: var(--neutral); }
.tone-surface { background: var(--surface); }
.kind { font-size: 12px; font-weight: 700; }
.name { margin: 2px 0 4px; font-family: var(--font-display); font-size: 28px; line-height: 1.15; }
.num { display: flex; align-items: baseline; }
.big { font-family: var(--font-number); font-size: 40px; font-weight: 800; line-height: 1; }
.unit { margin-left: 5px; font-size: 13px; font-weight: 600; }
.meta { margin-top: 8px; font-size: 12px; color: var(--ink-muted); }
.bar { position: relative; height: 6px; margin-top: 10px; }
.track, .fill { position: absolute; left: 0; top: 0; height: 100%; border-radius: 99px; background: var(--ink); }
.track { right: 0; opacity: 0.15; }
.slot { position: relative; }
.mark { position: absolute; right: 8px; bottom: 8px; width: 72px; opacity: 0.15; pointer-events: none; }
/* 彩色底上灰字对比度不够，改用正文色 */
.tone-brand .meta, .tone-accent .meta, .tone-neutral .meta { color: var(--ink); opacity: 0.75; }
</style>
