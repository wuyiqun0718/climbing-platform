import type { RequestAdapter } from '@climb/api';
import { errorMessage } from './errors';

/**
 * 401 时重新登录再重试一次。relogin 返回新 token；拿不到（比如用户没授权）返回 null，原来的 401 照常抛出。
 * 同时有多个请求 401 时只登录一次，大家等同一个结果。
 */
export function withRelogin(adapter: RequestAdapter, relogin: () => Promise<string | null>): RequestAdapter {
  let pending: Promise<string | null> | null = null;
  return async req => {
    const res = await adapter(req);
    if (res.status !== 401) return res;
    pending ??= relogin()
      .catch(() => null)
      .finally(() => {
        pending = null;
      });
    const token = await pending;
    if (!token) return res;
    return adapter({ ...req, headers: { ...req.headers, Authorization: `Bearer ${token}` } });
  };
}

/** 界面上的提示，测试里换成假的 */
export interface RequestUi {
  showLoading(title: string): void;
  hideLoading(): void;
  toast(message: string): void;
}

export interface RunOptions {
  /** 转圈时的文字；false 不转圈（比如下拉刷新、后台静默拉取） */
  loading?: string | false;
  /** 不弹错误提示，由页面自己处理（错误照样抛出） */
  silent?: boolean;
}

/**
 * 页面里调接口包一层：统一转圈和错误提示。出错时提示完仍然抛出，调用方需要的话自己 catch。
 * 多个请求同时进行时只显示一个转圈，全部结束才收起。
 */
export function createRunner(ui: RequestUi) {
  let active = 0;
  return async function run<T>(task: () => Promise<T>, opts: RunOptions = {}): Promise<T> {
    const loading = opts.loading ?? '加载中';
    let spinning = loading !== false;
    const stop = () => {
      if (!spinning) return;
      spinning = false;
      if (--active === 0) ui.hideLoading();
    };
    if (spinning && active++ === 0) ui.showLoading(loading as string);
    try {
      return await task();
    } catch (e) {
      // 先收起转圈再提示，否则小程序里 hideLoading 会把 toast 一起关掉
      stop();
      if (!opts.silent) ui.toast(errorMessage(e));
      throw e;
    } finally {
      stop();
    }
  };
}
