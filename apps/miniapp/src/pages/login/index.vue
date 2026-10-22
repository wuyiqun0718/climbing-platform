<script setup lang="ts">
// 登录：微信登录在启动时已经静默做了，这里只差第一次的手机号验证。
// 打开方式见 src/lib/use-login.ts：redirect 是登录完要回去的页面。
// 第一次验证前要先同意隐私保护指引（src/config/privacy.ts），不同意不能登录。
import Button from '@climb/ui-mp/Button.vue';
import { onLoad } from '@dcloudio/uni-app';
import gym from '@gym';
import { ref } from 'vue';
import { auth, privacy, run } from '../../api';
import { PRIVACY } from '../../config/privacy';
import { backAfterLogin } from '../../lib/use-login';
import { member } from '../../stores';

const redirect = ref<string>();
const busy = ref(false);
/** checking：还在查；ask：先弹隐私说明；agreed：可以验证手机号 */
const consent = ref<'checking' | 'ask' | 'agreed'>('checking');
const logo = `/static/gym/${gym.logo}`;

onLoad(async q => {
  redirect.value = q?.redirect;
  await auth.whenReady();
  // 已经登录了（比如别的页面先登录完），直接回去
  if (auth.loggedIn()) return backAfterLogin(redirect.value);
  // 启动时微信登录没成功（比如断网），这里再试一次
  if (!auth.state.session) await run(() => auth.wxLogin(), { loading: false }).catch(() => {});
  consent.value = (await privacy.needConsent()) ? 'ask' : 'agreed';
});

/** 小程序里按钮带 open-type="agreePrivacyAuthorization"，点了微信那边也记下同意 */
function agree() {
  privacy.agree();
  consent.value = 'agreed';
}

/** 不同意就不能登录，回到上一页（没有上一页回首页） */
function disagree() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) });
}

// #ifdef MP-WEIXIN
/** 完整指引是小程序后台填的那份 */
const openContract = () => uni.openPrivacyContract({ fail: () => uni.showToast({ title: '打不开，稍后再试', icon: 'none' }) });
// #endif

async function submit(code: string) {
  if (busy.value || consent.value !== 'agreed') return;
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

    <view v-if="consent === 'ask'" class="privacy">
      <text class="privacy-title">隐私保护指引</text>
      <text class="privacy-text">用会员功能前，请先看看我们会收集哪些信息：</text>
      <view v-for="it in PRIVACY.items" :key="it.what" class="privacy-item">
        <text class="privacy-what">{{ it.what }}</text>
        <text class="privacy-why">{{ it.why }}</text>
      </view>
      <text class="privacy-text">这些信息只用在{{ gym.name }}的会员服务上，不卖给别人。运营方：{{ PRIVACY.operator }}；有问题联系 {{ PRIVACY.contact }}。</text>
      <!-- #ifdef MP-WEIXIN -->
      <text class="link" @click="openContract">查看完整的《隐私保护指引》</text>
      <Button variant="primary" block open-type="agreePrivacyAuthorization" @click="agree">同意</Button>
      <!-- #endif -->
      <!-- #ifdef H5 -->
      <Button variant="primary" block @click="agree">同意</Button>
      <!-- #endif -->
      <view class="second"><Button block @click="disagree">不同意</Button></view>
    </view>

    <template v-else-if="consent === 'agreed'">
      <text class="desc">第一次用要验证一下手机号。在前台办过卡的，验证后之前的卡会自动出现在卡包里。</text>

      <!-- #ifdef MP-WEIXIN -->
      <Button variant="primary" block open-type="getPhoneNumber" :disabled="busy" @getphonenumber="onPhone">手机号快速验证</Button>
      <!-- #endif -->

      <!-- #ifdef H5 -->
      <input v-model="phone" class="input" type="number" maxlength="11" placeholder="手机号" />
      <Button variant="primary" block :disabled="busy" @click="onH5Submit">验证并登录</Button>
      <!-- #endif -->
    </template>
  </view>
</template>

<style scoped>
.page { display: flex; flex-direction: column; align-items: center; padding: 48px 24px; }
.logo { width: 80px; height: 80px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); }
.title { margin-top: 16px; font-family: var(--font-display); font-size: 24px; }
.desc { margin: 12px 0 32px; font-size: 14px; line-height: 1.6; color: var(--ink-muted); text-align: center; }
.input { box-sizing: border-box; width: 100%; height: 44px; margin-bottom: 12px; padding: 0 12px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); font-size: 16px; }
.second { width: 100%; margin-top: 12px; }
.privacy { display: flex; flex-direction: column; width: 100%; margin-top: 24px; }
.privacy-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
.privacy-text { margin: 8px 0; font-size: 14px; line-height: 1.6; color: var(--ink-muted); }
.privacy-item { display: flex; flex-direction: column; padding: 8px 0; border-bottom: 1px solid var(--line); }
.privacy-what { font-size: 15px; }
.privacy-why { font-size: 13px; color: var(--ink-muted); }
.link { margin: -8px 0 8px; padding: 12px 0; font-size: 14px; color: var(--brand-strong); }
</style>
