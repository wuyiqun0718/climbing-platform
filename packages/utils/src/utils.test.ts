import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, endOfMonth, formatDotTime, formatYuan, formatYuanCompact, maskPhone } from './index';

describe('date', () => {
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
