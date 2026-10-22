import type { PageKey } from './permissions';

/**
 * 侧栏图标：24×24 线性图标的 SVG 内容，stroke 用 currentColor，粗细和端点在 App.vue 的 .nav-ic 上统一设。
 * 原型有的（看板、财务、会员、课程、活动、入场、卡种、操作日志）照抄 prototype/js/ui.js 的 ICONS；
 * 员工、设置、前台平板原型侧栏没有，按同一个画法补。
 */
export const NAV_ICONS: Record<PageKey | 'desk', string> = {
  dashboard: '<path d="M4 20V11M10 20V5M16 20v-7M3 20h18"/>',
  finance: '<path d="m7 4 5 7 5-7M6.5 11.5h11M6.5 15.5h11M12 11v9"/>',
  members: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c0-3.6 2.9-5.6 6.5-5.6s6.5 2 6.5 5.6M15.5 5a3.5 3.5 0 0 1 0 7M18 14.6c2 .6 3.5 2.4 3.5 5.4"/>',
  courses: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  events: '<path d="M5.5 21V4M5.5 4.5h11l-2.2 4 2.2 4h-11"/>',
  entries: '<path d="M13.5 3.5h5a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1h-5M9.5 16.5 14 12 9.5 7.5M14 12H3.5"/>',
  products: '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1 1 0 0 1 0 1.4l-7 7a1 1 0 0 1-1.4 0z"/><circle cx="8" cy="8" r="1.5"/>',
  staff: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><circle cx="12" cy="10" r="2.8"/><path d="M8 17c.6-2 2.1-3 4-3s3.4 1 4 3"/>',
  audit: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  desk: '<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M11 18h2"/>',
};
