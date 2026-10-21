<script setup lang="ts">
import Sheet from '@climb/ui-mp/Sheet.vue';
import { answer, askState } from '../lib/ask';
</script>

<template>
  <Sheet :open="askState.open" v-bind="askState.opts" @confirm="answer(true)" @cancel="answer(false)" />
</template>
