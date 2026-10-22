<script setup lang="ts">
/** 分页。页码从 1 开始，用 v-model:page。 */
import { computed } from 'vue';
import { clampPage, pageCount, pageItems } from './pager';

const props = defineProps<{
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{ 'update:page': [page: number] }>();

const count = computed(() => pageCount(props.total, props.pageSize));
const current = computed(() => clampPage(props.page, count.value));
const items = computed(() => pageItems(current.value, count.value));

function go(p: number) {
  const next = clampPage(p, count.value);
  if (!props.disabled && next !== current.value) emit('update:page', next);
}
</script>

<template>
  <nav class="pager" aria-label="分页">
    <span class="total">共 {{ total }} 条</span>
    <template v-if="count > 1">
      <button type="button" class="btn" :disabled="disabled || current === 1" @click="go(current - 1)">上一页</button>
      <template v-for="(it, i) in items" :key="i">
        <span v-if="it === '…'" class="gap">…</span>
        <button
          v-else
          type="button"
          class="btn num"
          :class="{ on: it === current }"
          :aria-current="it === current ? 'page' : undefined"
          :disabled="disabled"
          @click="go(it)"
        >{{ it }}</button>
      </template>
      <button type="button" class="btn" :disabled="disabled || current === count" @click="go(current + 1)">下一页</button>
    </template>
  </nav>
</template>

<style scoped>
.pager { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 6px; font-size: 13px; }
.total { margin-right: auto; color: var(--ink-muted); }
.btn {
  min-width: 32px;
  height: 32px;
  padding: 0 10px;
  font: inherit;
  color: var(--ink);
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn.num { font-family: var(--font-number); font-variant-numeric: tabular-nums; }
.btn:hover:not(:disabled):not(.on) { background: var(--neutral-soft); }
.btn.on { color: var(--on-brand); background: var(--brand); font-weight: 700; }
.btn:disabled { cursor: default; opacity: 0.45; }
.btn.on:disabled { opacity: 1; }
.gap { padding: 0 4px; color: var(--ink-muted); }
/* 触屏（平板前台）：能点的地方至少 44px，桌面鼠标不变 */
@media (pointer: coarse) {
  .btn { min-width: 44px; height: 44px; }
}
</style>
