import { describe, expect, it } from 'vitest';
import { createLatest, entriesCompare } from './dashboard';

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
