import type { Api, PhoneBindResult } from '@climb/api';
import { ApiError } from '@climb/api';
import { reactive, readonly } from 'vue';
import pagesBase from '../../pages.base.json';

/** 存在本地的登录状态 */
export interface Session {
  token: string;
  /** false：只微信登录了，还没验证手机号，token 只能用来调 `POST /auth/phone` */
  phoneBound: boolean;
}

export interface AuthDeps {
  api: Pick<Api, 'auth'>;
  /** 小程序里是 `uni.login` 的 code；mock 下是当前示例微信的 openid */
  wxCode(): Promise<string>;
  load(): Session | null;
  save(session: Session | null): void;
}

export const LOGIN_PAGE = 'pages/login/index';

const TAB_PAGES = new Set(pagesBase.tabBar.list.map(t => t.pagePath));

/**
 * 登录状态。启动时 `init()`：本地有正式 token 就直接用（过期了接口 401 时再静默登录）；没有就 `uni.login` 换一个。
 * 新微信拿到的是临时 token，要在登录页验证手机号（`bindPhone`）才换成正式的。
 */
export function createAuth(deps: AuthDeps) {
  const state = reactive({ session: deps.load() as Session | null });
  let wxPending: Promise<Session> | null = null;
  let ready: Promise<void> = Promise.resolve();

  const setSession = (s: Session | null) => {
    state.session = s;
    deps.save(s);
  };

  /** 微信静默登录：`uni.login` 的 code 换 token。同时调多次只登录一次 */
  function wxLogin(): Promise<Session> {
    wxPending ??= (async () => {
      const code = await deps.wxCode();
      const r = await deps.api.auth.wxLogin({ code });
      const s = { token: r.token, phoneBound: r.phoneBound };
      setSession(s);
      return s;
    })().finally(() => {
      wxPending = null;
    });
    return wxPending;
  }

  /** 启动时调一次；页面要等它结束再判断登没登录（`whenReady`） */
  function init(): Promise<void> {
    if (state.session?.phoneBound) return (ready = Promise.resolve());
    ready = wxLogin().then(
      () => {},
      e => console.warn('微信登录失败', e),
    );
    return ready;
  }

  /**
   * 接口返回 401 时调：正式 token 过期了就静默重新登录，返回新 token。
   * 还没验证手机号的不重登（重登也一样是临时 token），返回 null 让 401 照常报出去，页面会去登录页。
   */
  async function relogin(): Promise<string | null> {
    if (!state.session?.phoneBound) return null;
    const s = await wxLogin().catch(() => null);
    return s?.phoneBound ? s.token : null;
  }

  /**
   * 登录页验证手机号。code 是 getPhoneNumber 给的（H5 下就是手机号）。
   * 临时 token 没有或过期了（401）先重新微信登录再试一次。完成后会员信息由调用方重新拉（member.reset）。
   * legacyBound：对上了青橙导入的老会员，老卡已经在卡包里。
   */
  async function bindPhone(code: string): Promise<{ legacyBound: boolean }> {
    let s = state.session ?? (await wxLogin());
    // 这个微信其实已经绑过（比如别的设备上验证过），不用再验证
    if (s.phoneBound) return { legacyBound: false };
    let r: PhoneBindResult;
    try {
      r = await deps.api.auth.phone({ code });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401)) throw e;
      s = await wxLogin();
      if (s.phoneBound) return { legacyBound: false };
      r = await deps.api.auth.phone({ code });
    }
    setSession({ token: r.token, phoneBound: true });
    return { legacyBound: r.legacyBound };
  }

  /** 换身份（开发面板切示例会员）：丢掉旧 token，重新微信登录 */
  function relaunch(): Promise<void> {
    setSession(null);
    return init();
  }

  return {
    state: readonly(state),
    init,
    whenReady: () => ready,
    loggedIn: () => !!state.session?.phoneBound,
    token: () => state.session?.token ?? null,
    wxLogin,
    relogin,
    bindPhone,
    relaunch,
  };
}

export type Auth = ReturnType<typeof createAuth>;

/** 页面地址，`route` 不带开头的 /，比如 `pages/cards/index` */
export interface PageTarget {
  route: string;
  query?: Record<string, string | undefined>;
}

export const isTabPage = (route: string) => TAB_PAGES.has(route);

export function pageUrl({ route, query }: PageTarget): string {
  const qs = Object.entries(query ?? {})
    .filter((kv): kv is [string, string] => kv[1] !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `/${route}${qs ? `?${qs}` : ''}`;
}

/** 登录页地址，登录完回到 target */
export const loginUrl = (target: PageTarget) => pageUrl({ route: LOGIN_PAGE, query: { redirect: pageUrl(target) } });

/**
 * 没登录时怎么去登录页：
 * - 普通页面：用登录页替换掉它（redirectTo），登录完再换回来；不登录直接返回上一页，不会来回跳
 * - tab 页不能被替换：先回首页再打开登录页，不登录返回时落在首页
 */
export function toLoginSteps(target: PageTarget): { method: 'redirectTo' | 'navigateTo' | 'switchTab'; url: string }[] {
  const url = loginUrl(target);
  if (!isTabPage(target.route)) return [{ method: 'redirectTo', url }];
  return [
    { method: 'switchTab', url: '/pages/index/index' },
    { method: 'navigateTo', url },
  ];
}

/** 登录完回原页面；redirect 只认本小程序的页面路径，没有就回首页 */
export function afterLoginStep(redirect: string | undefined): { method: 'redirectTo' | 'switchTab'; url: string } {
  // 微信小程序 onLoad 拿到的参数没解码，H5 解码过了
  const raw = redirect?.startsWith('%2F') ? decodeURIComponent(redirect) : redirect;
  const url = raw && /^\/pages\//.test(raw) ? raw : '/pages/index/index';
  const route = url.slice(1).split('?')[0];
  if (route === LOGIN_PAGE) return { method: 'switchTab', url: '/pages/index/index' };
  return isTabPage(route) ? { method: 'switchTab', url: url.split('?')[0] } : { method: 'redirectTo', url };
}
