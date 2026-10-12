<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <h1 class="h">{{ route.meta.label }}</h1>
  <p class="p">这个页面还没开始做，设计稿在 prototype/ 原型的「管理后台」里。</p>
</template>

<style scoped>
.h { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.p { margin-top: 8px; font-size: 14px; color: var(--ink-muted); }
</style>
