<script setup lang="ts">
import Button from './Button.vue';

/** 确认框：替代 uni.showModal 的系统蓝按钮。bottom 时贴底弹出（支付用），amount 有值时大字显示金额 */
withDefaults(defineProps<{
  open: boolean;
  title: string;
  content?: string;
  amount?: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  bottom?: boolean;
}>(), { confirmText: '确定', cancelText: '取消', showCancel: true, bottom: false });

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <view v-if="open" class="mask" :class="{ bottom }" @tap.self="showCancel ? emit('cancel') : undefined" @touchmove.stop.prevent>
    <view class="sheet" :class="{ bottom }">
      <text class="title">{{ title }}</text>
      <text v-if="amount" class="amount">{{ amount }}</text>
      <text v-if="content" class="content">{{ content }}</text>
      <slot />
      <view class="acts">
        <view v-if="showCancel" class="act"><Button variant="ghost" block @tap="emit('cancel')">{{ cancelText }}</Button></view>
        <view class="act"><Button variant="dark" block @tap="emit('confirm')">{{ confirmText }}</Button></view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.mask { position: fixed; inset: 0; z-index: 999; display: flex; align-items: center; justify-content: center; padding: 0 24px; background: rgba(0, 0, 0, 0.45); }
.mask.bottom { align-items: flex-end; padding: 0; }
.sheet { width: 100%; box-sizing: border-box; display: flex; flex-direction: column; padding: 20px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
.sheet.bottom { position: fixed; left: 0; right: 0; bottom: 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); border-width: var(--stroke) 0 0; border-radius: var(--radius-lg) var(--radius-lg) 0 0; }
.title { font-family: var(--font-display); font-size: 20px; color: var(--ink); }
.amount { margin-top: 8px; font-family: var(--font-number); font-size: 28px; font-weight: 800; color: var(--ink); }
.content { margin-top: 8px; font-size: 14px; line-height: 1.6; color: var(--ink-muted); white-space: pre-line; }
.acts { display: flex; gap: 10px; margin-top: 18px; }
.act { flex: 1; }
</style>
