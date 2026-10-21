<script setup lang="ts">
import { STAFF_ROLE_TEXT } from '@climb/core';
import { ToastHost } from '@climb/ui-web';
import gym from '@gym';
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeOptions } from './permissions';
import { navFor } from './router';
import { session } from './session';

const logo = `/gym/${gym.logo}`;
const route = useRoute();
const router = useRouter();
const ROLE_LABEL = STAFF_ROLE_TEXT;

const nav = computed(() => (session.state.staff ? navFor(session.state.staff.role) : []));
const stores = computed(() => (session.state.staff ? storeOptions(session.state.staff, session.state.stores) : []));
// <select> 的值只能是字符串，「全部门店」用空字符串
const storeValue = computed({
  get: () => session.state.storeId ?? '',
  set: v => session.setStore(v || null),
});

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
        <RouterLink v-for="n in nav" :key="n.path" :to="n.path" class="nav-item">{{ n.label }}</RouterLink>
      </nav>
      <div v-if="session.state.staff" class="me">
        <div class="me-name">{{ session.state.staff.name }}</div>
        <div class="me-role">{{ ROLE_LABEL[session.state.staff.role] }}</div>
        <button type="button" class="logout" @click="logout">退出</button>
      </div>
    </aside>
    <main class="main">
      <div v-if="stores.length" class="topbar">
        <label class="store">
          <span>门店</span>
          <select v-model="storeValue" :disabled="stores.length < 2">
            <option v-for="s in stores" :key="s.id ?? ''" :value="s.id ?? ''">{{ s.name }}</option>
          </select>
        </label>
      </div>
      <RouterView />
    </main>
  </div>
  <ToastHost />
</template>

<style scoped>
/* 侧栏是 ink 底，次要文字和线都从 surface 按透明度调出来，不另写色值 */
.side {
  --side-text: color-mix(in srgb, var(--surface) 84%, transparent);
  --side-muted: color-mix(in srgb, var(--surface) 62%, transparent);
  --side-border: color-mix(in srgb, var(--surface) 24%, transparent);
  --side-line: color-mix(in srgb, var(--surface) 16%, transparent);
  --side-hover: color-mix(in srgb, var(--surface) 8%, transparent);
}
.shell { display: grid; grid-template-columns: 216px minmax(0, 1fr); min-height: 100vh; }
.side { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 18px; padding: 18px 12px; background: var(--ink); color: var(--surface); }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 12px; border-bottom: 1px solid var(--side-line); }
.brand span { font-family: var(--font-display); font-size: 20px; font-weight: 400; letter-spacing: 0.04em; }
.brand img { width: 36px; height: 36px; border-radius: var(--radius-sm); }
nav { display: grid; gap: 4px; }
.nav-item { padding: 10px 12px; border-radius: var(--radius-sm); color: var(--side-text); text-decoration: none; font-size: 14px; }
.nav-item:hover { background: var(--side-hover); color: var(--surface); }
.nav-item.router-link-exact-active { background: var(--brand); color: var(--on-brand); font-weight: 700; }
.me { margin-top: auto; display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; padding: 12px 8px 0; border-top: 1px solid var(--side-line); }
.me-name { font-size: 14px; font-weight: 700; }
.me-role { grid-row: 2; font-size: 12px; color: var(--side-muted); }
.logout { grid-row: 1 / span 2; grid-column: 2; padding: 6px 10px; font: inherit; font-size: 13px; color: var(--side-text); background: transparent; border: 1px solid var(--side-border); border-radius: var(--radius-sm); cursor: pointer; }
.logout:hover { color: var(--surface); border-color: var(--side-muted); }
.main { min-width: 0; padding: 24px 28px 56px; }
.topbar { display: flex; justify-content: flex-end; margin-bottom: 12px; }
.store { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink-muted); }
.store select { padding: 7px 10px; font: inherit; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-sm); }
@media (max-width: 900px) {
  .shell { grid-template-columns: 1fr; }
  .side { position: static; height: auto; min-width: 0; flex-direction: row; align-items: center; gap: 12px; }
  .brand { flex: none; border: 0; padding: 0; }
  nav { display: flex; flex: 1 1 auto; min-width: 0; overflow-x: auto; }
  .nav-item { white-space: nowrap; }
  .me { flex: none; margin: 0 0 0 8px; padding: 0; border: 0; white-space: nowrap; }
  .main { padding: 18px 16px 48px; }
}
/* 手机宽度：标志和退出一行，导航单独一行横滑 */
@media (max-width: 600px) {
  .side { flex-wrap: wrap; row-gap: 10px; padding-bottom: 10px; }
  nav { order: 1; flex-basis: 100%; }
  .me { margin-left: auto; }
}
</style>
