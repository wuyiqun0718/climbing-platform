import { describe, expect, it } from 'vitest';
import { createLatest, entriesCompare, funnelSteps, newcomerTotals, pct } from './dashboard';

describe('今日入场对比', () => {
  // 2026-10-21 是周三
  it('多了、少了、持平', () => {
    expect(entriesCompare('2026-10-21', 45, 41)).toEqual({ diff: 4, text: '比上周三同一时段多 4 人次' });
    expect(entriesCompare('2026-10-21', 33, 35)).toEqual({ diff: -2, text: '比上周三同一时段少 2 人次' });
    expect(entriesCompare('2026-10-21', 10, 10)).toEqual({ diff: 0, text: '跟上周三同一时段持平' });
  });
});

describe('createLatest', () => {
  const later = <T>(v: T, ms: number, fail = false) => new Promise<T>((res, rej) => setTimeout(() => (fail ? rej(v) : res(v)), ms));

  it('先发的请求晚回来算过期', async () => {
    const run = createLatest();
    const a = run(() => later('a', 20));
    const b = run(() => later('b', 5));
    expect(await b).toEqual({ stale: false, ok: true, value: 'b' });
    expect(await a).toEqual({ stale: true });
  });

  it('最后一次的错误照常返回，过期的错误忽略', async () => {
    const run = createLatest();
    const a = run(() => later('x', 5, true));
    const b = run(() => later('y', 10, true));
    expect(await a).toEqual({ stale: true });
    expect(await b).toEqual({ stale: false, ok: false, error: 'y' });
  });
});

describe('新客和老带新', () => {
  it('pct 分母为 0 时是 0', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(0, 0)).toBe(0);
  });

  it('新客合计', () => {
    expect(newcomerTotals([
      { source: 'walkin', visitors: 10, bought: 3 },
      { source: 'referral', visitors: 4, bought: 2 },
    ])).toEqual({ visitors: 14, bought: 5 });
  });

  it('漏斗：条长相对发出，转化率相对上一步', () => {
    expect(funnelSteps({ sent: 50, claimed: 40, visited: 30, bought: 12 })).toEqual([
      { label: '发出邀请', value: 50, width: 100, rate: null },
      { label: '朋友领取', value: 40, width: 80, rate: 80 },
      { label: '到店体验', value: 30, width: 60, rate: 75 },
      { label: '办卡', value: 12, width: 24, rate: 40 },
    ]);
    expect(funnelSteps({ sent: 0, claimed: 0, visited: 0, bought: 0 }).map(s => [s.width, s.rate])).toEqual([[0, null], [0, 0], [0, 0], [0, 0]]);
  });
});
