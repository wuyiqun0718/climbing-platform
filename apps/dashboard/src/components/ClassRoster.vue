<script setup lang="ts">
/**
 * 团课名单（任务 27），用 v-model:open 打开某节课：已约的签到、标缺席、帮会员取消（要写原因），候补按排队先后，取消作废的放最后。
 * 迟到算不算缺席、取消退次和候补递补都由接口按 @climb/core 的 classRoster.ts / classes.ts 判断，这里只负责显示和提交。
 */
import type { ClassRosterView, RosterRow } from '@climb/api';
import { ConfirmButton, DataTable, Modal, errorText, useToast, type Column, UiButton } from '@climb/ui-web';
import { formatDot, formatDotTime } from '@climb/utils';
import { computed, ref, watch } from 'vue';
import { api } from '../api';
import { canDo } from '../permissions';
import { session } from '../session';

const props = defineProps<{ open: boolean; sessionId: string | null }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; changed: [] }>();

const toast = useToast();
const data = ref<ClassRosterView | null>(null);
const error = ref('');
const loading = ref(false);
const busy = ref<string | null>(null);

const can = (a: 'class.attend' | 'class.cancelBooking') => !!session.state.staff && canDo(session.state.staff.role, a);

async function load() {
  if (!props.sessionId) return;
  loading.value = true;
  error.value = '';
  try {
    data.value = await api.classes.roster(props.sessionId);
  } catch (e) {
    error.value = errorText(e, '名单加载失败');
  } finally {
    loading.value = false;
  }
}
watch(() => [props.open, props.sessionId], () => props.open && load(), { immediate: true });

const STATUS_TEXT: Record<RosterRow['status'], string> = { booked: '已约', waitlisted: '候补', attended: '到了', absent: '缺席', cancelled: '已取消', voided: '课取消了' };
const columns: Column<RosterRow>[] = [
  { key: 'memberName', label: '会员', format: r => r.memberName || '（没填名字）' },
  { key: 'phoneMasked', label: '手机号', num: true, align: 'left' },
  { key: 'cardRemaining', label: '课包剩余', num: true, format: r => (r.cardRemaining === null ? '—' : `${r.cardRemaining} 次`) },
  { key: 'status', label: '状态', format: r => STATUS_TEXT[r.status] },
  { key: 'actions', label: '' },
];
const waitColumns: Column<RosterRow & { position: number }>[] = [{ key: 'position', label: '排第几', num: true }, ...(columns.slice(0, 3) as Column<RosterRow & { position: number }>[])];

async function attend(r: RosterRow, present: boolean) {
  if (busy.value) return;
  busy.value = r.id;
  try {
    const res = await api.bookings.attend(r.id, { present });
    toast.success(present ? (res.late ? `${r.memberName} 迟到超过宽限，按缺席算` : `${r.memberName} 已签到`) : `${r.memberName} 标为缺席`);
    await load();
    emit('changed');
  } catch (e) {
    toast.error(errorText(e, '操作失败，请重试'));
  } finally {
    busy.value = null;
  }
}

const cancelAction = (r: RosterRow) => async (reason: string) => {
  const res = await api.bookings.cancel(r.id, { reason });
  toast.success(`已取消，退回 ${r.deducted} 次${res.promoted.length ? `；候补 ${res.promoted.map(p => p.memberName).join('、')} 补上了` : ''}`);
};
async function onCancelled() {
  await load();
  emit('changed');
}

const title = computed(() => (data.value ? `${data.value.session.name} ${formatDot(data.value.session.on)} ${data.value.session.startTime}` : '名单'));
</script>

<template>
  <Modal :open="open" :title="title" width="720px" @update:open="v => emit('update:open', v)">
    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <template v-if="data">
      <p class="note">已约 {{ data.session.booked }} / {{ data.session.capacity }}，候补 {{ data.session.waitlisted }}。开课后超过迟到宽限才到的按缺席算，次数不退。</p>
      <DataTable :columns="columns" :rows="data.booked" row-key="id" :loading="loading" empty="还没人约">
        <template #cell-status="{ row }">
          <span class="status">{{ STATUS_TEXT[row.status] }}<small v-if="row.attendedAt">{{ formatDotTime(row.attendedAt) }} {{ row.attendedByName ?? '' }}</small></span>
        </template>
        <template #cell-actions="{ row }">
          <span v-if="data.session.status !== 'cancelled'" class="actions">
            <template v-if="can('class.attend')">
              <UiButton variant="link" :disabled="busy !== null || row.status === 'attended'" @click="attend(row, true)">签到</UiButton>
              <UiButton variant="link" :disabled="busy !== null || row.status === 'absent'" @click="attend(row, false)">缺席</UiButton>
            </template>
            <ConfirmButton
              v-if="can('class.cancelBooking') && row.status === 'booked'"
              label="帮他取消"
              title="帮会员取消这节课"
              variant="link"
              danger
              :message="`退回 ${row.deducted} 次；候补第一位会自动补上并扣次。`"
              :action="cancelAction(row)"
              @done="onCancelled"
            />
          </span>
        </template>
      </DataTable>
      <h3>候补</h3>
      <DataTable :columns="waitColumns" :rows="data.waitlist" row-key="id" empty="没有候补" />
      <template v-if="data.closed.length">
        <h3>取消了的</h3>
        <DataTable :columns="columns.slice(0, 4)" :rows="data.closed" row-key="id">
          <template #cell-status="{ row }">
            <span class="status">{{ STATUS_TEXT[row.status] }}<small v-if="row.attendedAt">{{ formatDotTime(row.attendedAt) }} {{ row.attendedByName ?? '' }}</small></span>
          </template>
        </DataTable>
      </template>
    </template>
  </Modal>
</template>

<style scoped>
.note { margin: 0 0 12px; font-size: 13px; color: var(--ink-muted); }
h3 { margin: 16px 0 8px; font-size: 14px; }
.status { display: grid; white-space: normal; }
.status small { font-size: 12px; color: var(--ink-muted); }
.actions { display: inline-flex; gap: 10px; white-space: nowrap; }
.err { margin: 0 0 12px; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
