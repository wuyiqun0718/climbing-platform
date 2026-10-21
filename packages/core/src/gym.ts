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
  /** 期限卡冻结规则，岩馆在后台配置 */
  freezeRules: FreezeRules;
  /** 团课规则，岩馆在后台配置 */
  classRules: ClassRules;
  /** 私教约课规则，岩馆在后台配置 */
  ptRules: PtRules;
}

/** 私教约课规则（docs/mvp-plan.md 第 9 节「要问馆方」第 12 条）；后台私教时间轴（mvp/dashboard 任务 29–30）也按它画格子 */
export interface PtRules {
  /** 每小时一格：第一格几点开始、最后一格几点结束（整点，24 小时制）。比如 10、23 是 10:00–23:00，共 13 格 */
  openHour: number;
  closeHour: number;
  /** 上课前多少分钟截止会员自助取消；截止前取消退课时，截止后要找前台 */
  cancelBeforeMinutes: number;
  /** 会员约了要不要教练确认；要的话先是 pending（已扣课时、占着格子），教练拒绝就退课时 */
  needCoachConfirm: boolean;
}

/** 团课规则（docs/mvp-plan.md 第 9 节「要问馆方」第 11 条）；后台团课课程种类（mvp/dashboard 任务 25）里配 */
export interface ClassRules {
  /** 开课前多少分钟截止自助取消；截止前取消退回次数，截止后会员不能自己取消 */
  cancelBeforeMinutes: number;
  /** 满员后能不能排候补；有人取消时候补第一位自动补上并扣次 */
  waitlist: boolean;
  /** 候补最多几人；null 为不限 */
  waitlistMax: number | null;
  /** 开课后多少分钟内签到还算到课，超过算迟到缺席（次数不退） */
  lateGraceMinutes: number;
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
  /**
   * 前台入场码用「普通链接二维码」时的链接前缀（不带 ?），要在小程序后台配置成跳转签到页。
   * 码的格式见 entryQr.ts。域名要备案、放校验文件，每个岩馆一个。
   */
  entryQrLink: string;
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

/**
 * 团课规则的默认值，全是占位，等馆方定（第 11 条）：开课前 2 小时截止取消、开候补不限人数、开课 15 分钟后算迟到缺席。
 */
export const defaultClassRules: ClassRules = {
  cancelBeforeMinutes: 120,
  waitlist: true,
  waitlistMax: null,
  lateGraceMinutes: 15,
};

/** 私教规则的默认值，全是占位，等馆方定（第 12 条）：10:00–23:00 每小时一格（跟营业时间一致）、提前 12 小时截止取消、不用教练确认 */
export const defaultPtRules: PtRules = {
  openHour: 10,
  closeHour: 23,
  cancelBeforeMinutes: 12 * 60,
  needCoachConfirm: false,
};

export const defaultRules: GymRules = {
  referralsPerMonth: 1,
  referralRequiresInviterSameDay: true,
  sameDayReentryFree: true,
  expiryReminderDays: 7,
  freezeRules: defaultFreezeRules,
  classRules: defaultClassRules,
  ptRules: defaultPtRules,
};

export const defaultFeatures: GymFeatures = {
  countCardSharing: true,
  referral: true,
  groupClasses: true,
  personalTraining: true,
  events: true,
};

type GymRulesInput = Partial<Omit<GymRules, 'freezeRules' | 'classRules' | 'ptRules'>> & {
  freezeRules?: Partial<FreezeRules>;
  classRules?: Partial<ClassRules>;
  ptRules?: Partial<PtRules>;
};
type GymInput = Omit<GymConfig, 'rules' | 'features'> & { rules?: GymRulesInput; features?: Partial<GymFeatures> };

export function defineGym(input: GymInput): GymConfig {
  return {
    ...input,
    rules: {
      ...defaultRules,
      ...input.rules,
      freezeRules: { ...defaultFreezeRules, ...input.rules?.freezeRules },
      classRules: { ...defaultClassRules, ...input.rules?.classRules },
      ptRules: { ...defaultPtRules, ...input.rules?.ptRules },
    },
    features: { ...defaultFeatures, ...input.features },
  };
}
