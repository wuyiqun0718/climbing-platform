import { describe, expect, it } from 'vitest';
import { timeSlots } from './timeSlots';

describe('timeSlots', () => {
  it('营业时间内 15 分钟一档，不含关门那一刻', () => {
    const s = timeSlots('10:00', '23:00');
    expect(s[0]).toBe('10:00');
    expect(s[1]).toBe('10:15');
    expect(s.at(-1)).toBe('22:45');
    expect(s).toHaveLength(52);
  });
  it('不在档上的现有时间也放进去，按时间排', () => {
    const s = timeSlots('10:00', '11:00', '10:10');
    expect(s).toEqual(['10:00', '10:10', '10:15', '10:30', '10:45']);
  });
  it('已经在档上的不重复，乱写的不放', () => {
    expect(timeSlots('10:00', '10:30', '10:15')).toEqual(['10:00', '10:15']);
    expect(timeSlots('10:00', '10:30', '')).toEqual(['10:00', '10:15']);
  });
});
