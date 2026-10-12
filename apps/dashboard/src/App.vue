<script setup lang="ts">
import gym from '@gym';
import { NAV } from './router';

const logo = `/gym/${gym.logo}`;
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <img :src="logo" alt="" />
        <span>{{ gym.shortName }}</span>
      </div>
      <nav>
        <RouterLink v-for="n in NAV" :key="n.path" :to="n.path" class="nav-item">{{ n.label }}</RouterLink>
      </nav>
    </aside>
    <main class="main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 216px minmax(0, 1fr); min-height: 100vh; }
.side { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 18px; padding: 18px 12px; background: var(--ink); color: #fff; }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 12px; border-bottom: 1px solid #2b2b2b; font-weight: 800; }
.brand img { width: 36px; height: 36px; border-radius: var(--radius-sm); }
nav { display: grid; gap: 4px; }
.nav-item { padding: 10px 12px; border-radius: var(--radius-sm); color: #d6d6d0; text-decoration: none; font-size: 14px; }
.nav-item:hover { background: #1d1d1b; color: #fff; }
.nav-item.router-link-exact-active { background: var(--brand); color: var(--on-brand); font-weight: 700; }
.main { min-width: 0; padding: 24px 28px 56px; }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: static; height: auto; flex-direction: row; align-items: center; overflow-x: auto; }
  .brand { border: 0; padding: 0; }
  nav { display: flex; }
  .nav-item { white-space: nowrap; }
  .main { padding: 18px 16px 48px; }
}
</style>
