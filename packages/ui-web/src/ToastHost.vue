<script setup lang="ts">
/** 显示 useToast() 发出的提示。App 根部放一个就够了。 */
import { useToast } from './toast';

const toast = useToast();
const ICON = { success: '✓', error: '!', info: 'i' } as const;
</script>

<template>
  <Teleport to="body">
    <div class="host">
      <!-- 成功和普通提示礼貌播报，失败的立即播报 -->
      <div class="stack" role="status" aria-live="polite">
        <template v-for="t in toast.items" :key="t.id">
          <div v-if="t.kind !== 'error'" class="toast" :class="t.kind">
            <span class="icon" aria-hidden="true">{{ ICON[t.kind] }}</span>
            <span class="text">{{ t.text }}</span>
            <button type="button" class="x" aria-label="关闭提示" @click="toast.dismiss(t.id)">×</button>
          </div>
        </template>
      </div>
      <div class="stack" role="alert" aria-live="assertive">
        <template v-for="t in toast.items" :key="t.id">
          <div v-if="t.kind === 'error'" class="toast error">
            <span class="icon" aria-hidden="true">{{ ICON.error }}</span>
            <span class="text">{{ t.text }}</span>
            <button type="button" class="x" aria-label="关闭提示" @click="toast.dismiss(t.id)">×</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.host {
  position: fixed;
  top: 16px;
  left: 50%;
  z-index: 200;
  display: grid;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  transform: translateX(-50%);
  pointer-events: none;
}
.stack { display: grid; gap: 8px; }
.toast {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 14px;
  font-size: 14px;
  color: var(--ink);
  background: var(--surface);
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-md);
  pointer-events: auto;
}
.icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  font-size: 13px;
  font-weight: 700;
  border-radius: 50%;
}
.success .icon { color: var(--on-brand); background: var(--brand); }
.info .icon { background: var(--neutral-soft); }
.error { background: var(--accent-soft); }
.error .icon { color: var(--surface); background: var(--ink); }
.text { flex: 1; }
.x { width: 28px; height: 28px; font-size: 18px; color: var(--ink-muted); background: none; border: 0; border-radius: var(--radius-sm); cursor: pointer; }
.x:hover { color: var(--ink); }
</style>
