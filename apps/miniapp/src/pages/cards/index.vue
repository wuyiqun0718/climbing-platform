<script setup lang="ts">
// 卡包：任务 10 按原型实现
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

// 要登录：没登录先去登录页，登录完回到这里
useRequireLogin(() => member.ensureLoaded().catch(() => {}));
</script>

<template>
  <view class="page">
    <text class="placeholder">卡包还在做</text>
  </view>
</template>

<style scoped>
.page { padding: 16px; }
.placeholder { font-size: 14px; color: var(--ink-muted); }
</style>
