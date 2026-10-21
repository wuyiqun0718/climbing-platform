import type { Card } from '@climb/core';
import { reactive, readonly } from 'vue';

/** 当前登录的会员；`GET /me`（任务 6）的返回，先只放页面要用的 */
export interface Me {
  id: string;
  name: string;
  /** 当前版本的风险告知书签过没有（任务 20 接上 `POST /waivers`） */
  waiverSigned: boolean;
}

export interface MemberStoreDeps {
  /** 拉当前会员；没登录返回 null */
  fetchMe(): Promise<Me | null>;
  fetchCards(): Promise<Card[]>;
}

export interface MemberState {
  me: Me | null;
  cards: Card[];
  /** 至少成功拉过一次 */
  loaded: boolean;
  loading: boolean;
}

/**
 * 会员状态：当前会员、卡包、告知书签没签。启动时拉一次，页面直接读 state，不各自再拉。
 * 会改卡包的操作（入场、转赠、领取、购卡……）用 `changeCards` 包一层，成功后重新拉卡包，各页面跟着刷新。
 */
export function createMemberStore(deps: MemberStoreDeps) {
  const state = reactive<MemberState>({ me: null, cards: [], loaded: false, loading: false });
  let pending: Promise<void> | null = null;
  /** 每次重新拉都加 1；换了身份后，旧的请求晚回来也不覆盖新数据 */
  let generation = 0;

  async function fetchAll(gen: number) {
    const me = await deps.fetchMe();
    const cards = me ? await deps.fetchCards() : [];
    if (gen !== generation) return;
    state.me = me;
    state.cards = cards;
    state.loaded = true;
  }

  /** 重新拉会员和卡包。同时调多次只发一轮请求 */
  function load(): Promise<void> {
    if (pending) return pending;
    const gen = ++generation;
    state.loading = true;
    pending = fetchAll(gen).finally(() => {
      if (gen !== generation) return;
      pending = null;
      state.loading = false;
    });
    return pending;
  }

  /** 页面 onLoad 里调：拉过就直接用，正在拉就等它 */
  function ensureLoaded(): Promise<void> {
    return state.loaded && !pending ? Promise.resolve() : load();
  }

  /** 换了身份（登录、退出、开发面板切会员）：丢掉旧数据，正在进行的请求作废，重新拉 */
  function reset(): Promise<void> {
    generation++;
    pending = null;
    state.me = null;
    state.cards = [];
    state.loaded = false;
    return load();
  }

  async function refreshCards() {
    const gen = generation;
    const cards = await deps.fetchCards();
    if (gen === generation) state.cards = cards;
  }

  /**
   * 跑一个会改卡包的操作，成功后刷新卡包；失败不刷新，错误照常抛出。
   * 例：await member.changeCards(() => run(() => api.checkIns.create(body)))
   */
  async function changeCards<T>(task: () => Promise<T>): Promise<T> {
    const result = await task();
    // 操作已经成功了，刷新失败不影响结果，下次进页面再拉
    await refreshCards().catch(e => console.warn('刷新卡包失败', e));
    return result;
  }

  /** 签完告知书后直接改本地状态，不用整份重拉 */
  function markWaiverSigned() {
    if (state.me) state.me.waiverSigned = true;
  }

  return {
    state: readonly(state),
    load,
    ensureLoaded,
    reset,
    refreshCards,
    changeCards,
    markWaiverSigned,
  };
}

export type MemberStore = ReturnType<typeof createMemberStore>;
