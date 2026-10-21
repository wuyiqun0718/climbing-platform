/**
 * 小程序端的字体（uni.loadFontFace 从网络加载，小程序不能用本地 @font-face）。
 * 文件由 scripts/subset-fonts.mjs 生成在 apps/miniapp/fonts/，只含页面用到的字；页面加了新的标题文字要重跑。
 * H5 不用这里，直接打包 @fontsource 的分片（src/styles/fonts.h5.css）。
 *
 * TODO：把 apps/miniapp/fonts/ 里的文件上传到馆方腾讯云 COS，换成正式地址，
 * 并在小程序后台「开发管理 → 服务器域名」把这个域名加进 downloadFile 合法域名。
 */
export const FONT_BASE = 'https://fonts.example.com/climb';

/** family 要和主题里的 fontDisplay / fontNumber 写的字体名一致 */
export const MP_FONTS = [
  { family: 'ZCOOL QingKe HuangYou', file: 'zcool-qingke-huangyou.woff2', weight: '400' },
  { family: 'Bricolage Grotesque', file: 'bricolage-grotesque.woff2', weight: '500 800' },
] as const;
