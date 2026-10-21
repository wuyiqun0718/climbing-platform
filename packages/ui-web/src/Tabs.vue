<script setup lang="ts" generic="K extends string">
/**
 * 页签和筛选药丸，用 v-model 选中项。
 * tabs：下划线页签（选中项白底、上左右 2px 黑线），切换页面里的大块内容；chips：药丸，选中黑底白字，用来筛选、选日期区间。
 * chips 可以一个都不选（v-model 不在 options 里）。
 */
withDefaults(
  defineProps<{
    options: readonly { key: K; label: string }[];
    modelValue: K | undefined;
    variant?: 'tabs' | 'chips';
    label?: string;
  }>(),
  { variant: 'tabs', label: undefined },
);
const emit = defineEmits<{ 'update:modelValue': [key: K] }>();
</script>

<template>
  <div class="ui-tabs" :class="variant" :role="variant === 'tabs' ? 'tablist' : 'group'" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.key"
      type="button"
      :role="variant === 'tabs' ? 'tab' : undefined"
      :aria-selected="variant === 'tabs' ? o.key === modelValue : undefined"
      :aria-pressed="variant === 'chips' ? o.key === modelValue : undefined"
      :class="{ on: o.key === modelValue }"
      @click="emit('update:modelValue', o.key)"
    >{{ o.label }}</button>
  </div>
</template>

<style scoped>
.ui-tabs { display: flex; min-width: 0; }
.ui-tabs button { flex: none; font: inherit; font-weight: 600; white-space: nowrap; cursor: pointer; }
.tabs { gap: 4px; overflow-x: auto; border-bottom: var(--stroke) solid var(--ink); }
.tabs button {
  margin-bottom: calc(-1 * var(--stroke));
  padding: 8px 18px;
  font-size: 14px;
  color: var(--ink-muted);
  background: none;
  border: var(--stroke) solid transparent;
  border-bottom: 0;
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}
.tabs button:hover:not(.on) { color: var(--ink); }
.tabs button.on { color: var(--ink); background: var(--surface); border-color: var(--ink); box-shadow: 0 var(--stroke) 0 var(--surface); }
.chips { flex-wrap: wrap; gap: 8px; }
.chips button {
  min-height: 32px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--ink);
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: 999px;
}
.chips button:hover:not(.on) { background: var(--neutral-soft); }
.chips button.on { color: var(--surface); background: var(--ink); }
</style>
