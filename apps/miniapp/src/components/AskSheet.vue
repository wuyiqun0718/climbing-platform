<script setup lang="ts">
import Sheet from '@climb/ui-mp/Sheet.vue';
import { answer, askState } from '../lib/ask';

// 输入事件有节流（H5 是 100ms），打完字马上点确定会丢最后几个字；点按钮前输入框先失焦，失焦时把完整内容记下
// 模板里 input 按网页的 input 定类型，事件实际是 uni 的，带 detail.value
const valueOf = (e: Event) => (e as unknown as { detail: { value: string } }).detail.value;
const onBlur = (e: Event) => { askState.value = valueOf(e); };
const onDone = (e: Event) => { onBlur(e); answer(true); };
</script>

<template>
  <Sheet :open="askState.open" v-bind="askState.opts" @confirm="answer(true)" @cancel="answer(false)" @choose="i => answer(true, i)">
    <input
      v-if="askState.opts.placeholder !== undefined"
      v-model="askState.value"
      class="field"
      :placeholder="askState.opts.placeholder"
      placeholder-class="ph"
      maxlength="30"
      :focus="askState.open"
      confirm-type="done"
      @blur="onBlur"
      @confirm="onDone"
    />
  </Sheet>
</template>

<style scoped>
.field { height: 46px; margin-top: 14px; padding: 0 12px; border: var(--stroke) solid var(--ink); border-radius: var(--radius-sm); background: var(--surface); font-size: 15px; color: var(--ink); }
.ph { color: var(--ink-muted); }
</style>
