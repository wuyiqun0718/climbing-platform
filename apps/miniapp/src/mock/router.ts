import type { ApiRequest, ApiResponse, RequestAdapter } from '@climb/api';
import { RuleError } from '@climb/core';

/** mock 里的接口错误，返回给前端的格式和后端约定一致：{ code, message } */
export class MockHttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export interface MockContext {
  params: Record<string, string>;
  /** 查询串，比如 `GET /classes?store=binggang` 的 { store: 'binggang' } */
  query: Record<string, string>;
  body: unknown;
  /** 由 Authorization 头里的 token 解析出来；没登录、或者只微信登录了还没验证手机号时为 null */
  memberId: string | null;
  /** 微信登录了但还没验证手机号时有值（临时 token） */
  openid: string | null;
}

/** token 解析出来的身份 */
export interface MockIdentity {
  memberId: string | null;
  openid: string | null;
}

export type MockHandler = (ctx: MockContext) => unknown;

/** 路由表：键是「方法 路径」，路径里 :name 是参数，比如 'POST /shares/:id/claim' */
export type MockRoutes = Record<string, MockHandler>;

interface CompiledRoute {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: MockHandler;
}

function compile(routes: MockRoutes): CompiledRoute[] {
  return Object.entries(routes).map(([key, handler]) => {
    const [method, path] = key.split(' ');
    const keys: string[] = [];
    const source = path.replace(/:(\w+)/g, (_, k: string) => (keys.push(k), '([^/]+)'));
    return { method, pattern: new RegExp(`^${source}$`), keys, handler };
  });
}

/** 去掉域名和查询串，只留路径 */
const pathOf = (url: string) => url.replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0] || '/';

/** 查询串转成对象；同名的取最后一个 */
function queryOf(url: string): Record<string, string> {
  const qs = url.split('?')[1]?.split('#')[0] ?? '';
  const out: Record<string, string> = {};
  for (const part of qs.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

export function createMockAdapter(routes: MockRoutes, resolveToken: (token: string) => MockIdentity): RequestAdapter {
  const table = compile(routes);
  return async (req: ApiRequest): Promise<ApiResponse> => {
    const path = pathOf(req.url);
    const auth = req.headers.Authorization ?? '';
    const { memberId, openid } = auth.startsWith('Bearer ') ? resolveToken(auth.slice(7)) : { memberId: null, openid: null };
    for (const r of table) {
      const m = r.method === req.method ? r.pattern.exec(path) : null;
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        // 复制一份，避免页面拿到 mock 内部对象的引用
        const data = r.handler({ params, query: queryOf(req.url), body: req.body ?? {}, memberId, openid });
        return { status: 200, data: data === undefined ? null : JSON.parse(JSON.stringify(data)) };
      } catch (e) {
        if (e instanceof RuleError) return { status: 409, data: { code: e.code, message: e.message } };
        if (e instanceof MockHttpError) return { status: e.status, data: { code: e.code, message: e.message } };
        throw e;
      }
    }
    return { status: 404, data: { code: 'not-found', message: `mock 里没有 ${req.method} ${path}` } };
  };
}
