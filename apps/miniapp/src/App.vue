<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';
// #ifdef MP-WEIXIN
import { FONT_BASE, MP_FONTS } from './config/fonts';
// #endif

onLaunch(() => {
  // 登录、拉取会员信息等启动逻辑放这里

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
