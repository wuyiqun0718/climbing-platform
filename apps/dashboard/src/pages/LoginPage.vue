<script setup lang="ts">
import gym from '@gym';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { usingMock } from '../api';
import { redirectTarget } from '../router';
import { loginErrorText, session } from '../session';

const route = useRoute();
const router = useRouter();
const logo = `/gym/${gym.logo}`;

const phone = ref('');
const password = ref('');
const error = ref('');
const submitting = ref(false);

async function submit() {
  if (submitting.value) return;
  const p = phone.value.replace(/\s/g, '');
  if (!/^1\d{10}$/.test(p)) return void (error.value = '手机号是 11 位数字');
  if (!password.value) return void (error.value = '请输入密码');
  error.value = '';
  submitting.value = true;
  try {
    await session.login(p, password.value);
    await router.replace(redirectTarget(route.query.redirect));
  } catch (e) {
    error.value = loginErrorText(e);
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="wrap">
    <form class="card" novalidate @submit.prevent="submit">
      <div class="brand">
        <img :src="logo" alt="" />
        <div>
          <h1>{{ gym.shortName }} 门店后台</h1>
          <p>员工用手机号登录</p>
        </div>
      </div>
      <label class="field">
        <span>手机号</span>
        <input v-model="phone" type="tel" inputmode="numeric" autocomplete="username" maxlength="13" autofocus />
      </label>
      <label class="field">
        <span>密码</span>
        <input v-model="password" type="password" autocomplete="current-password" />
      </label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="submitting">{{ submitting ? '登录中…' : '登录' }}</button>
      <p class="hint">忘记密码找馆长重置。</p>
      <p v-if="usingMock" class="hint">演示数据：<span class="nowrap">13800000001（馆长）</span>、<span class="nowrap">13800000002（店长）</span>、<span class="nowrap">13800000003（前台）</span>，密码都是 123456</p>
    </form>
  </div>
</template>

<style scoped>
.wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; }
.card { width: min(380px, 100%); display: grid; gap: 14px; padding: 28px 24px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
.brand img { width: 44px; height: 44px; border-radius: var(--radius-sm); }
.brand h1 { margin: 0; font-family: var(--font-display); font-size: 24px; font-weight: 400; }
.brand p { margin: 2px 0 0; font-size: 13px; color: var(--ink-muted); }
.field { display: grid; gap: 6px; font-size: 13px; font-weight: 700; }
.field input { font-size: 15px; }
.error { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
button { padding: 12px; font: inherit; font-weight: 700; color: var(--on-brand); background: var(--brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); cursor: pointer; }
button:disabled { opacity: 0.6; cursor: default; }
.hint { margin: 0; font-size: 12px; color: var(--ink-muted); }
.nowrap { white-space: nowrap; }
</style>
