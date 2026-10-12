/**
 * 接口层。小程序和后台共用同一套接口定义，只是「怎么发请求」不同：
 * 小程序用 uni.request，后台用 fetch，由各自的 adapter 实现。
 */

export interface ApiRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface ApiResponse {
  status: number;
  data: unknown;
}

export type RequestAdapter = (req: ApiRequest) => Promise<ApiResponse>;

export class ApiError extends Error {
  constructor(public status: number, public data: unknown) {
    super(`请求失败（${status}）`);
    this.name = 'ApiError';
  }
}

export interface ClientOptions {
  baseURL: string;
  /** 每个请求都带上岩馆 ID，后端按岩馆隔离数据 */
  gymId: string;
  adapter: RequestAdapter;
  getToken?: () => string | null | undefined;
}

export function createHttp(opts: ClientOptions) {
  return async function http<T>(method: ApiRequest['method'], path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Gym-Id': opts.gymId };
    const token = opts.getToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await opts.adapter({ method, url: opts.baseURL.replace(/\/$/, '') + path, headers, body });
    if (res.status >= 400) throw new ApiError(res.status, res.data);
    return res.data as T;
  };
}

/** 浏览器 / 后台用 */
export const fetchAdapter: RequestAdapter = async req => {
  const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body == null ? undefined : JSON.stringify(req.body) });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};

interface UniLike {
  request(o: {
    url: string;
    method: string;
    header: Record<string, string>;
    data?: unknown;
    success: (r: { statusCode: number; data: unknown }) => void;
    fail: (e: unknown) => void;
  }): void;
}

/** 小程序用：传入全局的 uni 对象 */
export const uniAdapter = (uni: UniLike): RequestAdapter => req =>
  new Promise((resolve, reject) => {
    uni.request({
      url: req.url,
      method: req.method,
      header: req.headers,
      data: req.body as never,
      success: r => resolve({ status: r.statusCode, data: r.data }),
      fail: reject,
    });
  });
