import type { Me, PhoneBindResult, WxLoginResult } from '@climb/api';
import { mockToken, mockWxToken, type MockDb, type MockMember } from '../db';
import { MockHttpError, type MockContext, type MockRoutes } from '../router';

const PHONE = /^1\d{10}$/;

/**
 * 登录和当前会员：`POST /auth/wx-login`、`POST /auth/phone`、`GET /me`。
 *
 * mock 里没有微信，两个 code 直接当结果用：
 * - wx-login 的 code 就是 openid（`wx-ajie` 登录成阿杰；随便一个新值就是新用户）
 * - phone 的 code 就是手机号（H5 下输入框填的）
 * 真后端拿 code 去微信换 openid / 手机号。
 */
export function createAuthRoutes(
  db: MockDb,
  helpers: { nextId: (prefix: string) => string; requireMember: (ctx: MockContext) => string },
): MockRoutes {
  const toMe = (m: MockMember): Me => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    // 告知书签署在任务 20 接上，先一律当没签
    waiverSigned: false,
  });

  return {
    'POST /auth/wx-login': (ctx): WxLoginResult => {
      const { code } = ctx.body as { code?: unknown };
      if (typeof code !== 'string' || !code) throw new MockHttpError(400, 'invalid-code', '微信登录失败');
      const member = db.members.find(m => m.openid === code);
      if (member) return { token: mockToken(member.id), phoneBound: true };
      return { token: mockWxToken(code), phoneBound: false };
    },

    'POST /auth/phone': (ctx): PhoneBindResult => {
      const openid = ctx.openid;
      if (!openid) throw new MockHttpError(401, 'unauthorized', '请先微信登录');
      if (db.members.some(m => m.openid === openid)) throw new MockHttpError(409, 'wx-already-bound', '这个微信已经绑定过手机号了');
      const { code } = ctx.body as { code?: unknown };
      if (typeof code !== 'string' || !PHONE.test(code)) throw new MockHttpError(400, 'invalid-phone-code', '手机号验证失败');

      let member = db.members.find(m => m.phone === code);
      // 手机号已经绑在别的微信上：先不自动换绑，让会员找前台（换绑规则等馆方定）
      if (member?.openid) throw new MockHttpError(409, 'phone-taken', '这个手机号已经绑定了别的微信');
      const legacyBound = member?.source === 'legacy_import';
      if (member) {
        // 对上了没登录过的会员（主要是青橙导入的）：openid 绑上去，原来的卡就都在卡包里了
        member.openid = openid;
      } else {
        // 微信不再给昵称，新会员先用手机尾号当名字，之后在「我的」里改
        member = { id: helpers.nextId('m'), name: `岩友${code.slice(-4)}`, phone: code, openid, source: 'walkin' };
        db.members.push(member);
      }
      return { token: mockToken(member.id), me: toMe(member), legacyBound };
    },

    'GET /me': ctx => {
      const me = helpers.requireMember(ctx);
      return toMe(db.members.find(m => m.id === me)!);
    },
  };
}
