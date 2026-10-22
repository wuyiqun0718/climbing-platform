import { ApiError, createApi, type ApiRequest, type RequestAdapter } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it, vi } from 'vitest';
import { createMock, MOCK_MEMBERS, mockToken } from '../mock';
import { errorMessage, NETWORK_ERROR, isRetryable } from './errors';
import { createRunner, withRelogin } from './request';

const TODAY = '2026-10-21';

function setup() {
  const mock = createMock({ rules: defaultRules, today: () => TODAY });
  const api = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(MOCK_MEMBERS.ajie) });
  const xiaolu = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(MOCK_MEMBERS.xiaolu) });
  const laozhou = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => mockToken(MOCK_MEMBERS.laozhou) });
  return { api, xiaolu, laozhou, mock };
}

const fail = (p: Promise<unknown>) => p.then(() => expect.fail('应该失败'), (e: unknown) => e);

describe('错误码翻译', () => {
  it('mock 返回的规则错误翻成中文', async () => {
    const { api, xiaolu, laozhou } = setup();
    const share = await api.shares.createCount({ cardId: 'card-ajie-c10', quantity: 1 });
    expect(errorMessage(await fail(api.shares.claim(share.token)))).toBe('这是你自己发出的，发给朋友让 TA 来领');
    await xiaolu.shares.claim(share.token);
    expect(errorMessage(await fail(laozhou.shares.claim(share.token)))).toBe('已经被人领走了');
    expect(errorMessage(await fail(api.shares.createCount({ cardId: 'card-ajie-c10', quantity: 99 })))).toBe('卡里剩的次数不够');
    expect(errorMessage(await fail(api.checkIns.create({ storeId: 'binggang', qrToken: 'nope', cardId: 'card-ajie-c10', idempotencyKey: 'k1' })))).toBe('这个码不是本馆的入场码');
  });

  it('不认识的 code 用后端带回的 message，没有 message 按状态码', () => {
    expect(errorMessage(new ApiError(409, { code: 'brand-new', message: '新规则' }))).toBe('新规则');
    expect(errorMessage(new ApiError(502, null))).toBe('服务器出了点问题，稍后再试');
    expect(errorMessage(new ApiError(401, {}))).toBe('登录过期了，重新登录一下');
  });

  it('不是 ApiError 的当成网络问题', () => {
    expect(errorMessage({ errMsg: 'request:fail timeout' })).toBe(NETWORK_ERROR);
  });
});

describe('401 重新登录', () => {
  const unauthorized = { status: 401, data: { code: 'unauthorized' } };
  const req: ApiRequest = { method: 'GET', url: '/me/cards', headers: { Authorization: 'Bearer old' } };

  it('换了新 token 重试一次', async () => {
    const seen: string[] = [];
    const base: RequestAdapter = async r => {
      seen.push(r.headers.Authorization);
      return r.headers.Authorization === 'Bearer new' ? { status: 200, data: 'ok' } : unauthorized;
    };
    const res = await withRelogin(base, async () => 'new')(req);
    expect(res).toEqual({ status: 200, data: 'ok' });
    expect(seen).toEqual(['Bearer old', 'Bearer new']);
  });

  it('同时几个 401 只登录一次', async () => {
    const relogin = vi.fn(async () => 'new');
    const adapter = withRelogin(async r => (r.headers.Authorization === 'Bearer new' ? { status: 200, data: null } : unauthorized), relogin);
    await Promise.all([adapter(req), adapter(req), adapter(req)]);
    expect(relogin).toHaveBeenCalledTimes(1);
  });

  it('登录不上就把 401 还给调用方，不死循环', async () => {
    const base = vi.fn(async () => unauthorized);
    const res = await withRelogin(base, async () => null)(req);
    expect(res).toBe(unauthorized);
    expect(base).toHaveBeenCalledTimes(1);
  });
});

describe('run：转圈和提示', () => {
  function fakeUi() {
    const log: string[] = [];
    return { log, ui: { showLoading: (t: string) => log.push(`show ${t}`), hideLoading: () => log.push('hide'), toast: (m: string) => log.push(`toast ${m}`) } };
  }

  it('出错时先收起转圈再提示中文，错误照样抛出', async () => {
    const { log, ui } = fakeUi();
    const run = createRunner(ui);
    const err = new ApiError(409, { code: 'card-expired' });
    await expect(run(() => Promise.reject(err), { loading: '入场中' })).rejects.toBe(err);
    expect(log).toEqual(['show 入场中', 'hide', 'toast 这张卡已经过期了']);
  });

  it('同时几个请求只转一个圈，都结束才收起', async () => {
    const { log, ui } = fakeUi();
    const run = createRunner(ui);
    let finishA!: () => void;
    const a = run(() => new Promise<void>(r => (finishA = r)));
    const b = run(() => Promise.reject(new ApiError(500, null)), { silent: true }).catch(() => {});
    await b;
    expect(log).toEqual(['show 加载中']);
    finishA();
    await a;
    expect(log).toEqual(['show 加载中', 'hide']);
  });

  it('loading: false 不转圈', async () => {
    const { log, ui } = fakeUi();
    await createRunner(ui)(async () => 1, { loading: false });
    expect(log).toEqual([]);
  });
});

describe('isRetryable', () => {
  it('断网和 5xx 可以重试，4xx 不行', () => {
    expect(isRetryable(new Error('断网'))).toBe(true);
    expect(isRetryable(new ApiError(502, null))).toBe(true);
    expect(isRetryable(new ApiError(403, { code: 'forbidden' }))).toBe(false);
    expect(isRetryable(new ApiError(404, null))).toBe(false);
  });
});
