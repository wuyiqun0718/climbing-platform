import { describe, expect, it } from 'vitest';
import { addMonths, clampDate, formatDot, isDateKey, monthGrid, monthTitle, moveDate } from './datepicker';

describe('monthGrid', () => {
  it('周一开头，6 行 7 列，前后补相邻月份', () => {
    const g = monthGrid('2026-10');
    expect(g).toHaveLength(6);
    expect(g.every(r => r.length === 7)).toBe(true);
    // 2026-10-01 是周四：第一行是 9 月 28 日（周一）到 10 月 4 日
    expect(g[0][0]).toMatchObject({ key: '2026-09-28', day: 28, outside: true });
    expect(g[0][3]).toMatchObject({ key: '2026-10-01', outside: false });
    expect(g[5][6].key).toBe('2026-11-08');
  });
  it('超出 min / max 的格子不能选', () => {
    const g = monthGrid('2026-10', '2026-10-05', '2026-10-23').flat();
    expect(g.find(c => c.key === '2026-10-04')!.disabled).toBe(true);
    expect(g.find(c => c.key === '2026-10-05')!.disabled).toBe(false);
    expect(g.find(c => c.key === '2026-10-23')!.disabled).toBe(false);
    expect(g.find(c => c.key === '2026-10-24')!.disabled).toBe(true);
  });
  it('月初正好是周一时第一格就是 1 号', () => {
    expect(monthGrid('2026-06')[0][0]).toMatchObject({ key: '2026-06-01', outside: false });
  });
});

describe('moveDate', () => {
  it('左右一天、上下一周，能跨月', () => {
    expect(moveDate('2026-10-01', 'ArrowLeft')).toBe('2026-09-30');
    expect(moveDate('2026-10-31', 'ArrowRight')).toBe('2026-11-01');
    expect(moveDate('2026-10-23', 'ArrowUp')).toBe('2026-10-16');
    expect(moveDate('2026-10-28', 'ArrowDown')).toBe('2026-11-04');
  });
  it('PageUp / PageDown 一个月，月底落到短月的最后一天', () => {
    expect(moveDate('2026-03-31', 'PageUp')).toBe('2026-02-28');
    expect(moveDate('2026-10-23', 'PageDown')).toBe('2026-11-23');
  });
  it('Home / End 到这一周的周一 / 周日', () => {
    expect(moveDate('2026-10-23', 'Home')).toBe('2026-10-19');
    expect(moveDate('2026-10-23', 'End')).toBe('2026-10-25');
    expect(moveDate('2026-10-25', 'Home')).toBe('2026-10-19');
  });
  it('夹在 min / max 之间；别的键返回 null', () => {
    expect(moveDate('2026-10-23', 'ArrowRight', undefined, '2026-10-23')).toBe('2026-10-23');
    expect(moveDate('2026-10-02', 'ArrowUp', '2026-10-01')).toBe('2026-10-01');
    expect(moveDate('2026-10-23', 'Enter')).toBeNull();
  });
});

describe('小工具', () => {
  it('isDateKey 只认真实存在的日期', () => {
    expect(isDateKey('2026-02-28')).toBe(true);
    expect(isDateKey('2026-02-30')).toBe(false);
    expect(isDateKey('2026-2-3')).toBe(false);
    expect(isDateKey('')).toBe(false);
  });
  it('addMonths 跨年', () => {
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-31', -2)).toBe('2025-11-30');
  });
  it('clampDate、formatDot、monthTitle', () => {
    expect(clampDate('2026-10-30', undefined, '2026-10-23')).toBe('2026-10-23');
    expect(formatDot('2026-10-23')).toBe('2026.10.23');
    expect(monthTitle('2026-03')).toBe('2026 年 3 月');
  });
});
