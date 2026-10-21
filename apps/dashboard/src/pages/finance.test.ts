import { describe, expect, it } from 'vitest';
import { presetRange } from './finance';

describe('财务快捷日期', () => {
  it('本月、上月、近 30 天', () => {
    expect(presetRange('month', '2026-10-21')).toEqual({ from: '2026-10-01', to: '2026-10-21' });
    expect(presetRange('lastMonth', '2026-10-21')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(presetRange('lastMonth', '2026-01-05')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(presetRange('last30', '2026-10-21')).toEqual({ from: '2026-09-22', to: '2026-10-21' });
  });
});
