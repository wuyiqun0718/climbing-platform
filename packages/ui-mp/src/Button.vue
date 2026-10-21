<script setup lang="ts">
/** 全站按钮：底色靠 variant，禁用态写在宿主 class 上（uni-h5 的 disabled 会落在内部，只写 [disabled] 不生效） */
const props = withDefaults(defineProps<{
  variant?: 'default' | 'primary' | 'dark' | 'ghost' | 'off';
  disabled?: boolean;
  block?: boolean;
  mini?: boolean;
  /** 小程序开放能力：share、getPhoneNumber、agreePrivacyAuthorization 等 */
  openType?: string;
}>(), { variant: 'default', disabled: false, block: false, mini: false });

const emit = defineEmits<{
  tap: [e: unknown];
  click: [e: unknown];
  // 微信回传 code；参数类型由调用方按需收窄
  getphonenumber: [e: any];
}>();

function onTap(e: unknown) {
  if (props.disabled) return;
  emit('tap', e);
  emit('click', e);
}
</script>

<template>
  <button
    class="btn"
    :class="[variant, { block, mini, 'is-disabled': disabled }]"
    :size="mini ? 'mini' : 'default'"
    :disabled="disabled"
    :open-type="openType"
    @tap="onTap"
    @getphonenumber="emit('getphonenumber', $event)"
  ><slot /></button>
</template>

<style scoped>
.btn {
  margin: 0;
  border: var(--stroke) solid var(--ink);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--ink);
  font-size: 15px;
  font-weight: 600;
}
.btn::after { border: none; }
.btn.block { width: 100%; }
.btn.mini { font-size: 13px; }
.btn.primary { background: var(--brand); color: var(--on-brand); }
.btn.dark { background: var(--ink); color: var(--surface); }
.btn.ghost { background: var(--brand-soft); }
.btn.off { color: var(--ink-muted); }
.btn.is-disabled { opacity: 0.45; }
</style>
