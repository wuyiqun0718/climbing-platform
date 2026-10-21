<script setup lang="ts">
/**
 * 设置：期限卡冻结规则（任务 17.5）。校验在 @climb/core 的 freezeRulesErrors，规则怎么用在 core 的 freeze.ts，这里只负责显示和保存。
 * 页面只有老板能进（权限 settings 页、settings.freezeRules）。
 */
import { FREEZE_DAYS_LIMIT, freezeRulesErrors, type FreezeRules, type FreezeRulesErrors } from '@climb/core';
import { Field, errorText } from '@climb/ui-web';
import { onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import { badField } from '../components/memberForm';

const form = reactive({ memberSelfService: true, perMonth: 1 as number | '', perYear: '' as number | '', minDays: 1 as number | '', maxDays: 30 as number | '' });
const unlimited = reactive({ perMonth: false, perYear: true });
const errs = ref<FreezeRulesErrors>({});
const loadErr = ref('');
const submitErr = ref('');
const saved = ref(false);
const loading = ref(true);
const busy = ref(false);

function fill(r: FreezeRules) {
  form.memberSelfService = r.memberSelfService;
  form.perMonth = r.perMonth ?? '';
  form.perYear = r.perYear ?? '';
  form.minDays = r.minDays;
  form.maxDays = r.maxDays;
  unlimited.perMonth = r.perMonth === null;
  unlimited.perYear = r.perYear === null;
}

onMounted(async () => {
  try {
    fill(await api.settings.freezeRules());
  } catch (e) {
    loadErr.value = errorText(e, '冻结规则加载失败');
  } finally {
    loading.value = false;
  }
});

// 输入框空着传 null 会被当成「不限」，所以空的传 undefined，让校验报错
const num = (v: number | '') => (v === '' ? undefined : v);

async function submit() {
  if (busy.value) return;
  saved.value = false;
  submitErr.value = '';
  const body = {
    memberSelfService: form.memberSelfService,
    perMonth: unlimited.perMonth ? null : num(form.perMonth),
    perYear: unlimited.perYear ? null : num(form.perYear),
    minDays: num(form.minDays),
    maxDays: num(form.maxDays),
  };
  errs.value = freezeRulesErrors(body) ?? {};
  if (Object.keys(errs.value).length) return;
  busy.value = true;
  try {
    fill(await api.settings.saveFreezeRules(body as FreezeRules));
    saved.value = true;
  } catch (e) {
    const field = badField(e);
    if (field && field in form) errs.value = { [field]: errorText(e) };
    else submitErr.value = errorText(e, '保存失败，请重试');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <h1 class="h">设置</h1>
  <section class="card">
    <h2 class="h2">期限卡冻结</h2>
    <p class="sub">会员在小程序里自己冻结、前台帮会员冻结都按这里的规则。改了只影响以后的冻结。</p>
    <p v-if="loading" class="muted">加载中…</p>
    <p v-else-if="loadErr" class="err" role="alert">{{ loadErr }}</p>
    <form v-else class="form" novalidate @submit.prevent="submit" @input="saved = false">
      <label class="check">
        <input v-model="form.memberSelfService" type="checkbox" />
        <span>会员可以在小程序里自己冻结（关掉就只能找前台办）</span>
      </label>
      <Field label="每月最多冻几次" :error="errs.perMonth" v-slot="f">
        <div class="row">
          <input v-model.number="form.perMonth" v-bind="f.attrs" type="number" min="1" step="1" :disabled="unlimited.perMonth" @input="errs.perMonth = undefined" />
          <label class="check"><input v-model="unlimited.perMonth" type="checkbox" @change="errs.perMonth = undefined" />不限</label>
        </div>
      </Field>
      <Field label="每年最多冻几次" :error="errs.perYear" v-slot="f">
        <div class="row">
          <input v-model.number="form.perYear" v-bind="f.attrs" type="number" min="1" step="1" :disabled="unlimited.perYear" @input="errs.perYear = undefined" />
          <label class="check"><input v-model="unlimited.perYear" type="checkbox" @change="errs.perYear = undefined" />不限</label>
        </div>
      </Field>
      <Field label="每次最少冻几天" :error="errs.minDays" v-slot="f">
        <input v-model.number="form.minDays" v-bind="f.attrs" type="number" min="1" :max="FREEZE_DAYS_LIMIT" step="1" @input="errs.minDays = undefined" />
      </Field>
      <Field label="每次最多冻几天" :error="errs.maxDays" v-slot="f">
        <input v-model.number="form.maxDays" v-bind="f.attrs" type="number" min="1" :max="FREEZE_DAYS_LIMIT" step="1" @input="errs.maxDays = undefined" />
      </Field>
      <p v-if="submitErr" class="err" role="alert">{{ submitErr }}</p>
      <div class="actions">
        <button type="submit" class="btn primary" :disabled="busy">{{ busy ? '保存中…' : '保存' }}</button>
        <span v-if="saved" class="muted" role="status">已保存</span>
      </div>
    </form>
  </section>
</template>

<style scoped>
.h { margin: 0; font-family: var(--font-display); font-size: 34px; font-weight: 400; }
.card { max-width: 520px; margin-top: 20px; padding: 20px; background: var(--surface); border: var(--stroke) solid var(--ink); border-radius: var(--radius-lg); }
.h2 { margin: 0; font-size: 16px; }
.sub { margin: 6px 0 16px; font-size: 13px; color: var(--ink-muted); }
.muted { font-size: 13px; color: var(--ink-muted); }
.form { display: grid; gap: 14px; }
.row { display: flex; align-items: center; gap: 12px; }
/* Field 给插槽里的 input 都设了 width: 100%，这里多一个类压过去，不然「不限」会被挤成两行 */
.form .row input[type='number'] { width: 120px; max-width: 120px; flex: 0 0 120px; }
.form .check input[type='checkbox'] { width: auto; padding: 0; }
.check { display: inline-flex; flex: none; align-items: center; gap: 6px; font-size: 13.5px; white-space: nowrap; }
.err { margin: 0; padding: 9px 12px; font-size: 13px; background: var(--accent-soft); border-radius: var(--radius-sm); }
.actions { display: flex; align-items: center; gap: 12px; }
.btn {
  height: 34px;
  padding: 0 14px;
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--ink);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.btn:disabled { cursor: default; opacity: 0.5; }
.btn.primary { color: var(--on-brand); background: var(--brand); border: var(--stroke) solid var(--ink); }
</style>
