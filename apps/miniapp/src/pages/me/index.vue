<script setup lang="ts">
// 我的：任务 38 汇总各入口
import { useRequireLogin } from '../../lib/use-login';
import { member } from '../../stores';

// 要登录：没登录先去登录页，登录完回到这里
useRequireLogin(() => member.ensureLoaded().catch(() => {}));
</script>

<template>
  <view class="page">
    <navigator class="entry" url="/pages/me/orders">订单记录</navigator>
    <navigator class="entry" url="/pages/me/insurance">保险与告知书</navigator>
    <text class="placeholder">其他入口还在做</text>
  </view>
</template>

<style scoped>
.page { padding: 16px; }
.entry { margin-bottom: 12px; padding: 14px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); font-size: 15px; font-weight: 600; }
.placeholder { font-size: 14px; color: var(--ink-muted); }
</style>
