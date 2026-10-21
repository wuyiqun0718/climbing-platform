import type { DeskFeed, DeskFeedRow } from '@climb/api';
import { mergeDeskFeed } from '@climb/core';

/**
 * 前台平板实时入场列表（任务 38）的轮询：每 DESK_FEED_POLL_MS 带上次的 cursor 增量拉 GET /desk/feed，
 * 按 core 的 mergeDeskFeed 合进列表（按 id 覆盖、撤销的去掉、后入场的在前）。过了零点（today 变了）清空、从 0 重新拉。
 * 拉失败就隔一会儿再试，列表先留着（入场码那边会提示断网）。stop() 以后不再拉，在路上的请求回来也不管。
 */
export const DESK_FEED_POLL_MS = 3_000;
export const DESK_FEED_LIMIT = 30;

export interface DeskFeedState {
  today: string | null;
  cursor: number;
  items: DeskFeedRow[];
  error: unknown;
}

export function createDeskFeedPoller(deps: {
  fetch: (since: number) => Promise<DeskFeed>;
  onState: (s: DeskFeedState) => void;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}) {
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? (t => clearTimeout(t as ReturnType<typeof setTimeout>));
  let state: DeskFeedState = { today: null, cursor: 0, items: [], error: null };
  let timer: unknown = null;
  let running = false;
  let run = 0;

  async function poll() {
    const mine = ++run;
    try {
      let f = await deps.fetch(state.cursor);
      if (!running || mine !== run) return;
      if (state.today !== null && f.today !== state.today) {
        // 过了零点：昨天的不要了，从头拉今天的
        f = await deps.fetch(0);
        if (!running || mine !== run) return;
        state = { today: null, cursor: 0, items: [], error: null };
      }
      state = { today: f.today, cursor: f.cursor, items: mergeDeskFeed(state.items, f.items, DESK_FEED_LIMIT), error: null };
    } catch (e) {
      if (!running || mine !== run) return;
      state = { ...state, error: e };
    }
    deps.onState(state);
    if (running) timer = setTimer(poll, DESK_FEED_POLL_MS);
  }

  return {
    start() {
      if (running) return;
      running = true;
      void poll();
    },
    stop() {
      running = false;
      run++;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
