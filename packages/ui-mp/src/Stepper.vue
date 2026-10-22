<script setup lang="ts">
/** 加减数量：− 数字 +，到 min / max 时对应按钮变灰。size 为 lg 时数字大字显示（分享次数），默认放在一行里 */
const props = withDefaults(defineProps<{
  modelValue: number;
  min: number;
  max: number;
  unit?: string;
  size?: 'md' | 'lg';
}>(), { unit: '', size: 'md' });

const emit = defineEmits<{ 'update:modelValue': [value: number] }>();

const step = (d: number) => {
  const v = Math.min(props.max, Math.max(props.min, props.modelValue + d));
  if (v !== props.modelValue) emit('update:modelValue', v);
};
</script>

<template>
  <view class="stepper" :class="size">
    <button class="sbtn" :class="{ off: modelValue <= min }" :disabled="modelValue <= min" aria-label="减一" @tap="step(-1)">−</button>
    <text class="num" aria-live="polite">{{ modelValue }}<text v-if="unit" class="unit">{{ unit }}</text></text>
    <button class="sbtn" :class="{ off: modelValue >= max }" :disabled="modelValue >= max" aria-label="加一" @tap="step(1)">+</button>
  </view>
</template>

<style scoped>
.stepper { display: flex; align-items: center; gap: 12px; }
.stepper.lg { justify-content: center; gap: 24px; }
.sbtn { margin: 0; width: 44px; height: 44px; line-height: 40px; padding: 0; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); color: var(--ink); font-size: 22px; }
.sbtn::after { border: none; }
.sbtn.off { opacity: 0.35; }
.num { min-width: 56px; text-align: center; font-family: var(--font-number); font-size: 22px; font-weight: 700; color: var(--ink); }
.lg .num { font-size: 40px; }
.unit { margin-left: 2px; font-family: inherit; font-size: 14px; font-weight: 600; }
</style>
