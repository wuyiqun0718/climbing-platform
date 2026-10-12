/** 金额一律用「分」存整数，避免浮点误差；只在展示时转换。 */

export type Cents = number;

export const yuanToCents = (yuan: number): Cents => Math.round(yuan * 100);

/** 59900 → ¥599；59950 → ¥599.50 */
export function formatYuan(cents: Cents): string {
  const yuan = cents / 100;
  const digits = Number.isInteger(yuan) ? 0 : 2;
  return '¥' + yuan.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 后台图表用的紧凑写法：12800000 分 → 12.8万 */
export function formatYuanCompact(cents: Cents): string {
  const yuan = cents / 100;
  if (yuan >= 10_000) return `${+(yuan / 10_000).toFixed(1)}万`;
  return Math.round(yuan).toLocaleString('zh-CN');
}
