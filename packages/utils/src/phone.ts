/** 手机号脱敏：13812345678 → 138****5678；不是 11 位的原样返回中间打码 */
export function maskPhone(phone: string): string {
  if (phone.length === 11) return `${phone.slice(0, 3)}****${phone.slice(7)}`;
  if (phone.length <= 4) return '*'.repeat(phone.length);
  return `${phone.slice(0, 2)}${'*'.repeat(phone.length - 4)}${phone.slice(-2)}`;
}
