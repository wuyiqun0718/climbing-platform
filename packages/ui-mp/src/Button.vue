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
/* 普通按钮 44px 高，跟原型一致，也够手指点 */
.btn:not(.mini) { height: 44px; line-height: calc(44px - 2 * var(--stroke)); }
.btn.block { width: 100%; }
/* mini 看起来 34px（原型的小按钮），点击区上下各多 5px 凑够 44px；按钮自带 overflow: hidden 会把伪元素裁掉 */
.btn.mini { font-size: 13px; position: relative; overflow: visible; }
.btn.mini::before { content: ''; position: absolute; left: 0; right: 0; top: -5px; bottom: -5px; }
.btn.primary { background: var(--brand); color: var(--on-brand); }
.btn.dark { background: var(--ink); color: var(--surface); }
.btn.ghost { background: var(--brand-soft); }
.btn.off { color: var(--ink-muted); }
.btn.is-disabled { opacity: 0.45; }
</style>
