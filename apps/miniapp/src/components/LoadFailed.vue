<script setup lang="ts">
import Button from '@climb/ui-mp/Button.vue';
import Empty from '@climb/ui-mp/Empty.vue';

/** 拉数据失败：写清楚原因（errorMessage），给一个重试。不要显示成「没有数据」 */
withDefaults(defineProps<{ text: string; title?: string }>(), { title: '没加载出来' });
const emit = defineEmits<{ retry: [] }>();
</script>

<template>
  <Empty :title="title" :text="text">
    <Button mini @tap="emit('retry')">重试</Button>
  </Empty>
</template>
