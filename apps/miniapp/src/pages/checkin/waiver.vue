<script setup lang="ts">
import type { WaiverVersion } from '@climb/core';
import { ref } from 'vue';

// 签到页里的风险告知书：没签当前版本时才显示。勾选同意，条款可以展开看。签不签、签哪一版由后端按 @climb/core 判断
defineProps<{ waiver: WaiverVersion }>();
const agreed = defineModel<boolean>({ required: true });
const expanded = ref(false);
</script>

<template>
  <view class="waiver">
    <view class="agree" role="checkbox" :aria-checked="agreed" @tap="agreed = !agreed">
      <view class="box" :class="{ on: agreed }"><text v-if="agreed">✓</text></view>
      <text class="t">我已阅读并同意《{{ waiver.title }}》</text>
    </view>
    <text class="toggle" @tap="expanded = !expanded">{{ expanded ? '收起' : '看看告知书写了什么' }}</text>
    <view v-if="expanded" class="points">
      <text v-for="(p, i) in waiver.points" :key="i" class="point">{{ i + 1 }}. {{ p }}</text>
      <text class="ver">版本 {{ waiver.version }}</text>
    </view>
  </view>
</template>

<style scoped>
.waiver { margin-bottom: 10px; padding: 14px 16px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-md); background: var(--surface); }
/* 整行都能点，上下补够 44px，不改位置 */
.agree { display: flex; align-items: center; gap: 10px; margin: -12px 0; padding: 12px 0; }
.box { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: var(--stroke) solid var(--ink); border-radius: 4px; background: var(--surface); color: var(--ink); font-size: 12px; font-weight: 700; }
.box.on { background: var(--brand); }
.t { font-size: 14px; font-weight: 600; }
/* 跟上面的勾选行各自够 44px 点击区，字比原来往下 6px */
.toggle { display: block; margin-bottom: -13px; padding: 14px 0 13px; font-size: 12px; color: var(--ink-muted); text-decoration: underline; }
.points { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.point { font-size: 13px; line-height: 1.6; }
.ver { font-size: 12px; color: var(--ink-muted); }
</style>
