<script setup lang="ts">
import { ref, watch } from 'vue';

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
/** 交给 input 的 focus；点了 × 以后要拿回焦点接着打字 */
const want = ref(props.focus);
watch(() => props.focus, v => (want.value = v));
/** 点 × 时换一个新的 input：H5 的 input 改 value 有 100ms 防抖，节流里没发完的输入会把防抖取消，框里还留着旧字 */
const inputKey = ref(0);

// 模板里 input 按网页的 input 定类型，事件实际是 uni 的，带 detail.value
const valueOf = (e: Event) => (e as unknown as { detail: { value: string } }).detail.value;
const set = (v: string) => { if (v !== props.modelValue) emit('update:modelValue', v); };
// 输入事件有节流（H5 是 100ms），打完字马上点按钮会丢最后几个字；失焦时把完整内容记下
// 打完字马上点 ×：旧 input 节流里还没发出的 input 和失焦的 blur 会比 × 晚到，带着清空前的内容；刚清空的 300ms 里不认它们
let clearedAt = 0;
const late = () => Date.now() - clearedAt < 300;
const onInput = (e: Event) => { if (!late()) set(valueOf(e)); };
const onBlur = (e: Event) => { focused.value = false; if (!late()) set(valueOf(e)); };
const onConfirm = (e: Event) => { set(valueOf(e)); emit('confirm', valueOf(e)); };
function clear() {
  clearedAt = Date.now();
  set('');
  want.value = true;
  inputKey.value++;
}
</script>

<template>
  <view class="field-wrap">
    <view class="field" :class="{ on: focused, bad: !!error }">
      <input
        :key="inputKey"
        class="input"
        :value="modelValue"
        :type="type"
        :maxlength="maxlength"
        :placeholder="placeholder"
        placeholder-class="ph"
        :focus="want"
        :confirm-type="confirmType"
        @input="onInput"
        @focus="focused = true"
        @blur="onBlur"
        @confirm="onConfirm"
      />
      <view v-if="modelValue" class="clear" role="button" aria-label="清空" @tap="clear"><view class="x" /></view>
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
.x { position: relative; width: 18px; height: 18px; border-radius: 50%; background: var(--ink-muted); }
/* × 用两根线画，字符 × 在字体里偏下，圆里不居中 */
.x::before, .x::after { content: ''; position: absolute; left: 4px; top: 8px; width: 10px; height: 2px; border-radius: 1px; background: var(--surface); transform: rotate(45deg); }
.x::after { transform: rotate(-45deg); }
.err { display: block; margin-top: 6px; font-size: 13px; font-weight: 600; line-height: 1.6; color: var(--ink); }
</style>
