<script setup lang="ts">
/**
 * 并排卡片（Panel）的格子。卡片拉成一样高（align-items: stretch），每张卡用 subgrid 共用同一组行：
 * 标题、条形图、表格、脚注各占一行，行高取几张卡里最高的，所以表头水平对齐、底部对齐，短的那张在下面留空。
 * 卡里的条形图行和表格行用同一个固定行高（--ui-row-h），行也对得齐。窄屏（≤ 1100px）一列排。
 */
withDefaults(defineProps<{ cols?: number }>(), { cols: 2 });
</script>

<template>
  <div class="ui-panel-grid" :style="{ '--cols': cols }"><slot /></div>
</template>

<style scoped>
.ui-panel-grid {
  --ui-row-h: 42px;
  --ui-bar-gap: 0px;
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  align-items: stretch;
  gap: 16px;
}
@media (max-width: 1100px) { .ui-panel-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
