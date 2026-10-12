<script setup lang="ts">
/** 卡包里的一张卡：期限卡、次卡、课时都用它，靠 tone 区分底色 */
withDefaults(defineProps<{
  kind: string;
  name: string;
  value: number | string;
  unit?: string;
  meta?: string;
  tone?: 'brand' | 'accent' | 'neutral' | 'surface';
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
    <slot />
  </view>
</template>

<style scoped>
.mcard {
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
/* 彩色底上灰字对比度不够，改用正文色 */
.tone-brand .meta, .tone-accent .meta, .tone-neutral .meta { color: var(--ink); opacity: 0.75; }
</style>
