<script setup lang="ts">
/** 空状态：标题 + 说明，按钮放默认 slot */
defineProps<{ title: string; text?: string }>();
</script>

<template>
  <view class="empty">
    <text class="title">{{ title }}</text>
    <text v-if="text" class="text">{{ text }}</text>
    <view v-if="$slots.default" class="acts"><slot /></view>
  </view>
</template>

<style scoped>
.empty { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; text-align: center; }
.title { font-family: var(--font-display); font-size: 22px; color: var(--ink); }
.text { margin-top: 8px; font-size: 13px; line-height: 1.5; color: var(--ink-muted); }
.acts { margin-top: 16px; }
</style>
