import { onLoad, onShow } from '@dcloudio/uni-app';
import { auth } from '../api';
import { afterLoginStep, toLoginSteps, type PageTarget } from './auth';

type NavMethod = 'navigateTo' | 'redirectTo' | 'switchTab';

const nav = (method: NavMethod, url: string) =>
  new Promise<void>((resolve, reject) => {
    const opts = { url, success: () => resolve(), fail: reject };
    if (method === 'switchTab') uni.switchTab(opts);
    else if (method === 'redirectTo') uni.redirectTo(opts);
    else uni.navigateTo(opts);
  });

function currentRoute(): string {
  const pages = getCurrentPages();
  return pages[pages.length - 1]?.route ?? 'pages/index/index';
}

/** 去登录页，登录完回到 target（默认当前页） */
export async function goLogin(target: PageTarget = { route: currentRoute() }) {
  for (const step of toLoginSteps(target)) await nav(step.method, step.url);
}

/** 登录页登录成功后调：回到原来的页面 */
export function backAfterLogin(redirect: string | undefined) {
  const step = afterLoginStep(redirect);
  return nav(step.method, step.url);
}

/**
 * 要登录才能做的事先调一下：等启动时的登录结束，没登录就去登录页并返回 false。
 * 例：if (!(await requireLogin())) return;
 */
export async function requireLogin(target?: PageTarget): Promise<boolean> {
  await auth.whenReady();
  if (auth.loggedIn()) return true;
  await goLogin(target).catch(e => console.warn('跳转登录页失败', e));
  return false;
}

/**
 * 需要登录的页面在 setup 里调：每次显示时检查，没登录就去登录页，登录完回到这个页面（带上原来的参数）。
 * onReady 在确认登录后调，页面在这里拉数据。
 */
export function useRequireLogin(onReady?: () => void) {
  let query: Record<string, string | undefined> = {};
  onLoad(q => {
    query = (q ?? {}) as Record<string, string | undefined>;
  });
  onShow(async () => {
    if (await requireLogin({ route: currentRoute(), query })) onReady?.();
  });
}
