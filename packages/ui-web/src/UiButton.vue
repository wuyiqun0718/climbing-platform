<script setup lang="ts">
/**
 * 后台统一按钮。primary 绿底，一处一个主操作；secondary 白底，导出、上一周、取消、重试用它；
 * link 是表格和卡片里的文字按钮。danger 只对 primary 起作用：深色字块，撤销、退款这类确认用。
 * disabled、form、@click 等直接透传给 <button>。
 */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'link';
    size?: 'md' | 'sm';
    danger?: boolean;
    type?: 'button' | 'submit';
  }>(),
  { variant: 'secondary', size: 'md', danger: false, type: 'button' },
);
</script>

<template>
  <button :type="type" class="ui-btn" :class="[variant, size, { danger }]"><slot /></button>
</template>

<style scoped>
.ui-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0 14px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  text-decoration: none;
  color: var(--ink);
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.ui-btn.sm { min-height: 28px; padding: 0 10px; font-size: 12.5px; }
.ui-btn.secondary:hover:not(:disabled) { background: var(--neutral-soft); }
.ui-btn.primary { color: var(--on-brand); background: var(--brand); }
.ui-btn.primary.danger { color: var(--surface); background: var(--ink); }
.ui-btn.link { min-height: 0; padding: 0; font-size: 13px; font-weight: 700; text-decoration: underline; background: none; border: 0; border-radius: 0; }
.ui-btn:disabled { cursor: default; opacity: 0.5; }
</style>
