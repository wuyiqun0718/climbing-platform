import type { DateKey } from '@climb/utils';

/**
 * 团课：课程种类 → 排出来的一节节课 → 会员的预约。小程序（任务 28–30）和后台（mvp/dashboard 任务 25–27）共用这里的类型和规则。
 * 约课扣团课课包（LessonCard kind = 'class'）的次数；规则里等馆方定的都在 GymRules.classRules。
 * 函数都不改入参，返回改好的预约、卡和要记的流水（CardChange），调用方在同一个事务里写库、写流水。
 */

/** 团课课程种类（后台任务 25 建）：比如「入门抱石」。排课时把人数上限、时长拷到 ClassSession，改种类不影响已排的课 */
export interface ClassType {
  id: string;
  name: string;
  /** 一节课多少分钟 */
  minutes: number;
  /** 默认人数上限 */
  capacity: number;
  /** 约一节扣团课课包几次（默认 1） */
  credits: number;
  /** 默认教练（员工 id） */
  coachId?: string;
  /** 停用后不能再排新课，已排的照常上 */
  active: boolean;
}

/** 一节课的状态：scheduled 正常；cancelled 被岩馆取消（已约的全部退次） */
export type ClassSessionStatus = 'scheduled' | 'cancelled';

/** 排出来的一节课（后台任务 26 排）。时间是门店当地时间 */
export interface ClassSession {
  id: string;
  classTypeId: string;
  /** 课名，排课时从 ClassType 拷过来 */
  name: string;
  storeId: string;
  on: DateKey;
  /** 开始时间 HH:mm */
  startTime: string;
  minutes: number;
  capacity: number;
  credits: number;
  coachId?: string;
  status: ClassSessionStatus;
  /** 岩馆取消时填的原因 */
  cancelReason?: string;
}

/**
 * 预约的状态：
 * - booked：约上了，已经扣了次数
 * - waitlisted：满员排候补，还没扣次；有人取消时按排队先后自动补上（变 booked 并扣次）
 * - cancelled：会员自己或前台取消；booked 的取消在截止前退次，候补的取消不涉及次数
 * - voided：这节课被岩馆取消，booked 的退次
 * - attended：上课签到了（后台任务 27）
 * - absent：没来或迟到超过 lateGraceMinutes，次数不退
 */
export type ClassBookingStatus = 'booked' | 'waitlisted' | 'cancelled' | 'voided' | 'attended' | 'absent';

/** 会员约一节课的一条记录。同一会员同一节课只能有一条占位（booked / waitlisted） */
export interface ClassBooking {
  id: string;
  sessionId: string;
  memberId: string;
  status: ClassBookingStatus;
  /** 扣次用的课包；候补时记会员选的那张，补上时它不能用了就换一张能用的 */
  cardId: string;
  /** 下单时间（ISO），候补按它排队 */
  createdAt: string;
  /** 实际扣了几次；取消、课程取消按它退 */
  deducted: number;
  /** 取消、作废的时间（ISO） */
  closedAt?: string;
}

// 以上类型从小程序分支 mvp/miniapp 的 classes.ts 原样拷过来（同名同字段）；约课、取消、候补补位等规则函数在那边，合并时整份用那边的。
// 后台建课程种类、排课的校验在 classTypes.ts。
