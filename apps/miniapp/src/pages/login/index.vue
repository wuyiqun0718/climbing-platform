<script setup lang="ts">
// 登录：微信登录在启动时已经静默做了，这里只差第一次的手机号验证。
// 打开方式见 src/lib/use-login.ts：redirect 是登录完要回去的页面。
import { onLoad } from '@dcloudio/uni-app';
import gym from '@gym';
import { ref } from 'vue';
import { auth, run } from '../../api';
import { backAfterLogin } from '../../lib/use-login';
import { member } from '../../stores';

const redirect = ref<string>();
const busy = ref(false);
const logo = `/static/gym/${gym.logo}`;

onLoad(async q => {
  redirect.value = q?.redirect;
  await auth.whenReady();
  // 已经登录了（比如别的页面先登录完），直接回去
  if (auth.loggedIn()) return backAfterLogin(redirect.value);
  // 启动时微信登录没成功（比如断网），这里再试一次
  if (!auth.state.session) await run(() => auth.wxLogin(), { loading: false }).catch(() => {});
});

async function submit(code: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    const { legacyBound } = await run(() => auth.bindPhone(code), { loading: '登录中' });
    await member.reset().catch(() => {});
    if (legacyBound) uni.showToast({ title: '找到你之前的卡了，已经放进卡包', icon: 'none', duration: 2500 });
    await backAfterLogin(redirect.value);
  } catch {
    // run 已经提示过了
  } finally {
    busy.value = false;
  }
}

// #ifdef MP-WEIXIN
/** 手机号快速验证：会员点了允许才有 code；点了拒绝就留在这页 */
function onPhone(e: { detail: { code?: string; errMsg?: string } }) {
  if (e.detail.code) submit(e.detail.code);
  else uni.showToast({ title: '要验证手机号才能用会员功能', icon: 'none' });
}
// #endif

// #ifdef H5
// H5 只用来开发调试，拿不到微信手机号：mock 下手机号就是 code
const phone = ref('');
function onH5Submit() {
  if (!/^1\d{10}$/.test(phone.value)) return uni.showToast({ title: '手机号是 11 位数字', icon: 'none' });
  submit(phone.value);
}
// #endif
</script>

<template>
  <view class="page">
    <image class="logo" :src="logo" mode="aspectFill" />
    <text class="title">{{ gym.name }}</text>
    <text class="desc">第一次用要验证一下手机号。在前台办过卡的，验证后之前的卡会自动出现在卡包里。</text>

    <!-- #ifdef MP-WEIXIN -->
    <button class="btn" open-type="getPhoneNumber" :disabled="busy" @getphonenumber="onPhone">手机号快速验证</button>
    <!-- #endif -->

    <!-- #ifdef H5 -->
    <input v-model="phone" class="input" type="number" maxlength="11" placeholder="手机号（开发用，代替微信验证）" />
    <button class="btn" :disabled="busy" @click="onH5Submit">验证并登录</button>
    <!-- #endif -->
  </view>
</template>

<style scoped>
.page { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; }
.logo { width: 80px; height: 80px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.title { margin-top: 16px; font-family: var(--font-display); font-size: 24px; }
.desc { margin: 12px 0 32px; font-size: 14px; line-height: 1.6; color: var(--ink-muted); text-align: center; }
.input { box-sizing: border-box; width: 100%; height: 44px; margin-bottom: 12px; padding: 0 12px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); font-size: 16px; }
.btn { width: 100%; background: var(--brand); color: var(--on-brand); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); font-size: 16px; }
</style>
