// 线稿图标：用作 CSS mask，颜色跟着 currentColor 走（小程序不支持内联 svg 标签）
const svg = (paths: string) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${paths}</svg>`,
  )}")`;

export const ICONS = {
  scan: svg("<path d='M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M3 12h18'/>"),
  card: svg("<rect x='2' y='5' width='20' height='14' rx='2'/><path d='M2 10h20M6 15h4'/>"),
  calendar: svg("<rect x='3' y='4' width='18' height='17' rx='2'/><path d='M3 9h18M8 2v4M16 2v4'/>"),
  person: svg("<circle cx='12' cy='8' r='4'/><path d='M4 21c0-4 3.6-6 8-6s8 2 8 6'/>"),
  list: svg("<path d='M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01'/>"),
  shield: svg("<path d='M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z'/><path d='M8.5 12l2.5 2.5 4.5-5'/>"),
  clock: svg("<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>"),
  flag: svg("<path d='M5 21V3M5 4h12l-2.5 4L17 12H5'/>"),
};

export type IconName = keyof typeof ICONS;

/** 给一个 view 用的 mask 样式；底色在样式里写 currentColor */
export const iconStyle = (name: IconName) => ({ maskImage: ICONS[name], WebkitMaskImage: ICONS[name] });
