import { describe, expect, it } from 'vitest';
import { edgeIndex, stepIndex } from './select';

const opts = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B', disabled: true },
  { value: 'c', label: 'C' },
  { value: 'd', label: 'D', disabled: true },
];

describe('stepIndex', () => {
  it('跳过不能选的项', () => {
    expect(stepIndex(opts, 0, 1)).toBe(2);
    expect(stepIndex(opts, 2, -1)).toBe(0);
  });
  it('到头停住，不绕回', () => {
    expect(stepIndex(opts, 2, 1)).toBe(2);
    expect(stepIndex(opts, 0, -1)).toBe(0);
  });
  it('还没高亮时往下从头找、往上从尾找', () => {
    expect(stepIndex(opts, -1, 1)).toBe(0);
    expect(stepIndex(opts, -1, -1)).toBe(2);
  });
  it('没有选项', () => {
    expect(stepIndex([], -1, 1)).toBe(-1);
  });
});

describe('edgeIndex', () => {
  it('第一个和最后一个能选的', () => {
    expect(edgeIndex(opts, 'first')).toBe(0);
    expect(edgeIndex(opts, 'last')).toBe(2);
    expect(edgeIndex([{ value: 'x', label: 'X', disabled: true }], 'first')).toBe(-1);
  });
});
