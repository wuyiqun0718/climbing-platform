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
    /** 窄屏（≤ 900px）一行排成一张卡：每格「列名 值」上下排，不用横滑。给有长文字列、横滑看不到重点的表（操作日志、卡流水） */
    stack?: boolean;
    /** 加载失败了（页面上已经有说明和重试）：没有数据时不显示空状态，免得看成「真的没有」 */
    error?: boolean;
  }>(),
  { loading: false, empty: '没有数据', clickable: false, plain: false, maxHeight: undefined, stack: false, error: false },
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
  <div class="wrap" :class="{ plain, scroll: !!maxHeight, stack }" :style="maxHeight ? { maxHeight } : undefined" :aria-busy="loading">
    <table class="tbl" :class="{ dim: loading && rows.length > 0 }">
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            :style="{ width: col.width, textAlign: alignOf(col) }"
            scope="col"
          >
            <template v-if="col.label">{{ col.label }}</template>
            <!-- 操作列（撤销、停用……）看着不用表头，读屏要有列名 -->
            <span v-else class="sr-only">操作</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="loading && rows.length === 0" class="state">
          <td :colspan="columns.length">加载中…</td>
        </tr>
        <tr v-else-if="rows.length === 0 && error" class="state">
          <td :colspan="columns.length">没加载出来，点上面的「重试」</td>
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
              :class="{ num: col.num, 'wrap-text': col.wrap }"
              :style="{ textAlign: alignOf(col) }"
              :data-label="col.label"
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
/*
 * 横滑提示：两边各一条阴影（scroll，钉在容器边上），上面再盖一条和底色一样的渐变（local，跟着内容走）。
 * 没滑到头时阴影露出来，滑到头被盖住；表格不需要横滑时两边都盖着，看不出来。
 * plain 放在白底卡片里，盖的颜色也是 surface。
 */
.wrap, .wrap.plain {
  background:
    linear-gradient(90deg, var(--surface) 40%, transparent) left / 32px 100% no-repeat local,
    linear-gradient(270deg, var(--surface) 40%, transparent) right / 32px 100% no-repeat local,
    linear-gradient(90deg, color-mix(in srgb, var(--ink) 18%, transparent), transparent) left / 12px 100% no-repeat scroll,
    linear-gradient(270deg, color-mix(in srgb, var(--ink) 18%, transparent), transparent) right / 12px 100% no-repeat scroll,
    var(--surface);
}
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
/* 长文字列：至少 14 个字宽，再长就换行；连续的英文、单号也能断开 */
td.wrap-text { min-width: 14em; white-space: normal; overflow-wrap: anywhere; }
td.num { font-family: var(--font-number); font-variant-numeric: tabular-nums; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
tr.clickable { cursor: pointer; }
/* 悬停底色只给有鼠标的设备：触屏点一下以后 :hover 会一直挂着 */
@media (hover: hover) {
  tr.clickable:hover td { background: var(--brand-soft); }
}
tr.clickable:focus-visible td { background: var(--brand-soft); }
tr.clickable:focus-visible { outline: 3px solid var(--focus-ring, var(--ink)); outline-offset: -3px; }
.state td { padding: 36px 14px; text-align: center; color: var(--ink-muted); }
/* stack：窄屏一行一张卡，表头只留给读屏，列名放到每格前面 */
@media (max-width: 900px) {
  .stack .tbl, .stack tbody, .stack tr, .stack td { display: block; }
  .stack thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .stack tbody tr:not(.state) { padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .stack tbody tr:last-child { border-bottom: 0; }
  .stack tbody tr:not(.state) td { display: grid; grid-template-columns: 5.5em minmax(0, 1fr); gap: 12px; padding: 4px 0; text-align: left !important; white-space: normal; overflow-wrap: anywhere; border: 0; }
  .stack td.wrap-text { min-width: 0; }
  .stack tbody tr:not(.state) td::before { content: attr(data-label); font-size: 12.5px; color: var(--ink-muted); }
}
/* 触屏（平板前台）：能点的地方至少 44px，桌面鼠标不变 */
@media (pointer: coarse) {
  /* 行高 48：整行能点 */
  td { padding-block: 14px; }
}
</style>
