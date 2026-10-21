import type { DeskFeed, DeskFeedRow } from '@climb/api';
import { describe, expect, it } from 'vitest';
import { DESK_FEED_POLL_MS, createDeskFeedPoller, type DeskFeedState } from './deskFeed';

const row = (id: string, order: number, seq: number, extra: Partial<DeskFeedRow> = {}): DeskFeedRow => ({
  id, order, seq, at: null, memberName: id, avatarUrl: null, cardName: '月卡', method: 'scan', first: false, voided: false, ...extra,
});
const feed = (today: string, cursor: number, items: DeskFeedRow[]): DeskFeed => ({ storeId: 'bingang', today, cursor, items });
const flush = () => new Promise(r => setTimeout(r, 0));

function harness(answer: (since: number, call: number) => Promise<DeskFeed>) {
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const states: DeskFeedState[] = [];
  const sinces: number[] = [];
  const poller = createDeskFeedPoller({
    fetch: since => {
      sinces.push(since);
      return answer(since, sinces.length);
    },
    onState: s => states.push(s),
    setTimer: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearTimer: t => {
      (t as { cleared: boolean }).cleared = true;
    },
  });
  const next = async () => {
    timers.at(-1)!.fn();
    await flush();
  };
  return { poller, timers, states, sinces, next };
}

describe('平板入场列表轮询', () => {
  it('第一次从 0 拉，之后带上次的 cursor；每 3 秒一次；新入场出现在最前，改过的按 id 覆盖、撤销的去掉', async () => {
    const answers = [
      feed('2026-10-21', 5, [row('a', 1, 4), row('b', 2, 5)]),
      feed('2026-10-21', 7, [row('c', 3, 6, { first: true }), row('a', 1, 7, { voided: true })]),
      feed('2026-10-21', 7, []),
    ];
    const h = harness((_s, n) => Promise.resolve(answers[n - 1]!));
    h.poller.start();
    await flush();
    expect(h.states.at(-1)!.items.map(i => i.id)).toEqual(['b', 'a']);
    expect(h.timers.at(-1)!.ms).toBe(DESK_FEED_POLL_MS);
    await h.next();
    expect(h.states.at(-1)!.items.map(i => [i.id, i.first])).toEqual([['c', true], ['b', false]]);
    await h.next();
    expect(h.sinces).toEqual([0, 5, 7]);
    expect(h.states.at(-1)!.items.map(i => i.id)).toEqual(['c', 'b']);
    h.poller.stop();
  });

  it('过了零点：清空，从 0 重新拉今天的', async () => {
    const h = harness((since, n) =>
      Promise.resolve(n === 1 ? feed('2026-10-21', 3, [row('old', 1, 3)]) : since === 0 ? feed('2026-10-22', 9, [row('new', 9, 9)]) : feed('2026-10-22', 9, [])),
    );
    h.poller.start();
    await flush();
    await h.next();
    expect(h.sinces).toEqual([0, 3, 0]);
    expect(h.states.at(-1)).toMatchObject({ today: '2026-10-22', cursor: 9 });
    expect(h.states.at(-1)!.items.map(i => i.id)).toEqual(['new']);
    h.poller.stop();
  });

  it('拉失败先留着列表、记下错误，下次接着用原来的 cursor', async () => {
    const h = harness((_s, n) => (n === 2 ? Promise.reject(new TypeError('offline')) : Promise.resolve(feed('2026-10-21', 2, n === 1 ? [row('a', 1, 2)] : []))));
    h.poller.start();
    await flush();
    await h.next();
    expect(h.states.at(-1)).toMatchObject({ error: expect.any(TypeError), cursor: 2 });
    expect(h.states.at(-1)!.items.map(i => i.id)).toEqual(['a']);
    await h.next();
    expect(h.sinces).toEqual([0, 2, 2]);
    expect(h.states.at(-1)!.error).toBeNull();
    h.poller.stop();
  });

  it('离开页面（stop）后不再拉，在路上的请求回来也不管', async () => {
    let resolve!: (f: DeskFeed) => void;
    const h = harness((_s, n) => (n === 1 ? Promise.resolve(feed('2026-10-21', 1, [])) : new Promise<DeskFeed>(r => (resolve = r))));
    h.poller.start();
    await flush();
    h.timers.at(-1)!.fn();
    h.poller.stop();
    const n = h.states.length;
    resolve(feed('2026-10-21', 2, [row('late', 2, 2)]));
    await flush();
    expect(h.states).toHaveLength(n);
    expect(h.timers).toHaveLength(1);
  });
});
