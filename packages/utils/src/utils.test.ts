import { describe, expect, it } from 'vitest';
import { addDays, addMonths, isDateKey, daysBetween, endOfMonth, formatDotTime, formatYuan, formatYuanCompact, maskPhone, numberInput } from './index';

describe('numberInput', () => {
  it('Vue 给 type="number" 的是数字，原样返回', () => {
    expect(numberInput(365)).toBe(365);
    expect(numberInput(0)).toBe(0);
  });
  it('字符串去空格转数字，空的返回 undefined', () => {
    expect(numberInput(' 12 ')).toBe(12);
    expect(numberInput('')).toBeUndefined();
    expect(numberInput('  ')).toBeUndefined();
    expect(numberInput(null)).toBeUndefined();
  });
  it('不是数字的交给校验（NaN）', () => {
    expect(numberInput('abc')).toBeNaN();
  });
});

describe('date', () => {
  it('合法日期：格式对且真实存在', () => {
    expect(isDateKey('2026-10-21')).toBe(true);
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(['2026-02-30', '2026-1-1', '2026/10/21', '', null, 20261021].map(isDateKey)).toEqual([false, false, false, false, false, false]);
  });

  it('跨月加减天数', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('月末和相差天数', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(daysBetween('2026-10-12', '2026-10-31')).toBe(19);
    expect(addMonths('2026-10-12', 6)).toBe('2027-04-12');
  });
  it('ISO 时间按本地时区显示', () => {
    expect(formatDotTime(new Date(2026, 9, 12, 14, 5).toISOString())).toBe('2026.10.12 14:05');
  });
});

describe('money', () => {
  it('按分格式化', () => {
    expect(formatYuan(59900)).toBe('¥599');
    expect(formatYuan(59950)).toBe('¥599.50');
    expect(formatYuan(499900)).toBe('¥4,999');
    expect(formatYuanCompact(12_800_000)).toBe('12.8万');
  });
});

describe('phone', () => {
  it('脱敏中间四位', () => {
    expect(maskPhone('13812345678')).toBe('138****5678');
    expect(maskPhone('021-1234')).toBe('02****34');
  });
});
