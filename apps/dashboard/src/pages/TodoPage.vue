<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <header class="page-h">
    <h1>{{ route.meta.label }}</h1>
    <p>这个页面还在做</p>
  </header>
  <section class="panel">
    <h2>还没做完</h2>
    <p>{{ route.meta.label }}的报名、签到还在做，做好之前请先线下登记。</p>
  </section>
</template>

<style scoped>
.page-h h1 { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.page-h p { margin: 4px 0 16px; font-size: 13px; color: var(--ink-muted); }
.panel { max-width: 640px; padding: 16px 18px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.panel h2 { margin: 0 0 6px; font-family: var(--font-display); font-size: 20px; font-weight: 400; }
.panel p { margin: 0; font-size: 14px; color: var(--ink-muted); }
</style>
