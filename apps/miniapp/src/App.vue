<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
import { run } from './api';
import { member } from './stores';
// #ifdef MP-WEIXIN
import { FONT_BASE, MP_FONTS } from './config/fonts';
// #endif

onLaunch(() => {
  // 登录（任务 7）做好后先登录再拉。失败只提示，页面 onLoad 里 ensureLoaded 会再试
  run(() => member.load(), { loading: false }).catch(() => {});

  // #ifdef MP-WEIXIN
  // 标题和数字字体；加载失败就用系统字体，不影响使用
  for (const f of MP_FONTS) {
    uni.loadFontFace({
      global: true,
      family: f.family,
      source: `url("${FONT_BASE}/${f.file}")`,
      desc: { style: 'normal', variant: 'normal', weight: f.weight },
      fail: e => console.warn(`字体 ${f.family} 加载失败`, e),
    });
  }
  // #endif
});
</script>

<style>
/* 主题变量由 scripts/prepare-gym.mjs 按岩馆生成，挂在 page 上，页面和组件直接用 var(--brand) 等 */
@import './styles/theme.css';

page {
  min-height: 100%;
  background: var(--page);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
}
</style>
