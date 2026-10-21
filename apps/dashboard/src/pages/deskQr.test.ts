import { ApiError, type DeskQr } from '@climb/api';
import { describe, expect, it } from 'vitest';
import { DESK_POLL_MS, createDeskQrPoller, deskQrDisplay } from './deskQr';

const t0 = Date.parse('2026-10-21T04:00:00.000Z');
const qr = (issued: number, token = 't1'): DeskQr => ({
  storeId: 'bingang', storeName: '滨港店', kind: 'link', content: `https://x?s=bingang&t=${token}`, imageUrl: null, token,
  issuedAt: new Date(issued).toISOString(), refreshAt: new Date(issued + 30_000).toISOString(), expiresAt: new Date(issued + 180_000).toISOString(),
  serverTime: new Date(issued).toISOString(), today: '2026-10-21',
});

describe('平板显示', () => {
  it('倒计时按服务器时间：本机慢了 10 秒也按服务器算', () => {
    const local = t0 - 10_000;
    expect(deskQrDisplay({ qr: qr(t0), offsetMs: 10_000, error: null }, local + 5_000)).toMatchObject({ kind: 'show', secondsLeft: 25 });
  });

  it('断网（拉取失败）不再显示旧码；401 提示重新绑定；码过期了也不显示', () => {
    expect(deskQrDisplay({ qr: qr(t0), offsetMs: 0, error: new TypeError('Failed to fetch') }, t0)).toEqual({ kind: 'offline' });
    expect(deskQrDisplay({ qr: qr(t0), offsetMs: 0, error: new ApiError(500, null) }, t0)).toEqual({ kind: 'offline' });
    expect(deskQrDisplay({ qr: null, offsetMs: 0, error: new ApiError(401, null) }, t0)).toEqual({ kind: 'unbound' });
    expect(deskQrDisplay({ qr: qr(t0), offsetMs: 0, error: null }, t0 + 180_000)).toEqual({ kind: 'offline' });
    expect(deskQrDisplay({ qr: null, offsetMs: 0, error: null }, t0)).toEqual({ kind: 'loading' });
  });
});

describe('平板轮询', () => {
  function harness(responses: (() => Promise<DeskQr>)[]) {
    const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
    const states: unknown[] = [];
    let calls = 0;
    const poller = createDeskQrPoller({
      fetch: () => responses[Math.min(calls++, responses.length - 1)]!(),
      onState: s => states.push(s),
      now: () => t0,
      setTimer: (fn, ms) => {
        const t = { fn, ms, cleared: false };
        timers.push(t);
        return t;
      },
      clearTimer: t => {
        (t as { cleared: boolean }).cleared = true;
      },
    });
    return { poller, timers, states, calls: () => calls };
  }
  const flush = () => new Promise(r => setTimeout(r, 0));

  it('拉到后按换码时间提前拉，最多隔 5 秒；记下服务器时差', async () => {
    const h = harness([() => Promise.resolve({ ...qr(t0 - 27_000), serverTime: new Date(t0 + 2_000).toISOString() })]);
    h.poller.start();
    await flush();
    expect(h.states.at(-1)).toMatchObject({ offsetMs: 2_000, error: null });
    expect(h.timers.at(-1)!.ms).toBe(1_000);
    h.poller.stop();
  });

  it('失败了记下错误，隔 5 秒再试；恢复后清掉错误', async () => {
    const h = harness([() => Promise.reject(new TypeError('offline')), () => Promise.resolve(qr(t0))]);
    h.poller.start();
    await flush();
    expect(h.states.at(-1)).toMatchObject({ error: expect.any(TypeError) });
    expect(h.timers.at(-1)!.ms).toBe(DESK_POLL_MS);
    h.timers.at(-1)!.fn();
    await flush();
    expect(h.states.at(-1)).toMatchObject({ error: null, qr: { token: 't1' } });
    h.poller.stop();
  });

  it('离开页面（stop）后不再拉：清掉定时器，在路上的请求回来也不管', async () => {
    let resolve!: (v: DeskQr) => void;
    const h = harness([() => Promise.resolve(qr(t0)), () => new Promise<DeskQr>(r => (resolve = r))]);
    h.poller.start();
    await flush();
    h.timers.at(-1)!.fn();
    h.poller.stop();
    expect(h.timers.every(t => t.cleared || t !== h.timers.at(-1))).toBe(true);
    const before = h.states.length;
    resolve(qr(t0 + 30_000, 't2'));
    await flush();
    expect(h.states).toHaveLength(before);
    expect(h.timers).toHaveLength(1);
    expect(h.calls()).toBe(2);
  });
});
