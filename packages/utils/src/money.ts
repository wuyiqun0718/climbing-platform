/** 金额一律用「分」存整数，避免浮点误差；只在展示时转换。 */

export type Cents = number;

export const yuanToCents = (yuan: number): Cents => Math.round(yuan * 100);

/** 整数部分加千分位。不用 toLocaleString：微信小程序安卓的 JS 引擎不一定带完整的 Intl，会出来没有逗号的数 */
const group = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ',');

/** 59900 → ¥599；59950 → ¥599.50；9999900 → ¥99,999；负数 -1250 → -¥12.50 */
export function formatYuan(cents: Cents): string {
  const abs = Math.abs(Math.round(cents));
  const sign = cents < 0 ? '-' : '';
  const fen = abs % 100;
  return `${sign}¥${group(Math.floor(abs / 100))}${fen ? '.' + String(fen).padStart(2, '0') : ''}`;
}

/** 后台图表用的紧凑写法：12800000 分 → 12.8万 */
export function formatYuanCompact(cents: Cents): string {
  const yuan = cents / 100;
  if (yuan >= 10_000) return `${+(yuan / 10_000).toFixed(1)}万`;
  return group(Math.round(yuan));
}

/** 导出用：分 → 元，固定两位小数，不带 ¥ 和千分位。59900 → 599.00；-1250 → -12.50 */
export function centsToYuanText(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
