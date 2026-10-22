<script setup lang="ts" generic="V extends string">
/**
 * 下拉选择，替代原生 <select>：箭头离右边框留足距离，样式跟原型一致（2px 黑框）。
 * v-model 是选中项的 value；不在 options 里时显示 placeholder（灰字）。
 * 键盘：上下移动、Enter / 空格选中、Esc 收起（在弹窗里只收下拉，不关弹窗）、Home / End；点外面收起。
 * id、aria-* 这些属性落在按钮上，所以能直接放进 Field：
 *   <Field label="门店" v-slot="f"><UiSelect v-model="storeId" v-bind="f.attrs" :options="opts" /></Field>
 * class / style 落在外层。size="sm" 用在工具栏和筛选条。
 */
import { computed, nextTick, onBeforeUnmount, ref, useAttrs, useId, watch } from 'vue';
import { edgeIndex, stepIndex, type SelectOption } from './select';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue: V | undefined;
    options: readonly SelectOption<V>[];
    placeholder?: string;
    disabled?: boolean;
    size?: 'md' | 'sm';
  }>(),
  { placeholder: '请选择', disabled: false, size: 'md' },
);
const emit = defineEmits<{ 'update:modelValue': [value: V] }>();

const attrs = useAttrs();
const rootAttrs = computed(() => ({ class: attrs.class, style: attrs.style }));
const triggerAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs;
  return rest;
});

const listId = useId();
const optionId = (i: number) => `${listId}-${i}`;
const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const open = ref(false);
const up = ref(false);
const alignEnd = ref(false);
const active = ref(-1);

const selectedIndex = computed(() => props.options.findIndex(o => o.value === props.modelValue));
const selected = computed(() => props.options[selectedIndex.value]);

async function show() {
  if (props.disabled || open.value) return;
  const r = root.value?.getBoundingClientRect();
  // 下面放不下、上面更宽就往上开
  up.value = !!r && window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom;
  active.value = selected.value && !selected.value.disabled ? selectedIndex.value : edgeIndex(props.options, 'first');
  alignEnd.value = false;
  open.value = true;
  // 右边放不下（靠右的工具栏）就跟按钮右边对齐
  await nextTick();
  const lr = list.value?.getBoundingClientRect();
  alignEnd.value = !!lr && lr.right > document.documentElement.clientWidth - 8;
}

function hide() {
  open.value = false;
}

function choose(i: number) {
  const o = props.options[i];
  if (!o || o.disabled) return;
  if (o.value !== props.modelValue) emit('update:modelValue', o.value);
  hide();
}

function onKeydown(e: KeyboardEvent) {
  if (props.disabled) return;
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      e.preventDefault();
      if (!open.value) {
        show();
        return;
      }
      active.value = stepIndex(props.options, active.value, e.key === 'ArrowDown' ? 1 : -1);
      break;
    }
    case 'Home':
    case 'End':
      if (!open.value) return;
      e.preventDefault();
      active.value = edgeIndex(props.options, e.key === 'Home' ? 'first' : 'last');
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (open.value) choose(active.value);
      else show();
      break;
    case 'Tab':
      hide();
      break;
  }
}

// 弹窗在 document 捕获阶段处理 Esc；这里挂在 window 捕获阶段，先一步拦下，只收起下拉
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

// 键盘移动时让高亮项留在可见范围
watch(active, async i => {
  if (!open.value || i < 0) return;
  await nextTick();
  list.value?.querySelector<HTMLElement>(`#${CSS.escape(optionId(i))}`)?.scrollIntoView({ block: 'nearest' });
});

watch(() => props.disabled, d => d && hide());

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onEscape, true);
  document.removeEventListener('pointerdown', onPointerdown, true);
});
</script>

<template>
  <div ref="root" class="ui-select" :class="[size, { open }]" v-bind="rootAttrs">
    <button
      type="button"
      class="ui-select-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="listId"
      :aria-activedescendant="open && active >= 0 ? optionId(active) : undefined"
      :disabled="disabled"
      v-bind="triggerAttrs"
      @click="open ? hide() : show()"
      @keydown="onKeydown"
    >
      <span class="value" :class="{ placeholder: !selected }">{{ selected ? selected.label : placeholder }}</span>
      <svg class="arrow" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1.5 6 6.5 11 1.5" /></svg>
    </button>
    <ul v-show="open" :id="listId" ref="list" class="list" :class="{ up, end: alignEnd }" role="listbox">
      <li
        v-for="(o, i) in options"
        :id="optionId(i)"
        :key="o.value"
        role="option"
        :aria-selected="i === selectedIndex"
        :aria-disabled="o.disabled || undefined"
        :class="{ active: i === active, selected: i === selectedIndex, disabled: o.disabled }"
        @mousemove="!o.disabled && (active = i)"
        @mousedown.prevent
        @click="choose(i)"
      >{{ o.label }}</li>
    </ul>
  </div>
</template>

<style scoped>
.ui-select { position: relative; display: inline-block; min-width: 0; max-width: 100%; vertical-align: middle; }
.ui-select-trigger {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 42px;
  padding: 0 14px;
  font: inherit;
  font-size: 14px;
  text-align: left;
  color: var(--ink);
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.sm .ui-select-trigger { gap: 10px; min-height: 34px; padding: 0 12px; font-size: 13px; }
.ui-select-trigger:focus-visible,
.open .ui-select-trigger { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 55%, transparent); }
.ui-select-trigger:disabled { cursor: default; opacity: 0.5; }
.value { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.value.placeholder { color: var(--ink-muted); }
.arrow { flex: none; width: 12px; height: 8px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
.open .arrow { transform: rotate(180deg); }
.list {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 50;
  min-width: 100%;
  max-height: 260px;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  list-style: none;
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 18px color-mix(in srgb, var(--ink) 18%, transparent);
}
.list.up { top: auto; bottom: calc(100% + 4px); }
.list.end { right: 0; left: auto; }
.list li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  font-size: 14px;
  white-space: nowrap;
  color: var(--ink);
  border-radius: calc(var(--radius-sm) - 2px);
  cursor: pointer;
}
.sm .list li { padding: 6px 10px; font-size: 13px; }
.list li.active { background: var(--neutral-soft); }
.list li.selected { font-weight: 700; }
.list li.selected::after { content: '✓'; margin-left: auto; }
.list li.disabled { color: var(--ink-muted); cursor: default; }
/* 触屏（平板前台）：能点的地方至少 44px，桌面鼠标不变 */
@media (pointer: coarse) {
  .ui-select-trigger, .sm .ui-select-trigger { min-height: 44px; }
  .list li, .sm .list li { min-height: 44px; }
}
</style>
