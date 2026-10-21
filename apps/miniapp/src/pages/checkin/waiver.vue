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
.agree { display: flex; align-items: center; gap: 10px; }
.box { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); font-size: 12px; font-weight: 700; }
.box.on { background: var(--brand); }
.t { font-size: 14px; font-weight: 600; }
.toggle { display: block; margin-top: 8px; font-size: 12px; color: var(--ink-muted); text-decoration: underline; }
.points { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.point { font-size: 13px; line-height: 1.6; }
.ver { font-size: 12px; color: var(--ink-muted); }
</style>
