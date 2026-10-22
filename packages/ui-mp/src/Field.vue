<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

/**
 * 单行输入框：44px 高，跟按钮一样高；聚焦时外面一圈主色（原型的样子）；有内容时右边一个 × 清空；
 * error 有值时框下面一行提示，代替一闪而过的 toast。
 * 键盘：手机号用 number（微信里是纯数字键盘），金额用 digit（带小数点），其他 text。
 */
const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'digit';
  maxlength?: number;
  focus?: boolean;
  error?: string;
  confirmType?: 'done' | 'next' | 'send' | 'go' | 'search';
}>(), { placeholder: '', type: 'text', maxlength: 30, focus: false, error: '', confirmType: 'done' });

const emit = defineEmits<{ 'update:modelValue': [value: string]; confirm: [value: string] }>();

const focused = ref(false);
/** 交给 input 的 focus。点了 × 以后再拿回焦点接着打字：input 只在 focus 从假变真时聚焦，所以先放下再拿起 */
const want = ref(props.focus);
watch(() => props.focus, v => (want.value = v));

// 模板里 input 按网页的 input 定类型，事件实际是 uni 的，带 detail.value
const valueOf = (e: Event) => (e as unknown as { detail: { value: string } }).detail.value;
const set = (v: string) => { if (v !== props.modelValue) emit('update:modelValue', v); };
// 输入事件有节流（H5 是 100ms），打完字马上点按钮会丢最后几个字；失焦时把完整内容记下
const onBlur = (e: Event) => { focused.value = false; set(valueOf(e)); };
const onConfirm = (e: Event) => { set(valueOf(e)); emit('confirm', valueOf(e)); };
async function clear() {
  set('');
  want.value = false;
  await nextTick();
  want.value = true;
}
</script>

<template>
  <view class="field-wrap">
    <view class="field" :class="{ on: focused, bad: !!error }">
      <input
        class="input"
        :value="modelValue"
        :type="type"
        :maxlength="maxlength"
        :placeholder="placeholder"
        placeholder-class="ph"
        :focus="want"
        :confirm-type="confirmType"
        @input="e => set(valueOf(e))"
        @focus="focused = true"
        @blur="onBlur"
        @confirm="onConfirm"
      />
      <view v-if="modelValue" class="clear" role="button" aria-label="清空" @tap="clear"><text class="x">×</text></view>
    </view>
    <text v-if="error" class="err" role="alert">{{ error }}</text>
  </view>
</template>

<style scoped>
.field-wrap { width: 100%; }
.field { box-sizing: border-box; display: flex; align-items: center; height: 44px; padding-left: 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); }
/* 原型：聚焦时外面 3px 主色。小程序的 input 是原生组件，阴影画在外面这层上 */
.field.on { box-shadow: 0 0 0 3px var(--brand); }
.field.bad { border-width: 3px; padding-left: 11px; }
.input { flex: 1; min-width: 0; height: 100%; font-size: 15px; color: var(--ink); }
.ph { color: var(--ink-muted); }
/* × 本身 18px，点击区 44×44：比框里面高一点，align-items: center 让它上下各溢出一点 */
.clear { flex-shrink: 0; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; }
.x { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: var(--ink-muted); color: var(--surface); font-size: 14px; line-height: 1; }
.err { display: block; margin-top: 6px; font-size: 13px; font-weight: 600; line-height: 1.5; color: var(--ink); }
</style>
