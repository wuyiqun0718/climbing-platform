import type { Theme } from '@climb/theme';

/** 每个岩馆可以单独调整的业务规则 */
export interface GymRules {
  /** 期限卡会员每个自然月能发几次老带新邀请 */
  referralsPerMonth: number;
  /** 老带新是否要求邀请人当天先入场 */
  referralRequiresInviterSameDay: boolean;
  /** 同一天再次入场是否免扣次 */
  sameDayReentryFree: boolean;
  /** 下单后多少分钟内没付就关单（占位 15 分钟，等馆方确认） */
  orderPayMinutes: number;
  /** 期限卡冻结规则，岩馆在后台配置 */
  freezeRules: FreezeRules;
}

/** 期限卡冻结规则；字段和后台（mvp/dashboard 任务 17.5）一致 */
export interface FreezeRules {
  /** 会员能不能在小程序里自己冻结；关掉就只能前台办 */
  memberSelfService: boolean;
  /** 每个自然月最多冻结几次；null 为不限 */
  perMonth: number | null;
  /** 每个自然年最多冻结几次；null 为不限 */
  perYear: number | null;
  /** 每次最少、最多冻结几天 */
  minDays: number;
  maxDays: number;
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

/**
 * 冻结规则的默认值。已定：会员可以自助冻结、每月 1 次。
 * 其余是占位，等馆方定（docs/mvp-plan.md 第 9 节「要问馆方」第 16 条）：每年不限、每次 1–30 天。
 */
export const defaultFreezeRules: FreezeRules = {
  memberSelfService: true,
  perMonth: 1,
  perYear: null,
  minDays: 1,
  maxDays: 30,
};

export const defaultRules: GymRules = {
  referralsPerMonth: 1,
  referralRequiresInviterSameDay: true,
  sameDayReentryFree: true,
  orderPayMinutes: 15,
  freezeRules: defaultFreezeRules,
};

export const defaultFeatures: GymFeatures = {
  countCardSharing: true,
  referral: true,
  groupClasses: true,
  personalTraining: true,
  events: true,
};

type GymRulesInput = Partial<Omit<GymRules, 'freezeRules'>> & { freezeRules?: Partial<FreezeRules> };
type GymInput = Omit<GymConfig, 'rules' | 'features'> & { rules?: GymRulesInput; features?: Partial<GymFeatures> };

export function defineGym(input: GymInput): GymConfig {
  return {
    ...input,
    rules: { ...defaultRules, ...input.rules, freezeRules: { ...defaultFreezeRules, ...input.rules?.freezeRules } },
    features: { ...defaultFeatures, ...input.features },
  };
}
