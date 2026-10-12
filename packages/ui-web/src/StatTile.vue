<script setup lang="ts">
/** 看板上的指标卡。hero 用品牌色底，一个页面只放一个。 */
defineProps<{
  label: string;
  value: string | number;
  unit?: string;
  note?: string;
  hero?: boolean;
}>();
</script>

<template>
  <div class="tile" :class="{ hero }">
    <span class="label">{{ label }}</span>
    <b class="value">{{ value }}<small v-if="unit">{{ unit }}</small></b>
    <span v-if="note" class="note">{{ note }}</span>
    <slot />
  </div>
</template>

<style scoped>
.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 16px 18px;
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-lg);
}
.hero { background: var(--brand); color: var(--on-brand); }
.label { font-size: 13px; font-weight: 600; }
.value { font: 700 32px/1.1 var(--font-number); letter-spacing: -0.01em; }
.hero .value { font-size: 44px; }
.value small { margin-left: 4px; font-size: 13px; font-weight: 600; }
.note { font-size: 12px; color: var(--ink-muted); }
.hero .note { color: inherit; }
</style>
