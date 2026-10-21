import { ApiError, type DeskQr } from '@climb/api';
import { secondsUntil } from '@climb/core';

/**
 * 前台平板页（任务 37）的轮询和显示逻辑，跟页面分开好测。
 * - 每 DESK_POLL_MS 拉一次 GET /desk/qr，快到换码时间就提前拉；服务器决定是不是换新码（没到 30 秒、没被用掉就是同一个）。
 * - 倒计时按服务器时间：每次拉到时记下 serverTime 和本机时间的差。
 * - 拉不到（断网、服务器出错）就不再显示旧码，提示断网；设备没绑定或解绑了（401）提示重新绑定。拿到的码过了有效期也不显示。
 * - stop() 以后不再拉，在路上的请求回来也不管。
 */
export const DESK_POLL_MS = 5_000;

export interface DeskQrState {
  qr: DeskQr | null;
  /** 服务器时间减本机时间（毫秒） */
  offsetMs: number;
  /** 最近一次拉取失败的原因；成功后清掉 */
  error: unknown;
}

export type DeskQrDisplay =
  | { kind: 'loading' }
  | { kind: 'unbound' }
  | { kind: 'offline' }
  | { kind: 'show'; qr: DeskQr; secondsLeft: number };

export function deskQrDisplay(state: DeskQrState, localNow: number): DeskQrDisplay {
  if (state.error instanceof ApiError && state.error.status === 401) return { kind: 'unbound' };
  if (state.error) return { kind: 'offline' };
  if (!state.qr) return { kind: 'loading' };
  const serverNow = new Date(localNow + state.offsetMs);
  if (serverNow.getTime() >= Date.parse(state.qr.expiresAt)) return { kind: 'offline' };
  return { kind: 'show', qr: state.qr, secondsLeft: secondsUntil(state.qr.refreshAt, serverNow) };
}

export function createDeskQrPoller(deps: {
  fetch: () => Promise<DeskQr>;
  onState: (s: DeskQrState) => void;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}) {
  const now = deps.now ?? (() => Date.now());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? (t => clearTimeout(t as ReturnType<typeof setTimeout>));
  let state: DeskQrState = { qr: null, offsetMs: 0, error: null };
  let timer: unknown = null;
  let running = false;
  let run = 0;

  const schedule = (ms: number) => {
    if (running) timer = setTimer(poll, Math.max(0, ms));
  };

  async function poll() {
    const mine = ++run;
    try {
      const qr = await deps.fetch();
      if (!running || mine !== run) return;
      const offsetMs = Date.parse(qr.serverTime) - now();
      state = { qr, offsetMs, error: null };
      deps.onState(state);
      // 到换码时间就拉，最多隔 DESK_POLL_MS（码被用掉了也能很快换上）
      schedule(Math.min(DESK_POLL_MS, Date.parse(qr.refreshAt) - Date.parse(qr.serverTime)));
    } catch (e) {
      if (!running || mine !== run) return;
      state = { ...state, error: e };
      deps.onState(state);
      schedule(DESK_POLL_MS);
    }
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
