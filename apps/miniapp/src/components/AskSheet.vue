<script setup lang="ts">
import Field from '@climb/ui-mp/Field.vue';
import Sheet from '@climb/ui-mp/Sheet.vue';
import { answer, askState } from '../lib/ask';
</script>

<template>
  <Sheet :open="askState.open" v-bind="askState.opts" @confirm="answer(true)" @cancel="answer(false)" @choose="i => answer(true, i)">
    <view v-if="askState.opts.placeholder !== undefined" class="ask-field">
      <Field v-model="askState.value" :placeholder="askState.opts.placeholder" :maxlength="30" :focus="askState.open" @confirm="answer(true)" />
    </view>
  </Sheet>
</template>

<style scoped>
.ask-field { margin-top: 14px; }
</style>
