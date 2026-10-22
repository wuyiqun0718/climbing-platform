<script setup lang="ts">
/**
 * 新建会员（建档）弹窗，用 v-model:open。校验规则都在 @climb/core 的 member.ts，这里只负责显示。
 * 建好 emit created；手机号已经有档案时显示那个人，点「查看」emit open-existing，由页面决定跳过去还是直接选他（开卡时当场建档用）。
 */
import { MEMBER_SOURCE_TEXT, type MemberDetail, type MemberExistsError } from '@climb/api';
import { DEFAULT_DESK_MEMBER_SOURCE, DESK_MEMBER_SOURCES, MEMBER_NAME_MAX, newMemberErrors, normalizePhone, type MemberSource, type NewMemberErrors } from '@climb/core';
import { Field, Modal, errorText, UiButton, UiSelect } from '@climb/ui-web';
import { computed, ref, useId, watch } from 'vue';
import { api } from '../api';
import { storeOptions } from '../permissions';
import { session } from '../session';
import { badField, memberExists } from './memberForm';

const props = defineProps<{ open: boolean; /** 预填的手机号，比如搜索没找到时带过来 */ phone?: string }>();
const emit = defineEmits<{ 'update:open': [open: boolean]; created: [member: MemberDetail]; 'open-existing': [memberId: string] }>();

const formId = useId();
const phone = ref('');
const name = ref('');
const source = ref<MemberSource>(DEFAULT_DESK_MEMBER_SOURCE);
const storeId = ref('');
const errs = ref<NewMemberErrors>({});
const submitErr = ref('');
const exists = ref<MemberExistsError | null>(null);
const busy = ref(false);

// 建档门店：员工能操作的店；顶部选了单店就默认那家
const SOURCE_OPTIONS = DESK_MEMBER_SOURCES.map(s => ({ value: s, label: MEMBER_SOURCE_TEXT[s] }));
const stores = computed(() => (session.state.staff ? storeOptions(session.state.staff, session.state.stores).filter(o => o.id !== null) : []));

watch(
  () => props.open,
  v => {
    if (!v) return;
    phone.value = props.phone ?? '';
    name.value = '';
    source.value = DEFAULT_DESK_MEMBER_SOURCE;
    storeId.value = session.state.storeId ?? stores.value[0]?.id ?? '';
    errs.value = {};
    submitErr.value = '';
    exists.value = null;
  },
  { immediate: true },
);

const close = () => emit('update:open', false);

async function submit() {
  if (busy.value) return;
  exists.value = null;
  submitErr.value = '';
  errs.value = newMemberErrors({ phone: phone.value, name: name.value, source: source.value }) ?? {};
  if (Object.keys(errs.value).length) return;
  if (!storeId.value) {
    submitErr.value = '请选建档门店';
    return;
  }
  busy.value = true;
  try {
    const m = await api.members.create({ phone: normalizePhone(phone.value), name: name.value.trim(), source: source.value, storeId: storeId.value });
    close();
    emit('created', m);
  } catch (e) {
    exists.value = memberExists(e);
    if (exists.value) return;
    const field = badField(e);
    if (field === 'phone' || field === 'name' || field === 'source') errs.value = { [field]: errorText(e) };
    else submitErr.value = errorText(e, '建档失败，请重试');
  } finally {
    busy.value = false;
  }
}

function openExisting() {
  const id = exists.value?.memberId;
  if (!id) return;
  close();
  emit('open-existing', id);
}
</script>

<template>
  <Modal :open="open" title="新建会员" :busy="busy" :close-on-backdrop="false" @update:open="v => emit('update:open', v)">
    <form :id="formId" class="form" novalidate @submit.prevent="submit">
      <Field label="手机号" required :error="errs.phone" v-slot="f">
        <input
          v-model="phone"
          v-bind="f.attrs"
          type="tel"
          inputmode="numeric"
          maxlength="16"
          autocomplete="off"
          autofocus
          @input="(errs.phone = undefined), (exists = null)"
        />
      </Field>
      <p v-if="exists" class="exists" role="alert">
        <span>{{ exists.message }}</span>
        <UiButton @click="openExisting">查看这个会员</UiButton>
      </p>
      <Field label="名字" hint="可以先不填，会员在小程序里补" :error="errs.name" v-slot="f">
        <input v-model="name" v-bind="f.attrs" :maxlength="MEMBER_NAME_MAX" autocomplete="off" @input="errs.name = undefined" />
      </Field>
      <Field label="来源" required :error="errs.source" v-slot="f">
        <UiSelect v-model="source" v-bind="f.attrs" :options="SOURCE_OPTIONS" />
      </Field>
      <Field label="建档门店" required v-slot="f">
        <UiSelect v-model="storeId" v-bind="f.attrs" :options="stores.map(s => ({ value: s.id!, label: s.name }))" />
      </Field>
      <p v-if="submitErr" class="err" role="alert">{{ submitErr }}</p>
    </form>
    <template #footer>
      <UiButton :disabled="busy" @click="close">取消</UiButton>
      <UiButton variant="primary" type="submit" :form="formId" :disabled="busy">{{ busy ? '提交中…' : '建档' }}</UiButton>
    </template>
  </Modal>
</template>

<style scoped>
.form { display: grid; gap: 14px; }
.exists { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -4px 0 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
.err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
</style>
