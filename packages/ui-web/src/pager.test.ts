import { describe, expect, it } from 'vitest';
import { clampPage, pageCount, pageItems } from './pager';

describe('pageCount', () => {
  it('没有数据也算 1 页', () => {
    expect(pageCount(0, 20)).toBe(1);
  });
  it('向上取整', () => {
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
  });
});

describe('clampPage', () => {
  it('夹到范围内', () => {
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(9, 5)).toBe(5);
    expect(clampPage(3, 5)).toBe(3);
    expect(clampPage(Number.NaN, 5)).toBe(1);
  });
});

describe('pageItems', () => {
  it('页数少时全部显示', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('靠前时只省略右边', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
    expect(pageItems(4, 20)).toEqual([1, 2, 3, 4, 5, '…', 20]);
  });
  it('中间两边都省略', () => {
    expect(pageItems(10, 20)).toEqual([1, '…', 9, 10, 11, '…', 20]);
    expect(pageItems(5, 20)).toEqual([1, '…', 4, 5, 6, '…', 20]);
  });
  it('靠后时只省略左边', () => {
    expect(pageItems(20, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
    expect(pageItems(17, 20)).toEqual([1, '…', 16, 17, 18, 19, 20]);
  });
  it('按钮数固定，当前页总在里面', () => {
    for (let p = 1; p <= 30; p++) {
      const items = pageItems(p, 30);
      expect(items).toHaveLength(7);
      expect(items).toContain(p);
    }
  });
});
