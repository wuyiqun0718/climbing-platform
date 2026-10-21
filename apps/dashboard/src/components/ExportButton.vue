<script setup lang="ts" generic="K extends ExportKind">
/**
 * 导出按钮（任务 24）：把当前页面的筛选原样交给 POST /admin/exports/:kind，拿到下载地址后直接下载。
 * 导出什么、手机号打不打码、门店权限都由接口按列表同一套规则定；没有导出权限（permissions.ts 的 data.export）不显示。
 */
import type { ExportFilters, ExportKind } from '@climb/api';
import { errorText, useToast, UiButton } from '@climb/ui-web';
import { computed, ref } from 'vue';
import { api } from '../api';
import { canDo } from '../permissions';
import { session } from '../session';

const props = defineProps<{ kind: K; filters: ExportFilters[K]; label?: string; disabled?: boolean }>();

const toast = useToast();
const busy = ref(false);
const can = computed(() => !!session.state.staff && canDo(session.state.staff.role, 'data.export'));

async function run() {
  if (busy.value) return;
  busy.value = true;
  try {
    const r = await api.exports.create(props.kind, props.filters);
    const a = document.createElement('a');
    a.href = r.url;
    a.download = r.fileName;
    a.click();
    toast.success(`已导出 ${r.rows} 行`);
  } catch (e) {
    toast.error(errorText(e, '导出失败，请重试'));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <UiButton v-if="can" :disabled="busy || disabled" @click="run">{{ busy ? '导出中…' : (label ?? '导出 Excel') }}</UiButton>
</template>
