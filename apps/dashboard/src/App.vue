<script setup lang="ts">
import type { StaffRole } from '@climb/api';
import gym from '@gym';
import { useRoute, useRouter } from 'vue-router';
import { NAV } from './router';
import { session } from './session';

const logo = `/gym/${gym.logo}`;
const route = useRoute();
const router = useRouter();
const ROLE_LABEL: Record<StaffRole, string> = { owner: '馆长', manager: '店长', desk: '前台' };

function logout() {
  session.logout();
  router.replace({ name: 'login' });
}
</script>

<template>
  <RouterView v-if="route.meta.public" />
  <div v-else class="shell">
    <aside class="side">
      <div class="brand">
        <img :src="logo" alt="" />
        <span>{{ gym.shortName }}</span>
      </div>
      <nav>
        <RouterLink v-for="n in NAV" :key="n.path" :to="n.path" class="nav-item">{{ n.label }}</RouterLink>
      </nav>
      <div v-if="session.state.staff" class="me">
        <div class="me-name">{{ session.state.staff.name }}</div>
        <div class="me-role">{{ ROLE_LABEL[session.state.staff.role] }}</div>
        <button type="button" class="logout" @click="logout">退出</button>
      </div>
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
.me { margin-top: auto; display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; padding: 12px 8px 0; border-top: 1px solid #2b2b2b; }
.me-name { font-size: 14px; font-weight: 700; }
.me-role { grid-row: 2; font-size: 12px; color: #a3a39b; }
.logout { grid-row: 1 / span 2; grid-column: 2; padding: 6px 10px; font: inherit; font-size: 13px; color: #d6d6d0; background: transparent; border: 1px solid #3a3a37; border-radius: var(--radius-sm); cursor: pointer; }
.logout:hover { color: #fff; border-color: #6e6e66; }
.main { min-width: 0; padding: 24px 28px 56px; }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: static; height: auto; flex-direction: row; align-items: center; overflow-x: auto; }
  .brand { border: 0; padding: 0; }
  nav { display: flex; }
  .nav-item { white-space: nowrap; }
  .me { margin: 0 0 0 auto; padding: 0; border: 0; white-space: nowrap; }
  .main { padding: 18px 16px 48px; }
}
</style>
