/**
 * 隐私同意状态。同意过的指引版本存在本地；小程序里还要看微信那边记没记（`wx.getPrivacySetting`），
 * 两边都同意过才算，不然登录页再弹一次。
 */
export interface PrivacyDeps {
  /** 当前指引版本，见 src/config/privacy.ts */
  version: string;
  load(): string | null;
  save(version: string | null): void;
  /** 微信那边还要不要会员同意；H5 下没有这一步，返回 false */
  wxNeedsAuth(): Promise<boolean>;
}

export function createPrivacy(deps: PrivacyDeps) {
  return {
    /** 登录前要不要先弹隐私说明 */
    async needConsent(): Promise<boolean> {
      if (deps.load() !== deps.version) return true;
      // 拿不到微信的状态就当已同意：微信调隐私接口时还会自己弹
      return deps.wxNeedsAuth().catch(() => false);
    },
    agree: () => deps.save(deps.version),
    /** 换身份（开发面板的「新微信」）时清掉 */
    clear: () => deps.save(null),
  };
}

export type Privacy = ReturnType<typeof createPrivacy>;
