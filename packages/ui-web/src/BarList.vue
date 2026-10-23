<script setup lang="ts">
/** 横条列表：每行一个标签、一根条、右边的数字。在 PanelGrid 里每行用固定行高 --ui-row-h，和旁边卡片的行对齐 */
import type { BarRow } from './bars';

defineProps<{ rows: BarRow[] }>();
</script>

<template>
  <ul class="bars">
    <li v-for="r in rows" :key="r.key">
      <span class="label">{{ r.label }}</span>
      <span class="track">
        <span class="bar" :style="{ width: `${r.width}%` }"><i v-if="r.inner !== undefined" :style="{ width: `${r.inner}%` }" /></span>
      </span>
      <span class="num"><b>{{ r.value }}</b><small v-if="r.note">{{ r.note }}</small></span>
    </li>
  </ul>
</template>

<style scoped>
.bars { display: flex; flex-direction: column; gap: var(--ui-bar-gap, 10px); margin: 0; padding: 0; list-style: none; }
li { box-sizing: border-box; height: var(--ui-row-h, auto); display: grid; grid-template-columns: 6.5em minmax(0, 1fr) 7.5em; align-items: center; gap: 10px; font-size: 13px; }
.label { overflow: hidden; color: var(--ink); white-space: nowrap; text-overflow: ellipsis; }
.track { height: 12px; background: var(--neutral-soft); border-radius: var(--radius-sm); overflow: hidden; }
.bar { display: block; height: 100%; min-width: 0; background: var(--accent); }
.bar i { display: block; height: 100%; background: var(--brand); }
.num { display: flex; flex-direction: column; text-align: right; line-height: 1.2; }
.num b { font-family: var(--font-number); font-size: 15px; }
.num small { font-size: 11px; color: var(--ink-muted); }
</style>
