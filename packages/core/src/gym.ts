import type { Theme } from '@climb/theme';

/** 每个岩馆可以单独调整的业务规则 */
export interface GymRules {
  /** 期限卡会员每个自然月能发几次老带新邀请 */
  referralsPerMonth: number;
  /** 老带新是否要求邀请人当天先入场 */
  referralRequiresInviterSameDay: boolean;
  /** 同一天再次入场是否免扣次 */
  sameDayReentryFree: boolean;
  /** 看板「快到期」提醒提前几天（含今天到期的）。等馆方，先按原型 7 天 */
  expiryReminderDays: number;
}

export interface GymFeatures {
  countCardSharing: boolean;
  referral: boolean;
  groupClasses: boolean;
  personalTraining: boolean;
  events: boolean;
}

export interface GymConfig {
  /** 和 gyms/<id> 目录名一致，打包时用 GYM=<id> 选择 */
  id: string;
  name: string;
  shortName: string;
  /** 微信小程序 AppID，每个岩馆一个 */
  wechatAppId: string;
  /** gyms/<id>/assets 里的标志文件名；打包时会复制到各个端的静态目录 */
  logo: string;
  openHours: { open: string; close: string };
  theme: Theme;
  rules: GymRules;
  features: GymFeatures;
}

export const defaultRules: GymRules = {
  referralsPerMonth: 1,
  referralRequiresInviterSameDay: true,
  sameDayReentryFree: true,
  expiryReminderDays: 7,
};

export const defaultFeatures: GymFeatures = {
  countCardSharing: true,
  referral: true,
  groupClasses: true,
  personalTraining: true,
  events: true,
};

type GymInput = Omit<GymConfig, 'rules' | 'features'> & { rules?: Partial<GymRules>; features?: Partial<GymFeatures> };

export function defineGym(input: GymInput): GymConfig {
  return {
    ...input,
    rules: { ...defaultRules, ...input.rules },
    features: { ...defaultFeatures, ...input.features },
  };
}
