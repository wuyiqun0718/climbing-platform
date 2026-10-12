/**
 * 设计变量。每个岩馆在 gyms/<id> 里提供自己的一套 Theme，
 * 小程序和后台都通过 CSS 变量使用，组件里不写死颜色。
 */

export interface Theme {
  /** 品牌主色（按钮、选中态） */
  brand: string;
  /** 主色上的文字颜色，要保证对比度 */
  onBrand: string;
  brandStrong: string;
  brandSoft: string;
  /** 辅助色，比如次卡、老带新卡片的底色 */
  accent: string;
  accentSoft: string;
  neutral: string;
  neutralSoft: string;
  ink: string;
  inkMuted: string;
  surface: string;
  page: string;
  line: string;
  /** 图表品类色，顺序固定，不要循环取色 */
  chart: readonly string[];
  fontDisplay: string;
  fontNumber: string;
  radius: { sm: number; md: number; lg: number };
  /** 描边粗细；BENCHMARK 的风格是 2px 黑描边 */
  stroke: number;
}

/** 没有专门设计的岩馆先用这一套 */
export const defaultTheme: Theme = {
  brand: '#2f6f5e',
  onBrand: '#ffffff',
  brandStrong: '#1f4c40',
  brandSoft: '#e3efeb',
  accent: '#e9d1ad',
  accentSoft: '#f6ead8',
  neutral: '#c4c3c8',
  neutralSoft: '#ebebee',
  ink: '#000000',
  inkMuted: '#6e6e66',
  surface: '#ffffff',
  page: '#f3f4ee',
  line: '#e6e6de',
  chart: ['#6f8424', '#2a78d6', '#d39a3a', '#7b5aa6', '#c2553a'],
  fontDisplay: '-apple-system, "PingFang SC", sans-serif',
  fontNumber: '-apple-system, "PingFang SC", sans-serif',
  radius: { sm: 10, md: 14, lg: 18 },
  stroke: 2,
};

export function defineTheme(overrides: Partial<Theme>): Theme {
  return { ...defaultTheme, ...overrides, radius: { ...defaultTheme.radius, ...overrides.radius } };
}

const kebab = (s: string) => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

/** 转成 CSS 变量：--brand、--brand-soft、--chart-1、--radius-md …… */
export function toCssVars(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme)) {
    if (typeof v === 'string') vars[`--${kebab(k)}`] = v;
  }
  theme.chart.forEach((c, i) => (vars[`--chart-${i + 1}`] = c));
  for (const [k, v] of Object.entries(theme.radius)) vars[`--radius-${k}`] = `${v}px`;
  vars['--stroke'] = `${theme.stroke}px`;
  return vars;
}

/** 小程序页面根节点用 style 字符串挂变量（小程序没有 :root） */
export function toCssVarString(theme: Theme): string {
  return Object.entries(toCssVars(theme)).map(([k, v]) => `${k}:${v}`).join(';');
}
