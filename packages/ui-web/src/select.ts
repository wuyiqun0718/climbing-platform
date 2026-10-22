export interface SelectOption<V extends string = string> {
  value: V;
  label: string;
  disabled?: boolean;
}

/**
 * 键盘上下移动高亮：从 from 往 step 方向找下一个能选的项，到头停住不绕回。
 * from 为 -1 表示还没高亮，往下从第一项找、往上从最后一项找。找不到返回 from。
 */
export function stepIndex(options: readonly SelectOption[], from: number, step: 1 | -1): number {
  let i = from < 0 ? (step === 1 ? 0 : options.length - 1) : from + step;
  for (; i >= 0 && i < options.length; i += step) {
    if (!options[i].disabled) return i;
  }
  return from;
}

/** Home / End：第一个或最后一个能选的项，没有返回 -1 */
export function edgeIndex(options: readonly SelectOption[], end: 'first' | 'last'): number {
  return end === 'first' ? stepIndex(options, -1, 1) : stepIndex(options, -1, -1);
}
