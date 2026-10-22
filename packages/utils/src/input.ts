/**
 * 数字输入框的值转数字，空的返回 undefined（选填就是不填，必填的交给校验报错）。
 * <input type="number" v-model> 的值不一定是字符串：Vue 对 type="number" 会自动转数字，
 * 没填或填的不是数字时又是字符串，所以两种都要接。
 */
export function numberInput(v: string | number | null | undefined): number | undefined {
  if (typeof v === 'number') return v;
  const s = (v ?? '').trim();
  return s === '' ? undefined : Number(s);
}
