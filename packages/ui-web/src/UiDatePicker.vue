<script setup lang="ts">
/**
 * 日期选择，替代原生 <input type="date">：外观和 UiSelect 一样（2px 黑框，md 42px / sm 34px），
 * 点开是自己画的月历（周一开头，今天加圈，选中黑底，min / max 外的灰掉不能点）。
 * v-model 是 YYYY-MM-DD，空字符串表示没选。
 * 键盘（焦点一直在按钮上，月历用 aria-activedescendant 指当前格）：
 *   Enter / 空格 / ↓ 打开；方向键左右一天、上下一周；PageUp / PageDown 换月；Home / End 到周一 / 周日；
 *   Enter 选中；Esc 收起（在弹窗里只收月历，不关弹窗）；Tab 收起。
 * id、aria-* 落在按钮上，能直接放进 Field；class / style 落在外层。日期计算在 datepicker.ts。
 */
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from 'vue';
import { addMonths, clampDate, formatDot, isDateKey, monthGrid, monthOf, monthTitle, moveDate, todayKey } from './datepicker';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue: string;
    min?: string;
    max?: string;
    placeholder?: string;
    disabled?: boolean;
    size?: 'md' | 'sm';
  }>(),
  { min: undefined, max: undefined, placeholder: '选日期', disabled: false, size: 'md' },
);
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const WEEK = ['一', '二', '三', '四', '五', '六', '日'];

const attrs = useAttrs();
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }));
const triggerAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs;
  return rest;
});

const gridId = useId();
const cellId = (k: string) => `${gridId}-${k}`;
const root = ref<HTMLElement | null>(null);
const pop = ref<HTMLElement | null>(null);
const open = ref(false);
const up = ref(false);
const alignEnd = ref(false);
/** 键盘高亮的那一天；月历显示它所在的月 */
const active = ref('');
const month = computed(() => monthOf(active.value || todayKey()));
const grid = computed(() => monthGrid(month.value, props.min, props.max));
const today = ref(todayKey());
const valid = computed(() => isDateKey(props.modelValue));
const label = computed(() => (valid.value ? formatDot(props.modelValue) : props.placeholder));

async function show() {
  if (props.disabled || open.value) return;
  today.value = todayKey();
  active.value = clampDate(valid.value ? props.modelValue : today.value, props.min, props.max);
  const r = root.value?.getBoundingClientRect();
  // 月历约 330px 高（触屏放大后约 390px）：下面放不下、上面更宽就往上开
  up.value = !!r && window.innerHeight - r.bottom < 400 && r.top > window.innerHeight - r.bottom;
  alignEnd.value = false;
  open.value = true;
  await nextTick();
  const pr = pop.value?.getBoundingClientRect();
  alignEnd.value = !!pr && pr.right > document.documentElement.clientWidth - 8;
}

function hide() {
  open.value = false;
}

function choose(k: string) {
  if (!isDateKey(k) || (props.min && k < props.min) || (props.max && k > props.max)) return;
  if (k !== props.modelValue) emit('update:modelValue', k);
  hide();
}

function shiftMonth(n: number) {
  active.value = clampDate(addMonths(active.value, n), props.min, props.max);
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return;
  if (!open.value) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault();
      show();
    }
    return;
  }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    choose(active.value);
    return;
  }
  if (e.key === 'Tab') return hide();
  const next = moveDate(active.value, e.key, props.min, props.max);
  if (next) {
    e.preventDefault();
    active.value = next;
  }
}

// 和 UiSelect 一样：window 捕获阶段先拦下 Esc，只收月历
function onEscape(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  e.stopPropagation();
  hide();
}

function onPointerdown(e: PointerEvent) {
  if (!root.value?.contains(e.target as Node)) hide();
}

watch(open, v => {
  if (v) {
    window.addEventListener('keydown', onEscape, true);
    document.addEventListener('pointerdown', onPointerdown, true);
  } else {
    window.removeEventListener('keydown', onEscape, true);
    document.removeEventListener('pointerdown', onPointerdown, true);
  }
});
watch(() => props.disabled, d => d && hide());
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape, true);
  document.removeEventListener('pointerdown', onPointerdown, true);
});
</script>

<template>
  <div ref="root" class="ui-date" :class="[size, { open }]" v-bind="rootAttrs">
    <button
      type="button"
      class="ui-date-trigger"
      aria-haspopup="dialog"
      :aria-expanded="open"
      :aria-controls="gridId"
      :aria-activedescendant="open && active ? cellId(active) : undefined"
      :disabled="disabled"
      v-bind="triggerAttrs"
      @click="open ? hide() : show()"
      @keydown="onKeydown"
    >
      <span class="value" :class="{ placeholder: !valid }">{{ label }}</span>
      <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>
    </button>
    <div v-show="open" ref="pop" class="pop" :class="{ up, end: alignEnd }" @mousedown.prevent>
      <div class="head">
        <button type="button" class="nav" tabindex="-1" aria-label="上个月" @click="shiftMonth(-1)">‹</button>
        <span class="title" aria-live="polite">{{ monthTitle(month) }}</span>
        <button type="button" class="nav" tabindex="-1" aria-label="下个月" @click="shiftMonth(1)">›</button>
      </div>
      <table :id="gridId" class="grid" role="grid" :aria-label="monthTitle(month)">
        <thead>
          <tr><th v-for="w in WEEK" :key="w" scope="col" :abbr="`周${w}`">{{ w }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, r) in grid" :key="r">
            <td
              v-for="c in row"
              :id="cellId(c.key)"
              :key="c.key"
              role="gridcell"
              :aria-selected="c.key === modelValue"
              :aria-disabled="c.disabled || undefined"
              :aria-current="c.key === today ? 'date' : undefined"
              :aria-label="formatDot(c.key)"
              :class="{ outside: c.outside, disabled: c.disabled, today: c.key === today, selected: c.key === modelValue, active: c.key === active }"
              @mousemove="!c.disabled && (active = c.key)"
              @click="choose(c.key)"
            >{{ c.day }}</td>
          </tr>
        </tbody>
      </table>
      <div class="foot">
        <button type="button" class="today-btn" tabindex="-1" :disabled="!!(min && today < min) || !!(max && today > max)" @click="choose(today)">今天</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ui-date { position: relative; display: inline-block; min-width: 0; max-width: 100%; vertical-align: middle; }
.ui-date-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  font: inherit;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
  text-align: left;
  color: var(--ink);
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.sm .ui-date-trigger { gap: 10px; min-height: 34px; padding: 0 12px; font-size: 13px; }
.ui-date-trigger:focus-visible,
.open .ui-date-trigger { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 55%, transparent); }
.ui-date-trigger:disabled { cursor: default; opacity: 0.5; }
.value { flex: 1; min-width: 0; white-space: nowrap; }
.value.placeholder { color: var(--ink-muted); }
.icon { flex: none; width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
.pop {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  width: 272px;
  padding: 10px;
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-md);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--ink) 18%, transparent);
}
.pop.up { top: auto; bottom: calc(100% + 4px); }
.pop.end { right: 0; left: auto; }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.title { font-size: 14px; font-weight: 700; }
.nav {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  padding: 0;
  font: inherit;
  font-size: 20px;
  line-height: 1;
  color: var(--ink);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.nav:hover { background: var(--neutral-soft); }
.grid { width: 100%; border-collapse: separate; border-spacing: 2px; table-layout: fixed; }
.grid th { padding: 4px 0; font-size: 12px; font-weight: 600; color: var(--ink-muted); text-align: center; }
.grid td {
  height: 32px;
  padding: 0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--ink);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.grid td.outside { color: var(--ink-muted); }
.grid td.active { background: var(--neutral-soft); }
.grid td.today { font-weight: 700; box-shadow: inset 0 0 0 var(--stroke) var(--brand-strong); }
.grid td.selected { color: var(--surface); background: var(--ink); }
.grid td.disabled { color: var(--ink-muted); background: none; cursor: default; opacity: 0.4; }
.foot { display: flex; justify-content: flex-end; margin-top: 4px; }
.today-btn { padding: 4px 8px; font: inherit; font-size: 13px; font-weight: 700; color: var(--ink); text-decoration: underline; background: none; border: 0; cursor: pointer; }
.today-btn:disabled { color: var(--ink-muted); text-decoration: none; cursor: default; }
/* 触屏（平板前台）：能点的地方至少 44px，桌面鼠标不变 */
@media (pointer: coarse) {
  .ui-date-trigger, .sm .ui-date-trigger { min-height: 44px; }
  .pop { width: 336px; }
  .nav { width: 44px; height: 44px; }
  .grid td { height: 44px; }
  .today-btn { min-height: 44px; padding: 0 12px; }
}
</style>
