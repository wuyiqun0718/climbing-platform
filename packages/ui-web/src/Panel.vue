<script setup lang="ts">
/**
 * 带框的卡片：标题（+ #sub 说明）、#chart（条形图）、默认插槽（表格等）、#foot（脚注）。
 * 放在 PanelGrid 里时四块各占 subgrid 的一行，和旁边的卡对齐；没有的块那一行是空的，不占高度。
 */
defineProps<{ title: string }>();
defineSlots<{ sub?: () => unknown; chart?: () => unknown; default?: () => unknown; foot?: () => unknown }>();
</script>

<template>
  <section class="ui-panel">
    <header class="head">
      <h2>{{ title }}</h2>
      <p v-if="$slots.sub" class="sub"><slot name="sub" /></p>
    </header>
    <div v-if="$slots.chart" class="chart"><slot name="chart" /></div>
    <div v-if="$slots.default" class="body"><slot /></div>
    <div v-if="$slots.foot" class="foot"><slot name="foot" /></div>
  </section>
</template>

<style scoped>
.ui-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 16px 18px;
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-lg);
}
@supports (grid-template-rows: subgrid) {
  .ui-panel { display: grid; grid-row: span 4; grid-template-rows: subgrid; row-gap: 0; align-content: start; }
  .head { grid-row: 1; }
  .chart { grid-row: 2; }
  .body { grid-row: 3; }
  .foot { grid-row: 4; }
}
.head, .chart, .body, .foot { min-width: 0; }
h2 { margin: 0; font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.sub { margin: 2px 0 0; font-size: 12px; color: var(--ink-muted); }
.chart, .body { margin-top: 14px; }
.foot { margin-top: 12px; font-size: 11px; color: var(--ink-muted); }
</style>
