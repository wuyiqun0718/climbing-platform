<script setup lang="ts" generic="T extends object">
/**
 * 后台列表。单元格默认显示 column.format(row) 或 row[key]，
 * 要自定义就用插槽 `#cell-<key>="{ row, value, index }"`。
 * loading 且没有数据时显示「加载中」；有旧数据时保留旧数据变淡，避免翻页闪一下。
 */
import type { Column } from './table';

const props = withDefaults(
  defineProps<{
    columns: Column<T>[];
    rows: T[];
    /** 行的唯一键：字段名或函数 */
    rowKey: keyof T | ((row: T) => string | number);
    loading?: boolean;
    /** 空状态文案，也可以用 #empty 插槽 */
    empty?: string;
    /** 行可点（比如进详情），点了 emit row-click */
    clickable?: boolean;
    /** 放在已经有边框的面板里：表格自己不再画框，一张表只留一个框 */
    plain?: boolean;
    /** 长列表限高，表格内部滚动，表头吸顶，比如 'calc(100vh - 240px)' */
    maxHeight?: string;
  }>(),
  { loading: false, empty: '没有数据', clickable: false, plain: false, maxHeight: undefined },
);

const emit = defineEmits<{ 'row-click': [row: T, index: number] }>();

defineSlots<
  {
    empty?: () => unknown;
  } & {
    [K in `cell-${string}`]?: (props: { row: T; value: unknown; index: number }) => unknown;
  }
>();

function keyOf(row: T, index: number): string | number {
  const k = typeof props.rowKey === 'function' ? props.rowKey(row) : row[props.rowKey];
  return typeof k === 'string' || typeof k === 'number' ? k : index;
}

function field(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key];
}

function display(col: Column<T>, row: T): string | number {
  if (col.format) return col.format(row);
  const v = field(row, col.key);
  if (v === null || v === undefined || v === '') return '—';
  return typeof v === 'number' ? v : String(v);
}

function alignOf(col: Column<T>) {
  return col.align ?? (col.num ? 'right' : 'left');
}

function onRow(row: T, index: number) {
  if (props.clickable) emit('row-click', row, index);
}
</script>

<template>
  <div class="wrap" :class="{ plain, scroll: !!maxHeight }" :style="maxHeight ? { maxHeight } : undefined" :aria-busy="loading">
    <table class="tbl" :class="{ dim: loading && rows.length > 0 }">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :style="{ width: col.width, textAlign: alignOf(col) }"
            scope="col"
          >{{ col.label }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && rows.length === 0" class="state">
          <td :colspan="columns.length">加载中…</td>
        </tr>
        <tr v-else-if="rows.length === 0" class="state">
          <td :colspan="columns.length"><slot name="empty">{{ empty }}</slot></td>
        </tr>
        <template v-else>
          <tr
            v-for="(row, i) in rows"
            :key="keyOf(row, i)"
            :class="{ clickable }"
            :tabindex="clickable ? 0 : undefined"
            @click="onRow(row, i)"
            @keydown.enter="onRow(row, i)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              :class="{ num: col.num }"
              :style="{ textAlign: alignOf(col) }"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="field(row, col.key)" :index="i">{{ display(col, row) }}</slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.wrap {
  overflow-x: auto;
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-lg);
}
.wrap.plain { background: transparent; border: 0; border-radius: 0; }
.wrap.scroll { overflow: auto; }
.tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13.5px; transition: opacity 0.15s; }
.tbl.dim { opacity: 0.5; }
th {
  padding: 10px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-muted);
  white-space: nowrap;
  border-bottom: var(--stroke) solid var(--ink);
  /* 吸顶相对最近的滚动容器：限了高就是表格自己，否则 .wrap 横向滚动时只是不动 */
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);
}
td { padding: 11px 14px; white-space: nowrap; vertical-align: middle; border-bottom: 1px solid var(--line); }
tbody tr:last-child td { border-bottom: 0; }
td.num { font-family: var(--font-number); font-variant-numeric: tabular-nums; }
tr.clickable { cursor: pointer; }
tr.clickable:hover td, tr.clickable:focus-visible td { background: var(--brand-soft); }
tr.clickable:focus-visible { outline: none; }
.state td { padding: 36px 14px; text-align: center; color: var(--ink-muted); }
</style>
