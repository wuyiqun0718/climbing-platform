<script setup lang="ts">
/**
 * 弹窗，用 v-model:open。Esc、点遮罩、右上角 × 都会关；busy（提交中）时都不让关。
 * 打开时焦点进弹窗（有 autofocus 的元素优先），Tab 在弹窗里循环，关掉后焦点回到打开前的元素。
 * 弹窗里套弹窗时 Esc 只关最上面那个。
 * 底部按钮放 #footer 插槽；表单弹窗可以把 <form> 放默认插槽，提交按钮用 form 属性关联。
 */
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import { FOCUSABLE, modalStack, nextFocusIndex } from './overlay';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    /** 提交中：不能关，内容区不能点 */
    busy?: boolean;
    /** CSS 宽度 */
    width?: string;
    /** 点遮罩关闭；表单填了一半的弹窗可以关掉它 */
    closeOnBackdrop?: boolean;
  }>(),
  { busy: false, width: '440px', closeOnBackdrop: true },
);

const emit = defineEmits<{ 'update:open': [open: boolean]; close: [] }>();

const titleId = useId();
const panel = ref<HTMLElement | null>(null);
let stackId = 0;
let restoreFocus: HTMLElement | null = null;

function requestClose() {
  if (props.busy) return;
  emit('update:open', false);
  emit('close');
}

function focusables(): HTMLElement[] {
  if (!panel.value) return [];
  return Array.from(panel.value.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
}

function onKeydown(e: KeyboardEvent) {
  if (!modalStack.isTop(stackId)) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    requestClose();
  } else if (e.key === 'Tab') {
    const list = focusables();
    if (list.length === 0) {
      e.preventDefault();
      panel.value?.focus();
      return;
    }
    const next = nextFocusIndex(list.indexOf(document.activeElement as HTMLElement), list.length, e.shiftKey);
    e.preventDefault();
    list[next].focus();
  }
}

function onBackdrop(e: MouseEvent) {
  if (props.closeOnBackdrop && e.target === e.currentTarget) requestClose();
}

async function activate() {
  stackId = modalStack.open();
  restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.addEventListener('keydown', onKeydown, true);
  await nextTick();
  const auto = panel.value?.querySelector<HTMLElement>('[autofocus]');
  (auto ?? focusables()[0] ?? panel.value)?.focus();
}

function deactivate() {
  if (!stackId) return;
  document.removeEventListener('keydown', onKeydown, true);
  modalStack.close(stackId);
  stackId = 0;
  const el = restoreFocus;
  restoreFocus = null;
  if (el?.isConnected) el.focus();
}

watch(
  () => props.open,
  v => (v ? activate() : deactivate()),
  { immediate: true },
);
onBeforeUnmount(deactivate);
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="backdrop" @mousedown.self="onBackdrop">
      <div
        ref="panel"
        class="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-busy="busy"
        tabindex="-1"
        :style="{ width }"
      >
        <header class="head">
          <h2 :id="titleId" class="title">{{ title }}</h2>
          <button type="button" class="x" aria-label="关闭" :disabled="busy" @click="requestClose">×</button>
        </header>
        <div class="body" :class="{ busy }">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="foot">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  overflow-y: auto;
  background: color-mix(in srgb, var(--ink) 40%, transparent);
}
.panel {
  max-width: 100%;
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-lg);
  outline: none;
}
.head { display: flex; align-items: center; gap: 12px; padding: 16px 20px 0; }
.title { flex: 1; margin: 0; font-family: var(--font-display); font-size: 22px; font-weight: 400; }
.x {
  width: 32px;
  height: 32px;
  font-size: 20px;
  line-height: 1;
  color: var(--ink-muted);
  background: none;
  border: 0;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.x:hover:not(:disabled) { color: var(--ink); background: var(--neutral-soft); }
.x:disabled { cursor: default; opacity: 0.4; }
.body { padding: 16px 20px; }
.body.busy { pointer-events: none; opacity: 0.7; }
.foot { display: flex; justify-content: flex-end; gap: 8px; padding: 0 20px 18px; }
</style>
