import { ApiError, createApi } from '@climb/api';
import { defaultRules } from '@climb/core';
import { describe, expect, it } from 'vitest';
import { createMock, MOCK_LEGACY_PHONE, MOCK_MEMBERS } from './index';

const TODAY = '2026-10-21';

/** 像小程序一样：登录拿到的 token 存起来，后面的请求都带上 */
function setup() {
  const mock = createMock({ rules: defaultRules, today: () => TODAY });
  let token: string | null = null;
  const api = createApi({ baseURL: '', gymId: 'benchmark', adapter: mock.adapter, getToken: () => token });
  const login = async (openid: string) => {
    const r = await api.auth.wxLogin({ code: openid });
    token = r.token;
    return r;
  };
  const bindPhone = async (phone: string) => {
    const r = await api.auth.phone({ code: phone });
    token = r.token;
    return r;
  };
  return { db: mock.db, api, login, bindPhone };
}

const codeOf = async (p: Promise<unknown>) => {
  const e = await p.catch(err => err);
  expect(e).toBeInstanceOf(ApiError);
  return { status: (e as ApiError).status, code: ((e as ApiError).data as { code: string }).code };
};

describe('mock 登录', () => {
  it('绑过手机号的微信直接登录，/me 返回会员信息', async () => {
    const { api, login } = setup();
    expect(await login('wx-ajie')).toMatchObject({ phoneBound: true });
    expect(await api.me.get()).toEqual({ id: MOCK_MEMBERS.ajie, name: '阿杰', phone: '13800000001', waiverSigned: true, coach: null });
  });

  it('没登录访问 /me 是 401', async () => {
    const { api } = setup();
    expect(await codeOf(api.me.get())).toEqual({ status: 401, code: 'unauthorized' });
  });

  it('新微信要先验证手机号，之前别的接口返回 phone-required', async () => {
    const { api, login } = setup();
    expect(await login('wx-new')).toMatchObject({ phoneBound: false });
    expect(await codeOf(api.me.get())).toEqual({ status: 401, code: 'phone-required' });
    expect(await codeOf(api.me.cards())).toEqual({ status: 401, code: 'phone-required' });
  });

  it('手机号对上青橙导入的老会员：绑上微信，老卡出现在卡包，下次直接登录', async () => {
    const { api, login, bindPhone, db } = setup();
    await login('wx-laozhou');
    const r = await bindPhone(MOCK_LEGACY_PHONE);
    expect(r).toMatchObject({ legacyBound: true, me: { id: MOCK_MEMBERS.laozhou, name: '老周' } });
    expect(await api.me.cards()).toEqual([expect.objectContaining({ id: 'card-laozhou-c20', remaining: 8 })]);
    expect(db.members.find(m => m.id === MOCK_MEMBERS.laozhou)?.openid).toBe('wx-laozhou');

    expect(await login('wx-laozhou')).toMatchObject({ phoneBound: true });
    expect(await api.me.get()).toMatchObject({ id: MOCK_MEMBERS.laozhou });
  });

  it('新手机号建新会员，卡包是空的', async () => {
    const { api, login, bindPhone, db } = setup();
    await login('wx-new');
    const r = await bindPhone('13900001234');
    expect(r).toMatchObject({ legacyBound: false, me: { name: '岩友1234', phone: '13900001234' } });
    expect(await api.me.cards()).toEqual([]);
    expect(db.members).toHaveLength(5);
  });

  it('手机号已经绑了别的微信、格式不对、没微信登录、重复绑定都被拒', async () => {
    const { api, login, bindPhone } = setup();
    expect(await codeOf(api.auth.phone({ code: MOCK_LEGACY_PHONE }))).toEqual({ status: 401, code: 'unauthorized' });
    expect(await codeOf(api.auth.wxLogin({ code: '' }))).toEqual({ status: 400, code: 'invalid-code' });
    await login('wx-new');
    expect(await codeOf(api.auth.phone({ code: '13800000001' }))).toEqual({ status: 409, code: 'phone-taken' });
    expect(await codeOf(api.auth.phone({ code: '12345' }))).toEqual({ status: 400, code: 'invalid-phone-code' });
    await bindPhone('13900001234');
    expect(await codeOf(api.auth.phone({ code: '13900005678' }))).toEqual({ status: 401, code: 'unauthorized' });
  });
});
