import { createApi } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it, vi } from 'vitest';
import { createMock, MOCK_LEGACY_PHONE, MOCK_MEMBERS, mockWxToken } from '../mock';
import { afterLoginStep, createAuth, loginUrl, toLoginSteps, type Session } from './auth';
import { withRelogin } from './request';

const TODAY = '2026-10-21';

/** 跟 src/api.ts 一样接：api 的 token 来自 auth，401 时 auth.relogin */
function setup(saved: Session | null = null) {
  const mock = createMock({ rules: defaultRules, today: () => TODAY });
  let stored = saved;
  const wxCode = vi.fn(async () => mock.currentWx());
  const api = createApi({
    baseURL: '',
    gymId: 'benchmark',
    adapter: withRelogin(mock.adapter, () => auth.relogin()),
    getToken: () => auth.token(),
  });
  const auth = createAuth({ api, wxCode, load: () => stored, save: s => (stored = s) });
  return { mock, api, auth, wxCode, stored: () => stored };
}

describe('登录', () => {
  it('启动时没有 token：微信登录，绑过手机号的直接是登录状态，token 存下来', async () => {
    const { auth, api, stored } = setup();
    await auth.init();
    expect(auth.loggedIn()).toBe(true);
    expect(stored()).toEqual({ token: auth.token(), phoneBound: true });
    expect(await api.me.get()).toMatchObject({ id: MOCK_MEMBERS.ajie });
  });

  it('本地有正式 token 就不再微信登录', async () => {
    const { auth, wxCode } = setup({ token: `mock:${MOCK_MEMBERS.ajie}`, phoneBound: true });
    await auth.init();
    expect(wxCode).not.toHaveBeenCalled();
    expect(auth.loggedIn()).toBe(true);
  });

  it('本地只有临时 token：启动时重新微信登录（可能已经在别处验证过手机号）', async () => {
    const { auth, wxCode } = setup({ token: mockWxToken('wx-ajie'), phoneBound: false });
    await auth.init();
    expect(wxCode).toHaveBeenCalledTimes(1);
    expect(auth.loggedIn()).toBe(true);
  });

  it('微信登录失败不抛出，当成没登录', async () => {
    const { auth, wxCode } = setup();
    wxCode.mockRejectedValueOnce(new Error('断网'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await auth.init();
    expect(auth.loggedIn()).toBe(false);
    warn.mockRestore();
  });

  it('新微信：还没登录，验证手机号对上青橙老会员后登录，老卡在卡包里', async () => {
    const { auth, api, mock } = setup();
    mock.switchToNewWx();
    await auth.init();
    expect(auth.loggedIn()).toBe(false);
    expect(auth.state.session?.phoneBound).toBe(false);

    expect(await auth.bindPhone(MOCK_LEGACY_PHONE)).toEqual({ legacyBound: true });
    expect(auth.loggedIn()).toBe(true);
    expect(await api.me.cards()).toEqual([expect.objectContaining({ id: 'card-laozhou-c20' })]);
  });

  it('新手机号：建新会员', async () => {
    const { auth, api, mock } = setup();
    mock.switchToNewWx();
    await auth.init();
    expect(await auth.bindPhone('13900001234')).toEqual({ legacyBound: false });
    expect(await api.me.get()).toMatchObject({ phone: '13900001234' });
  });

  it('验证手机号时临时 token 失效了：重新微信登录再试一次', async () => {
    const { auth, mock } = setup({ token: mockWxToken(''), phoneBound: false });
    mock.switchToNewWx();
    expect(await auth.bindPhone('13900001234')).toEqual({ legacyBound: false });
    expect(auth.loggedIn()).toBe(true);
  });

  it('手机号验证失败照常抛出，还是没登录', async () => {
    const { auth, mock } = setup();
    mock.switchToNewWx();
    await auth.init();
    await expect(auth.bindPhone('13800000001')).rejects.toMatchObject({ status: 409 });
    expect(auth.loggedIn()).toBe(false);
  });

  it('正式 token 过期：接口 401 时静默重新登录，请求照常成功', async () => {
    const { auth, api, wxCode } = setup({ token: 'mock:m-expired', phoneBound: true });
    await auth.init();
    expect(await api.me.get()).toMatchObject({ id: MOCK_MEMBERS.ajie });
    expect(wxCode).toHaveBeenCalledTimes(1);
    expect(auth.token()).toBe(`mock:${MOCK_MEMBERS.ajie}`);
  });

  it('还没验证手机号时接口 401 不重复微信登录，错误照常报出去', async () => {
    const { auth, api, mock, wxCode } = setup();
    mock.switchToNewWx();
    await auth.init();
    await expect(api.me.get()).rejects.toMatchObject({ status: 401, data: { code: 'phone-required' } });
    expect(wxCode).toHaveBeenCalledTimes(1);
  });

  it('同时几个地方要登录只登录一次', async () => {
    const { auth, wxCode } = setup();
    await Promise.all([auth.wxLogin(), auth.wxLogin(), auth.init()]);
    expect(wxCode).toHaveBeenCalledTimes(1);
  });

  it('切换身份：丢掉旧 token 重新登录', async () => {
    const { auth, api, mock } = setup();
    await auth.init();
    mock.switchMember(MOCK_MEMBERS.xiaolu);
    await auth.relaunch();
    expect(await api.me.get()).toMatchObject({ id: MOCK_MEMBERS.xiaolu });
  });
});

describe('去登录页、登录完回去', () => {
  it('普通页面：登录页替换它，带上原来的参数；登录完换回来', () => {
    const target = { route: 'pages/share/claim', query: { token: 'a b&c' } };
    expect(toLoginSteps(target)).toEqual([{ method: 'redirectTo', url: loginUrl(target) }]);
    const redirect = loginUrl(target).split('redirect=')[1];
    // 小程序里 onLoad 拿到的是没解码的，H5 是解码过的，两种都要认
    for (const r of [redirect, decodeURIComponent(redirect)]) {
      expect(afterLoginStep(r)).toEqual({ method: 'redirectTo', url: '/pages/share/claim?token=a%20b%26c' });
    }
  });

  it('tab 页：先回首页再打开登录页；登录完 switchTab 回去', () => {
    expect(toLoginSteps({ route: 'pages/cards/index' })).toEqual([
      { method: 'switchTab', url: '/pages/index/index' },
      { method: 'navigateTo', url: '/pages/login/index?redirect=%2Fpages%2Fcards%2Findex' },
    ]);
    expect(afterLoginStep('/pages/cards/index')).toEqual({ method: 'switchTab', url: '/pages/cards/index' });
  });

  it('没有 redirect、不是本小程序的页面、或者指回登录页：回首页', () => {
    for (const r of [undefined, '', 'https://evil.example', '/pages/login/index?redirect=x']) {
      expect(afterLoginStep(r)).toEqual({ method: 'switchTab', url: '/pages/index/index' });
    }
  });
});
